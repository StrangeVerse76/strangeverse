import { defineConfig } from 'drizzle-kit'

// Solo per generare le migrazioni dallo schema: `pnpm db:generate` non si collega al database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
})
