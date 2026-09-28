import { audioUsage } from '../../sync/store'

/** Spazio occupato dall'audio su Blob e quota del piano gratuito (1 GB, ADR 0011). */
export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const db = useDb()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database non configurato' })
  return { audioBytes: await audioUsage(db, user.id), quotaBytes: 1024 ** 3 }
})
