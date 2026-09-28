import { readdirSync, readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { RECORD_KINDS, records, session } from '../src/schema'

const migrations = new URL('../migrations/', import.meta.url)
const sql = readdirSync(migrations)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrations), 'utf8'))
  .join('\n')

describe('schema', () => {
  it('i record si distinguono per proprietario, tipo e id', () => {
    const config = getTableConfig(records)
    expect(config.primaryKeys[0]?.columns.map((c) => c.name)).toEqual(['owner_id', 'kind', 'id'])
    expect(RECORD_KINDS).toEqual(['clip', 'project', 'kit'])
  })

  it('le migrazioni creano ogni tabella dello schema', () => {
    for (const table of ['user', 'session', 'account', 'verification', 'passkey', 'records']) {
      expect(sql).toContain(`CREATE TABLE "${table}"`)
    }
  })

  it('le sessioni spariscono con il loro utente', () => {
    const fk = getTableConfig(session).foreignKeys[0]
    expect(fk?.onDelete).toBe('cascade')
  })
})
