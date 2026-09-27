import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    // I primi test unitari arrivano con il motore audio (#8).
    passWithNoTests: true,
  },
})
