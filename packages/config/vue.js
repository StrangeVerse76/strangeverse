import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { createConfig } from './eslint.js'

/**
 * Configurazione ESLint per i pacchetti Nuxt/Vue: la base del monorepo più le regole Vue,
 * con TypeScript dentro i blocchi `<script lang="ts">`.
 *
 * @param {...import('eslint').Linter.Config} extra configurazioni aggiuntive
 */
export function createVueConfig(...extra) {
  return createConfig(
    ...pluginVue.configs['flat/recommended'],
    {
      files: ['**/*.vue'],
      languageOptions: {
        parserOptions: {
          parser: tseslint.parser,
          extraFileExtensions: ['.vue'],
          sourceType: 'module',
        },
        globals: { ...globals.browser },
      },
      rules: {
        // Nuxt importa in automatico componenti e composable: il controllo lo fa vue-tsc.
        'no-undef': 'off',
      },
    },
    {
      // Nomi imposti dalle convenzioni di Nuxt.
      files: ['**/pages/**/*.vue', '**/layouts/**/*.vue', '**/app.vue', '**/error.vue'],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
    ...extra,
  )
}

export default createVueConfig()
