import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Lo stesso alias di Nuxt, così i moduli dell'app si importano anche nei test.
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
