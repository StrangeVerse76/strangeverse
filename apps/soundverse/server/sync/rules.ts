import { RECORD_KINDS, type RecordKind } from '@strangeverse/db/schema'

/** Una modifica mandata dal browser. */
export interface PushItem {
  kind: RecordKind
  id: string
  /** Il record com'è in IndexedDB (per i clip: i metadati con la ricetta, senza audio). */
  data: Record<string, unknown>
  deleted: boolean
  /** La versione del server da cui parte la modifica; `null` per un record nuovo. */
  base: number | null
  /** Dimensione dell'audio già caricato su Blob (solo clip importati e registrati). */
  audioBytes: number | null
}

export type PushOutcome =
  | { kind: RecordKind; id: string; status: 'ok'; seq: number }
  /** Il server ha una versione diversa da quella di partenza: decide il browser (#61). */
  | { kind: RecordKind; id: string; status: 'conflict'; current: RemoteRecord }

export interface RemoteRecord {
  kind: RecordKind
  id: string
  data: unknown
  hasAudio: boolean
  audioBytes: number | null
  seq: number
  deleted: boolean
}

export const MAX_PUSH_ITEMS = 100
/** Più di quanto serva a un clip lungo (24 bit stereo, circa 17 MB al minuto). */
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024

const ID = /^[\w-]{1,64}$/

/** Il percorso su Blob dell'audio di un clip: lo decide sempre il server. */
export function audioPath(env: string, clipId: string) {
  if (!ID.test(clipId)) throw new Error('id del clip non valido')
  return `${env}/audio/${clipId}.wav`
}

/** L'ambiente per il prefisso su Blob: `production`, `preview` o `development`. */
export const blobEnv = () => process.env.VERCEL_ENV ?? 'development'

/** Controlla e normalizza il corpo di una richiesta di push; lancia un errore se non va. */
export function parsePush(body: unknown): PushItem[] {
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items)) throw new Error('manca items')
  if (items.length > MAX_PUSH_ITEMS)
    throw new Error(`al massimo ${MAX_PUSH_ITEMS} record per volta`)
  return items.map((raw, i) => {
    const item = raw as Partial<PushItem>
    const where = `record ${i}`
    if (!RECORD_KINDS.includes(item.kind as RecordKind))
      throw new Error(`${where}: tipo non valido`)
    if (typeof item.id !== 'string' || !ID.test(item.id)) throw new Error(`${where}: id non valido`)
    if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
      throw new Error(`${where}: data deve essere un oggetto`)
    }
    const base = item.base ?? null
    if (base !== null && !Number.isSafeInteger(base)) throw new Error(`${where}: base non valida`)
    const audioBytes = item.audioBytes ?? null
    if (audioBytes !== null) {
      if (item.kind !== 'clip') throw new Error(`${where}: solo i clip hanno audio`)
      if (!Number.isSafeInteger(audioBytes) || audioBytes <= 0 || audioBytes > MAX_AUDIO_BYTES) {
        throw new Error(`${where}: dimensione dell'audio non valida`)
      }
    }
    return {
      kind: item.kind as RecordKind,
      id: item.id,
      data: item.data as Record<string, unknown>,
      deleted: item.deleted === true,
      base,
      audioBytes,
    }
  })
}

/** Uguaglianza strutturale di due valori JSON (l'ordine delle chiavi non conta). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) =>
    sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

/**
 * Una scrittura rifiutata perché la versione è cambiata: se il server ha già esattamente
 * quello che il browser manda (per esempio un invio ripetuto dopo una risposta persa), va bene.
 */
export function isSameWrite(item: PushItem, current: RemoteRecord) {
  return item.deleted === current.deleted && (item.deleted || sameJson(item.data, current.data))
}

/** Il cursore di `changes`: la versione più alta già vista (0 = dall'inizio). */
export function parseSince(value: unknown): number {
  const since = Number(value ?? 0)
  if (!Number.isSafeInteger(since) || since < 0) throw new Error('since non valido')
  return since
}
