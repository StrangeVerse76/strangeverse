import { createDb } from '@strangeverse/db'
import { user } from '@strangeverse/db/schema'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PushItem } from '../../server/sync/rules'
import { audioUsage, changesSince, clipAudioPath, pushOne } from '../../server/sync/store'

// Test d'integrazione su un Postgres vero: gira solo con DATABASE_URL (il branch Neon `sviluppo`),
// quindi non in CI. Da apps/soundverse: `node --env-file=.env.local node_modules/vitest/vitest.mjs run sync-store`.
const url = process.env.DATABASE_URL

describe.skipIf(!url)('sincronizzazione sul database', () => {
  // neon() vuole una stringa anche quando il test è saltato; non si collega finché non si usa.
  const db = createDb(url ?? 'postgresql://salta@localhost/salta')
  const ownerId = `test-${crypto.randomUUID()}`
  const clip = (extra: Partial<PushItem> = {}): PushItem => ({
    kind: 'clip',
    id: 'c1',
    data: { name: 'Clip' },
    deleted: false,
    base: null,
    audioBytes: null,
    ...extra,
  })

  beforeAll(async () => {
    await db.insert(user).values({ id: ownerId, name: 'Test', email: `${ownerId}@example.com` })
  })
  // I record del proprietario di prova spariscono con lui (on delete cascade).
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, ownerId))
  })

  it('un record nuovo prende una versione e compare fra le modifiche', async () => {
    const first = await pushOne(db, ownerId, clip({ audioBytes: 1000 }), 'development/audio/c1.wav')
    expect(first.status).toBe('ok')
    const { records, more } = await changesSince(db, ownerId, 0, 10)
    expect(more).toBe(false)
    expect(records).toMatchObject([{ kind: 'clip', id: 'c1', hasAudio: true, deleted: false }])
    expect(await clipAudioPath(db, ownerId, 'c1')).toBe('development/audio/c1.wav')
    expect(await audioUsage(db, ownerId)).toBe(1000)
  })

  it('si aggiorna partendo dalla versione giusta, altrimenti è un conflitto', async () => {
    const [current] = (await changesSince(db, ownerId, 0, 10)).records
    const base = current?.seq ?? 0
    const renamed = await pushOne(db, ownerId, clip({ base, data: { name: 'Nuovo' } }), null)
    expect(renamed.status).toBe('ok')
    // Una rinomina senza audio non tocca l'audio già caricato.
    expect(await clipAudioPath(db, ownerId, 'c1')).toBe('development/audio/c1.wav')
    if (renamed.status !== 'ok') return
    expect(renamed.seq).toBeGreaterThan(base)

    // Un secondo dispositivo parte ancora dalla vecchia versione.
    const stale = await pushOne(db, ownerId, clip({ base, data: { name: 'Altro' } }), null)
    expect(stale).toMatchObject({ status: 'conflict', current: { data: { name: 'Nuovo' } } })

    // Lo stesso invio ripetuto (risposta persa) non è un conflitto.
    const again = await pushOne(db, ownerId, clip({ base, data: { name: 'Nuovo' } }), null)
    expect(again).toMatchObject({ status: 'ok', seq: renamed.seq })

    // Solo le modifiche dopo `since`.
    expect((await changesSince(db, ownerId, renamed.seq, 10)).records).toEqual([])
  })

  it('un’eliminazione resta come record e libera lo spazio', async () => {
    const [current] = (await changesSince(db, ownerId, 0, 10)).records
    const gone = await pushOne(db, ownerId, clip({ base: current?.seq ?? 0, deleted: true }), null)
    expect(gone.status).toBe('ok')
    const [row] = (await changesSince(db, ownerId, 0, 10)).records
    expect(row).toMatchObject({ deleted: true, hasAudio: false })
    expect(await clipAudioPath(db, ownerId, 'c1')).toBeNull()
    expect(await audioUsage(db, ownerId)).toBe(0)
  })

  it('le pagine di modifiche seguono le versioni', async () => {
    for (const id of ['p1', 'p2', 'p3']) {
      await pushOne(db, ownerId, { ...clip({ id }), kind: 'project' }, null)
    }
    const page = await changesSince(db, ownerId, 0, 2)
    expect(page.more).toBe(true)
    const rest = await changesSince(db, ownerId, page.records.at(-1)?.seq ?? 0, 10)
    expect([...page.records, ...rest.records].map((r) => r.id)).toEqual(['c1', 'p1', 'p2', 'p3'])
  })
})
