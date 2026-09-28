import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from 'idb'
import type { Kit } from '~/pads/kit'
import type { TimelineProject } from '~/timeline/model'
import type { Clip } from './types'

/** Un progetto della timeline salvato. */
export interface StoredProject {
  id: string
  name: string
  project: TimelineProject
  /** Millisecondi dall'epoch. */
  updatedAt: number
}

export type SyncKind = 'clip' | 'project' | 'kit'

/**
 * Lo stato di sincronizzazione di un record (ADR 0011). Ogni salvataggio locale lo segna
 * `dirty` nella stessa transazione; i record ricevuti dal server no.
 */
export interface SyncEntry {
  /** `<kind>:<id>` */
  key: string
  kind: SyncKind
  id: string
  /** Versione del server da cui parte la copia locale; `null` se il server non l'ha mai vista. */
  seq: number | null
  dirty: boolean
  deleted: boolean
  /** Cresce a ogni modifica locale: un invio lo azzera solo se nel frattempo non è cambiato. */
  rev: number
}

interface SoundverseDB extends DBSchema {
  clips: { key: string; value: Clip }
  /** WAV a 24 bit, con la stessa chiave del clip. */
  audio: { key: string; value: Blob }
  projects: { key: string; value: StoredProject }
  kits: { key: string; value: Kit }
  sync: { key: string; value: SyncEntry }
  /** Piccoli valori della sincronizzazione (cursore, clip da rifare). */
  meta: { key: string; value: unknown }
}

type Names = StoreNames<SoundverseDB>
type Tx = IDBPTransaction<SoundverseDB, Names[], 'readwrite' | 'versionchange'>

export const syncKey = (kind: SyncKind, id: string) => `${kind}:${id}`

/** Segna un record come modificato qui, nella stessa transazione della scrittura. */
async function markDirty(tx: Tx, kind: SyncKind, id: string, deleted = false) {
  const store = tx.objectStore('sync')
  const key = syncKey(kind, id)
  const entry = await store.get(key)
  await store.put({
    key,
    kind,
    id,
    seq: entry?.seq ?? null,
    dirty: true,
    deleted,
    rev: (entry?.rev ?? 0) + 1,
  })
}

function notifyChange() {
  // La sincronizzazione (se attiva) ascolta questo evento per inviare le modifiche.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sv-local-change'))
}

let database: Promise<IDBPDatabase<SoundverseDB>> | null = null

/**
 * Avvisi sul database da mostrare all'utente:
 * - `blocked`: un'altra scheda tiene aperta una versione vecchia e l'aggiornamento aspetta;
 * - `ready`: l'attesa è finita;
 * - `stale`: un'altra scheda ha aggiornato il database, questa va ricaricata.
 */
export type DbNotice = 'blocked' | 'ready' | 'stale'
const listeners = new Set<(notice: DbNotice) => void>()

export function onDbNotice(listener: (notice: DbNotice) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const notify = (notice: DbNotice) => listeners.forEach((l) => l(notice))

function db() {
  if (database) return database
  let wasBlocked = false
  database = openDB<SoundverseDB>('soundverse', 4, {
    blocked() {
      wasBlocked = true
      notify('blocked')
    },
    // Un'altra scheda vuole una versione più nuova: questa si fa da parte invece di bloccarla.
    blocking() {
      void database?.then((d) => d.close())
      database = null
      notify('stale')
    },
    // Ogni versione aggiunge i suoi store: chi ha già il database li riceve senza perdere niente.
    async upgrade(upgrade, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        upgrade.createObjectStore('clips', { keyPath: 'id' })
        upgrade.createObjectStore('audio')
      }
      if (oldVersion < 2) upgrade.createObjectStore('projects', { keyPath: 'id' })
      if (oldVersion < 3) upgrade.createObjectStore('kits', { keyPath: 'id' })
      if (oldVersion < 4) {
        upgrade.createObjectStore('sync', { keyPath: 'key' })
        upgrade.createObjectStore('meta')
        // Quello che c'era prima della sincronizzazione va inviato alla prima occasione.
        const t = tx as unknown as Tx
        for (const id of await t.objectStore('clips').getAllKeys()) await markDirty(t, 'clip', id)
        for (const id of await t.objectStore('projects').getAllKeys()) {
          await markDirty(t, 'project', id)
        }
        for (const id of await t.objectStore('kits').getAllKeys()) await markDirty(t, 'kit', id)
      }
    },
  })
  void database.then(
    () => wasBlocked && notify('ready'),
    () => undefined,
  )
  return database
}

export async function listClips(): Promise<Clip[]> {
  return (await db()).getAll('clips')
}

