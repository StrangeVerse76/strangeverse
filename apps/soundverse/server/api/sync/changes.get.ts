import { changesSince } from '../../sync/store'
import { parseSince } from '../../sync/rules'

const PAGE = 200

/** I record cambiati dopo la versione `since`. Se `more` è vero, si richiede con l'ultima `seq`. */
export default defineEventHandler(async (event) => {
  const user = await requireOwner(event)
  const db = useDb()
  if (!db) throw createError({ statusCode: 503, statusMessage: 'Database non configurato' })
  let since: number
  try {
    since = parseSince(getQuery(event).since)
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error).message })
  }
  return changesSince(db, user.id, since, PAGE)
})
