import { removeAudio } from '../../sync/blob'
import { audioPath, blobEnv, parsePush } from '../../sync/rules'
import { pushOne } from '../../sync/store'

/** Scrive le modifiche del browser. Ogni record torna `ok` (con la nuova versione) o `conflict`. */
export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const db = useDb()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database non configurato' })
  let items
  try {
    items = parsePush(await readBody(event))
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
  const results = []
  // Uno alla volta: pochi record per invio, e l'ordine resta quello del browser.
  for (const item of items) {
    const path = item.audioBytes !== null ? audioPath(blobEnv(), item.id) : null
    const outcome = await pushOne(db, user.id, item, path)
    if (outcome.status === 'ok' && item.deleted && item.kind === 'clip') {
      await removeAudio(audioPath(blobEnv(), item.id))
    }
    results.push(outcome)
  }
  return { results }
})
