import type { Db } from '@strangeverse/db'
import { records, type RecordRow } from '@strangeverse/db/schema'
import { and, asc, eq, gt, isNotNull, isNull, sql, sum } from 'drizzle-orm'
import { isSameWrite, type PushItem, type PushOutcome, type RemoteRecord } from './rules'

const nextSeq = sql`nextval(pg_get_serial_sequence('records', 'seq'))`

export function toRemote(row: RecordRow): RemoteRecord {
  return {
    kind: row.kind,
    id: row.id,
    data: row.data,
    hasAudio: !!row.audioPath,
    audioBytes: row.audioBytes,
    seq: row.seq,
    deleted: !!row.deletedAt,
  }
}

const key = (ownerId: string, item: Pick<PushItem, 'kind' | 'id'>) =>
  and(eq(records.ownerId, ownerId), eq(records.kind, item.kind), eq(records.id, item.id))

/** I record cambiati dopo la versione `since`, in ordine, al massimo `limit`. */
export async function changesSince(db: Db, ownerId: string, since: number, limit: number) {
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.ownerId, ownerId), gt(records.seq, since)))
    .orderBy(asc(records.seq))
    .limit(limit + 1)
  return { records: rows.slice(0, limit).map(toRemote), more: rows.length > limit }
}

/**
 * Scrive un record solo se il server è ancora alla versione `base` da cui parte il browser.
 * Ogni istruzione è atomica: il controllo della versione sta nella stessa UPDATE (o INSERT).
 */
export async function pushOne(
  db: Db,
  ownerId: string,
  item: PushItem,
  path: string | null,
): Promise<PushOutcome> {
  const now = new Date()
  const values = {
    data: item.data,
    updatedAt: now,
    deletedAt: item.deleted ? now : null,
    // Senza audio nella richiesta (per esempio una rinomina) resta quello che c'era;
    // un'eliminazione lo toglie.
    ...(item.deleted
      ? { audioPath: null, audioBytes: null }
      : path !== null && { audioPath: path, audioBytes: item.audioBytes }),
  }
  const written =
    item.base === null
      ? await db
          .insert(records)
          .values({ ownerId, kind: item.kind, id: item.id, ...values })
          .onConflictDoNothing()
          .returning({ seq: records.seq })
      : await db
          .update(records)
          .set({ ...values, seq: nextSeq })
          .where(and(key(ownerId, item), eq(records.seq, item.base)))
          .returning({ seq: records.seq })
  const [ok] = written
  if (ok) return { kind: item.kind, id: item.id, status: 'ok', seq: ok.seq }

  const [row] = await db.select().from(records).where(key(ownerId, item))
  if (!row) throw new Error(`record ${item.kind}/${item.id} sparito durante la scrittura`)
  const current = toRemote(row)
  if (isSameWrite(item, current))
    return { kind: item.kind, id: item.id, status: 'ok', seq: row.seq }
  return { kind: item.kind, id: item.id, status: 'conflict', current }
}

/** Il percorso dell'audio di un clip, se c'è (per firmare il download). */
export async function clipAudioPath(db: Db, ownerId: string, id: string) {
  const [row] = await db
    .select({ path: records.audioPath })
    .from(records)
    .where(and(key(ownerId, { kind: 'clip', id }), isNull(records.deletedAt)))
  return row?.path ?? null
}

/** Byte di audio occupati su Blob dai clip non eliminati. */
export async function audioUsage(db: Db, ownerId: string) {
  const [row] = await db
    .select({ bytes: sum(records.audioBytes) })
    .from(records)
    .where(and(eq(records.ownerId, ownerId), isNotNull(records.audioPath)))
  return Number(row?.bytes ?? 0)
}
