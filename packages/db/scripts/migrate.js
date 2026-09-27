// Applica le migrazioni in `migrations/`. Senza database (CI, build locale) non fa niente.
// Su Vercel gira prima della build: le anteprime sul loro branch Neon, la produzione sul suo.
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
if (!url) {
  console.log('db:migrate: nessun DATABASE_URL, salto le migrazioni')
} else {
  await migrate(drizzle(neon(url)), {
    migrationsFolder: new URL('../migrations', import.meta.url).pathname,
  })
  console.log('db:migrate: migrazioni applicate')
}
