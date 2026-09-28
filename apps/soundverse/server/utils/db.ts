import { createDb, type Db } from '@strangeverse/db'

let db: Db | undefined

/** Il database, se questo ambiente ne ha uno (in CI e nelle build locali non c'è). */
export function useDb(): Db | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  db ??= createDb(url)
  return db
}
