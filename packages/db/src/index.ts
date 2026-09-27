import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export * from './schema'

/** Un client Drizzle su Neon via HTTP: niente connessioni da tenere aperte fra una funzione e l'altra. */
export function createDb(url: string) {
  return drizzle(neon(url), { schema })
}

export type Db = ReturnType<typeof createDb>
