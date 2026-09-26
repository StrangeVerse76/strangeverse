import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Configurazione ESLint di base condivisa da tutto il monorepo.
 * Le app Nuxt la estendono aggiungendo le regole per Vue.
 *
 * @param {...import('eslint').Linter.Config} extra configurazioni aggiuntive
 */
export function createConfig(...extra) {
  return defineConfig(
    {
      ignores: ['**/dist/**', '**/.output/**', '**/.nuxt/**', '**/.turbo/**', '**/coverage/**'],
    },
    js.configs.recommended,
    tseslint.configs.strict,
    {
      languageOptions: {
        globals: { ...globals.node },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
      },
    },
    ...extra,
    // Sempre per ultimo: disattiva le regole di stile che competono con Prettier.
    prettier,
  )
}

export default createConfig()
