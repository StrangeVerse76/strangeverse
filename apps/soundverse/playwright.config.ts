import { defineConfig, devices } from '@playwright/test'

// Con PLAYWRIGHT_BASE_URL (es. l'anteprima Vercel) i test girano su quell'indirizzo;
// altrimenti si avvia la build locale (`pnpm build` deve essere già stato eseguito).
const baseURL = process.env.PLAYWRIGHT_BASE_URL
// PLAYWRIGHT_CHANNEL=chrome usa il Chrome installato invece del Chromium scaricato da Playwright.
const channel = process.env.PLAYWRIGHT_CHANNEL
// Porta diversa dal portale: Turborepo può eseguire gli e2e delle app in parallelo.
const port = 3101

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: baseURL ?? `http://localhost:${port}`,
    trace: 'on-first-retry',
    // Microfono finto di Chrome (un tono di prova), senza la richiesta di permesso.
    permissions: ['microphone'],
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  ...(baseURL
    ? {}
    : {
        webServer: {
          command: 'node .output/server/index.mjs',
          url: `http://localhost:${port}`,
          env: { PORT: String(port) },
          reuseExistingServer: !process.env.CI,
        },
      }),
})