/** Salva metadati e audio insieme: o entrambi o nessuno. */
export async function saveClip(clip: Clip, audio: Blob): Promise<void> {
  const tx = (await db()).transaction(['clips', 'audio', 'sync'], 'readwrite')
  await Promise.all([
    tx.objectStore('clips').put(clip),
    tx.objectStore('audio').put(audio, clip.id),
    markDirty(tx, 'clip', clip.id),
    tx.done,
  ])
  notifyChange()
}

export async function updateClip(clip: Clip): Promise<void> {
  const tx = (await db()).transaction(['clips', 'sync'], 'readwrite')
  await Promise.all([tx.objectStore('clips').put(clip), markDirty(tx, 'clip', clip.id), tx.done])
  notifyChange()
}

export async function getAudio(id: string): Promise<Blob | undefined> {
  return (await db()).get('audio', id)
}

export async function deleteClip(id: string): Promise<void> {
  const tx = (await db()).transaction(['clips', 'audio', 'sync'], 'readwrite')
  await Promise.all([
    tx.objectStore('clips').delete(id),
    tx.objectStore('audio').delete(id),
    markDirty(tx, 'clip', id, true),
    tx.done,
  ])
  notifyChange()
}

export async function listProjects(): Promise<StoredProject[]> {
  return (await db()).getAll('projects')
}

export async function saveProject(project: StoredProject): Promise<void> {
  const tx = (await db()).transaction(['projects', 'sync'], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').put(project),
    markDirty(tx, 'project', project.id),
    tx.done,
  ])
  notifyChange()
}

export async function deleteProject(id: string): Promise<void> {
  const tx = (await db()).transaction(['projects', 'sync'], 'readwrite')
  await Promise.all([
    tx.objectStore('projects').delete(id),
    markDirty(tx, 'project', id, true),
    tx.done,
  ])
  notifyChange()
}

export async function listKits(): Promise<Kit[]> {
  return (await db()).getAll('kits')
}

export async function saveKit(kit: Kit): Promise<void> {
  const tx = (await db()).transaction(['kits', 'sync'], 'readwrite')
  await Promise.all([tx.objectStore('kits').put(kit), markDirty(tx, 'kit', kit.id), tx.done])
  notifyChange()
}

export async function deleteKit(id: string): Promise<void> {
  const tx = (await db()).transaction(['kits', 'sync'], 'readwrite')
  await Promise.all([tx.objectStore('kits').delete(id), markDirty(tx, 'kit', id, true), tx.done])
  notifyChange()
}

// --- Sincronizzazione: scritture che arrivano dal server (non vanno rimandate indietro) ---

const storeOf = { clip: 'clips', project: 'projects', kit: 'kits' } as const

/** I record modificati qui e non ancora inviati. */
export async function dirtyEntries(): Promise<SyncEntry[]> {
  return (await db()).getAll('sync').then((all) => all.filter((e) => e.dirty))
}

export async function getEntry(kind: SyncKind, id: string) {
  return (await db()).get('sync', syncKey(kind, id))
}

/** Il record locale così com'è, da inviare. */
export async function getRecord(kind: SyncKind, id: string) {
  return (await db()).get(storeOf[kind], id)
}

/** Dopo un invio riuscito: la nuova versione, e "pulito" se nel frattempo non è cambiato. */
export async function confirmSent(entry: SyncEntry, seq: number) {
  const tx = (await db()).transaction('sync', 'readwrite')
  const current = await tx.store.get(entry.key)
  if (current) await tx.store.put({ ...current, seq, dirty: current.rev !== entry.rev })
  await tx.done
}

/** Scrive un record ricevuto dal server (o lo elimina), con la sua versione. */
export async function applyRemote(
  kind: SyncKind,
  id: string,
  seq: number,
  value: Clip | StoredProject | Kit | null,
  audio?: Blob,
) {
  const names: Names[] = kind === 'clip' ? ['clips', 'audio', 'sync'] : [storeOf[kind], 'sync']
  const tx = (await db()).transaction(names, 'readwrite')
  const writes: Promise<unknown>[] = []
  if (value === null) {
    writes.push(tx.objectStore(storeOf[kind]).delete(id))
    if (kind === 'clip') writes.push(tx.objectStore('audio').delete(id))
  } else {
    writes.push(tx.objectStore(storeOf[kind]).put(value as never))
    if (audio) writes.push(tx.objectStore('audio').put(audio, id))
  }
  const entry = await tx.objectStore('sync').get(syncKey(kind, id))
  writes.push(
    tx.objectStore('sync').put({
      key: syncKey(kind, id),
      kind,
      id,
      seq,
      dirty: false,
      deleted: value === null,
      rev: entry?.rev ?? 0,
    }),
  )
  await Promise.all([...writes, tx.done])
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get('meta', key) as Promise<T | undefined>
}

export async function setMeta(key: string, value: unknown) {
  await (await db()).put('meta', value, key)
}
