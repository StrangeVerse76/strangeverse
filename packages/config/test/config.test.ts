import { describe, expect, it } from 'vitest'
import eslintConfig, { createConfig } from '../eslint.js'
import prettierConfig from '../prettier.js'

describe('@strangeverse/config', () => {
  it('esporta una configurazione ESLint non vuota', () => {
    expect(eslintConfig.length).toBeGreaterThan(0)
  })

  it('aggiunge le configurazioni extra prima di quella di Prettier', () => {
    const extra = { rules: { 'no-console': 'error' as const } }
    const config = createConfig(extra)
    expect(config).toContain(extra)
    expect(config.indexOf(extra)).toBeLessThan(config.length - 1)
  })

  it('usa lo stile Prettier concordato', () => {
    expect(prettierConfig).toMatchObject({ semi: false, singleQuote: true })
  })
})
