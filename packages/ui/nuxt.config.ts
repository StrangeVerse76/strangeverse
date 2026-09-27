import { fileURLToPath } from 'node:url'

// Layer condiviso: ogni app lo usa con `extends: ['@strangeverse/ui']`.
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  modules: ['@nuxtjs/color-mode'],
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],

  colorMode: {
    // Classe `dark` o `light` su <html>; senza scelta esplicita segue il sistema.
    classSuffix: '',
    preference: 'system',
    fallback: 'dark',
    storageKey: 'strangeverse-color-mode',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'it' },
      meta: [
        { name: 'theme-color', content: '#0d0b14', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#faf8f5', media: '(prefers-color-scheme: light)' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  typescript: {
    strict: true,
  },
})
