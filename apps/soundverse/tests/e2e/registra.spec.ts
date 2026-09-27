import { expect, test, type Page } from '@playwright/test'
import { readStore } from './helpers/idb'

// Il microfono è quello finto di Chrome (vedi playwright.config.ts): un tono di prova.
const panel = (page: Page) => page.getByRole('region', { name: 'Registra' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await panel(page).scrollIntoViewIfNeeded()
  await panel(page).getByRole('button', { name: 'Attiva ingresso' }).click()
  await expect(panel(page).getByRole('meter', { name: "Livello d'ingresso" })).toBeVisible()
})

test('il misuratore di livello si muove con l’ingresso', async ({ page }) => {
  await expect
    .poll(async () => Number(await panel(page).getByRole('meter').getAttribute('aria-valuenow')), {
      timeout: 5000,
    })
    .toBeGreaterThan(-60)
})

test('registra e salva un clip non muto della durata giusta', async ({ page }) => {
  await panel(page).getByRole('textbox', { name: 'Nome della registrazione' }).fill('Voce')
  await panel(page).getByRole('button', { name: '● Registra' }).click()
  await expect(panel(page).getByText(/In registrazione/)).toBeVisible()
  await page.waitForTimeout(1500)
  await panel(page).getByRole('button', { name: '■ Stop' }).click()

  const clip = page
    .getByRole('region', { name: 'Libreria' })
    .getByRole('button', { name: /^Voce / })
  await expect(clip).toContainText('Campione · 0:01.')
  await expect
    .poll(async () => {
      const clips = await readStore<{ name: string; peak: number; duration: number }>(page, 'clips')
      const voce = clips.find((c) => c.name === 'Voce')
      return voce ? voce.peak > 0.01 && voce.duration > 1.2 && voce.duration < 2 : false
    })
    .toBe(true)
})

test('con il conteggio la registrazione parte dopo una battuta', async ({ page }) => {
  await panel(page).getByRole('combobox', { name: 'Battute di conteggio' }).selectOption('1')
  const bpm = panel(page).getByRole('slider', { name: 'BPM' })
  await bpm.focus()
  await page.keyboard.press('End') // 240 BPM: una battuta dura 1 s
  await panel(page).getByRole('button', { name: '● Registra' }).click()
  await expect(panel(page).getByText(/Conteggio… \d/)).toBeVisible()
  await expect(panel(page).getByText(/In registrazione/)).toBeVisible({ timeout: 3000 })
  await panel(page).getByRole('button', { name: '■ Stop' }).click()
})
