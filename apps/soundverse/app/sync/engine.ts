import { SAMPLE_RATE } from '~/audio/constants'
import { decodeAudio } from '~/audio/decode'
import { encodeWav } from '~/audio/wav'
import * as storage from '~/library/db'
import type { StoredProject, SyncEntry, SyncKind } from '~/library/db'
import { isRenderable, recipeSources, renderRecipe } from '~/library/recipes'
import type { Clip } from '~/library/types'
import type { Kit } from '~/pads/kit'
import { resolveConflict, type Versioned } from './conflicts'
import { isPristine } from './pristine'

/** Un record come lo restituisce il server (`server/sync/rules.ts`). */
export interface RemoteRecord {
  kind: SyncKind
  id: string
  data: unknown
  hasAudio: boolean
  audioBytes: number | null
  seq: number
  deleted: boolean
}

type Outcome =
  | { kind: SyncKind; id: string; status: 'ok'; seq: number }
  | { kind: SyncKind; id: string; status: 'conflict'; current: RemoteRecord }

export interface SyncReport {
  received: number
  sent: number
  /** Clip ricevuti che aspettano ancora una sorgente per essere rifatti. */
  waiting: number
  /** Id dei record toccati dal server: gli store li ricaricano. */
  changed: Set<string>
  /** Un conflitto vinto dalla versione locale: va rimandata. */
  retry: boolean
}

const CURSOR = 'cursor'
const PENDING = 'pending'
const PUSH_BATCH = 50

async function api<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const response = await fetch(`/api/sync/${path}`, {
    method: init?.method ?? 'GET',
    headers: init ? { 'content-type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  })
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<T>
}

/** I clip importati e registrati: il loro audio va su Blob, gli altri si rifanno dalla ricetta. */
const hasOwnAudio = (clip: Clip) => !isRenderable(clip.recipe)

/** L'audio di un clip già in IndexedDB, decodificato: la sorgente di `renderRecipe`. */
async function localBuffer(id: string) {
  const audio = await storage.getAudio(id)
  return audio ? decodeAudio(await audio.arrayBuffer()) : undefined
}

// --- Ricezione ---

/**
 * Applica i record ricevuti. Progetti, kit ed eliminazioni subito; i clip con il loro audio
 * (scaricato da Blob o rifatto dalla ricetta), in ordine di dipendenza. Quelli la cui sorgente
 * non c'è ancora restano in attesa per la prossima sincronizzazione.
 */
async function applyIncoming(records: RemoteRecord[], report: SyncReport) {
  const clips: RemoteRecord[] = []
  for (const record of records) {
    const entry = await storage.getEntry(record.kind, record.id)
    // Una modifica locale non ancora inviata: la risolve l'invio, come conflitto.
    if (entry?.dirty) continue
    if (record.deleted) {
      await storage.applyRemote(record.kind, record.id, record.seq, null)
      report.changed.add(record.id)
    } else if (record.kind === 'clip') {
      clips.push(record)
    } else {
      await storage.applyRemote(
        record.kind,
        record.id,
        record.seq,
        record.data as StoredProject | Kit,
      )
      report.changed.add(record.id)
    }
  }

  // Scarichi: un solo giro di URL firmati per tutti i clip che hanno audio proprio.
  const withAudio = clips.filter((c) => c.hasAudio)
  if (withAudio.length) {
    const { urls } = await api<{ urls: Record<string, string> }>('audio', {
      method: 'POST',
      body: { op: 'get', ids: withAudio.map((c) => c.id) },
    })
    for (const record of withAudio) {
      const url = urls[record.id]
      if (!url) continue
      const response = await fetch(url)
      if (!response.ok) throw new Error(`audio ${record.id}: ${response.status}`)
      const audio = new Blob([await response.arrayBuffer()], { type: 'audio/wav' })
      await storage.applyRemote('clip', record.id, record.seq, record.data as Clip, audio)
      report.changed.add(record.id)
    }
  }

  const pending = [
    ...((await storage.getMeta<RemoteRecord[]>(PENDING)) ?? []),
    ...clips.filter((c) => !c.hasAudio),
  ]
  await storage.setMeta(PENDING, await renderPending(pending, report))
}

/** Rifà i clip in attesa appena le loro sorgenti ci sono; restituisce quelli ancora bloccati. */
async function renderPending(pending: RemoteRecord[], report: SyncReport) {
  // L'ultima versione di ogni clip, se è arrivato più volte.
  let queue = [...new Map(pending.map((r) => [r.id, r])).values()]
  let progress = true
  while (queue.length && progress) {
    progress = false
    const next: RemoteRecord[] = []
    for (const record of queue) {
      const clip = record.data as Clip
      const ready = await Promise.all(
        recipeSources(clip.recipe).map(async (id) => !!(await storage.getAudio(id))),
      )
      if (!ready.every(Boolean)) {
        next.push(record)
        continue
      }
      const channels = await renderRecipe(clip.recipe, localBuffer)
      const audio = new Blob([encodeWav(channels, SAMPLE_RATE)], { type: 'audio/wav' })
      await storage.applyRemote('clip', record.id, record.seq, clip, audio)
      report.changed.add(record.id)
      progress = true
    }
    queue = next
  }
  report.waiting = queue.length
  return queue
}

async function pull(report: SyncReport) {
  let since = (await storage.getMeta<number>(CURSOR)) ?? 0
  for (;;) {
    const page = await api<{ records: RemoteRecord[]; more: boolean }>(`changes?since=${since}`)
    await applyIncoming(page.records, report)
    report.received += page.records.length
    since = page.records.at(-1)?.seq ?? since
    // Il cursore avanza solo dopo aver applicato la pagina: un'interruzione la fa ripetere.
    await storage.setMeta(CURSOR, since)
    if (!page.more) break
  }
}

// --- Invio ---

interface PushItem {
  kind: SyncKind
  id: string
  data: Record<string, unknown>
  deleted: boolean
  base: number | null
  audioBytes: number | null
}

/** Carica su Blob l'audio di un clip importato o registrato, se il server non l'ha ancora. */
async function uploadAudio(entry: SyncEntry): Promise<number> {
  const audio = await storage.getAudio(entry.id)
  if (!audio) throw new Error(`audio del clip ${entry.id} mancante`)
  if (entry.seq !== null) return audio.size
  const { urls } = await api<{ urls: string[] }>('audio', {
    method: 'POST',
    body: { op: 'put', ids: [entry.id], bytes: audio.size },
  })
  const response = await fetch(urls[0] ?? '', {
    method: 'PUT',
    headers: { 'content-type': 'audio/wav' },
    body: audio,
  })
  if (!response.ok) throw new Error(`caricamento ${entry.id}: ${response.status}`)
  return audio.size
}

async function toPushItem(entry: SyncEntry): Promise<PushItem | 'wait' | null> {
  const base = { kind: entry.kind, id: entry.id, base: entry.seq, audioBytes: null }
  if (entry.deleted) {
    // Mai visto dal server e già eliminato: non c'è niente da dirgli.
    if (entry.seq === null) return null
    return { ...base, data: {}, deleted: true }
  }
  const record = await storage.getRecord(entry.kind, entry.id)
  if (!record) return null
  // Il progetto o kit vuoto creato da solo da questo browser resta qui finché non lo si usa.
  if (entry.seq === null && entry.kind !== 'clip' && isPristine(entry.kind, record)) return 'wait'
  const item: PushItem = { ...base, data: record as never, deleted: false }
  if (entry.kind === 'clip' && hasOwnAudio(record as Clip))
    item.audioBytes = await uploadAudio(entry)
  return item
}

async function push(report: SyncReport) {
  const entries = await storage.dirtyEntries()
  for (let i = 0; i < entries.length; i += PUSH_BATCH) {
    const batch = entries.slice(i, i + PUSH_BATCH)
    const items: PushItem[] = []
    const sent: SyncEntry[] = []
    for (const entry of batch) {
      const item = await toPushItem(entry)
      if (item === 'wait') continue
      if (item) {
        items.push(item)
        sent.push(entry)
      } else {
        await storage.confirmSent(entry, entry.seq ?? 0)
      }
    }
    if (!items.length) continue
    const { results } = await api<{ results: Outcome[] }>('push', {
      method: 'POST',
      body: { items },
    })
    for (const [j, outcome] of results.entries()) {
      const entry = sent[j]
      if (!entry) continue
      if (outcome.status === 'ok') {
        await storage.confirmSent(entry, outcome.seq)
        report.sent++
      } else {
        await settleConflict(entry, items[j] as PushItem, outcome.current, report)
      }
    }
  }
}

/**
 * Un conflitto: il server ha un'altra versione. Per i clip vince il server (si cambiano solo
 * nome, tag e analisi). Per progetti e kit vince la modifica più recente, e l'altra resta come
 * copia "(conflitto)": così non si perde niente.
 */
async function settleConflict(
  entry: SyncEntry,
  item: PushItem,
  remote: RemoteRecord,
  report: SyncReport,
) {
  const decision = resolveConflict(
    entry.kind,
    item.deleted ? null : (item.data as unknown as Versioned),
    remote.deleted ? null : (remote.data as Versioned),
  )
  if (decision.keep === 'remote') {
    // Entra la versione del server. Per un clip l'audio non cambia mai: resta quello locale.
    const value = remote.deleted ? null : (remote.data as Clip | StoredProject | Kit)
    await storage.applyRemote(entry.kind, entry.id, remote.seq, value)
  } else {
    // Resta la nostra: si rimanda partendo dalla versione del server (rev −1: resta "dirty").
    await storage.confirmSent({ ...entry, rev: -1 }, remote.seq)
    report.retry = true
  }
  if (decision.copy) {
    const copy = { ...decision.copy, id: crypto.randomUUID() }
    if (entry.kind === 'project') await storage.saveProject(copy as StoredProject)
    if (entry.kind === 'kit') await storage.saveKit(copy as Kit)
  }
  report.changed.add(entry.id)
}

/** Un giro completo: prima si riceve, poi si invia (e si riceve di nuovo se c'erano conflitti). */
export async function syncOnce(): Promise<SyncReport> {
  const report: SyncReport = {
    received: 0,
    sent: 0,
    waiting: 0,
    changed: new Set(),
    retry: false,
  }
  await pull(report)
  // Al massimo tre giri: un conflitto vinto in locale si rimanda subito.
  for (let round = 0; round < 3; round++) {
    report.retry = false
    await push(report)
    if (!report.retry) break
  }
  return report
}

export interface Usage {
  audioBytes: number
  quotaBytes: number
}

export const fetchUsage = () => api<Usage>('usage')
