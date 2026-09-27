import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

/** Un tono di prova a 440 Hz, generato con lo stesso encoder dell'app. */
function toneWav(seconds: number, channels: 1 | 2 = 1): Buffer {
  const sampleRate = 48_000
  const length = Math.round(seconds * sampleRate)
  const data = Float32Array.from(
    { length },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
  )
  return Buffer.from(
    encodeWav(
      Array.from({ length: channels }, () => data),
      sampleRate,
    ),
  )
}

async function importTone(page: Page, name: string, seconds = 0.5, channels: 1 | 2 = 1) {
  await page.getByTestId('import-input').setInputFiles({
    name: `${name}.wav`,
    mimeType: 'audio/wav',
    buffer: toneWav(seconds, channels),
  })
}

const library = (page: Page) => page.getByRole('region', { name: 'Libreria' })
const clipButton = (page: Page, name: string) =>
  library(page)
    .getByRole('list', { name: 'Clip' })
    .getByRole('button', { name: new RegExp(name) })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(library(page).getByText('La libreria è vuota')).toBeVisible()
})

test('importa un file, lo mostra selezionato e lo conserva dopo il ricaricamento', async ({
  page,
}) => {
  await importTone(page, 'tono', 0.5, 2)

  const item = clipButton(page, 'tono')
  await expect(item).toHaveAttribute('aria-pressed', 'true')
  await expect(item).toContainText('Campione · 0:00.5 · stereo')
  await expect(page.getByRole('img', { name: "Forma d'onda di tono" })).toBeVisible()

  await page.reload()
  await expect(clipButton(page, 'tono')).toBeVisible()
})

test('ascolta un clip: il pulsante passa a Stop e torna ad Ascolta alla fine', async ({ page }) => {
  await importTone(page, 'breve', 0.4)

  const detail = page.getByRole('region', { name: 'Clip selezionato' })
  await detail.getByRole('button', { name: 'Ascolta' }).click()
  await expect(detail.getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Ascolta' })).toBeVisible({ timeout: 5_000 })
})

test('rinomina con doppio click, Invio conferma ed Esc annulla', async ({ page }) => {
  await importTone(page, 'vecchio')

  await clipButton(page, 'vecchio').dblclick()
  const input = page.getByRole('textbox', { name: 'Nuovo nome del clip' })
  await input.fill('nuovo')
  await input.press('Enter')
  await expect(clipButton(page, 'nuovo')).toBeVisible()

  await clipButton(page, 'nuovo').dblclick()
  await page.getByRole('textbox', { name: 'Nuovo nome del clip' }).fill('scartato')
  await page.getByRole('textbox', { name: 'Nuovo nome del clip' }).press('Escape')
  await expect(clipButton(page, 'nuovo')).toBeVisible()

  await page.reload()
  await expect(clipButton(page, 'nuovo')).toBeVisible()
})

test('scarica il clip come WAV', async ({ page }) => {
  await importTone(page, 'da-scaricare')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Scarica WAV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('da-scaricare.wav')
})

test('elimina un clip e lo recupera con Annulla', async ({ page }) => {
  await importTone(page, 'effimero')

  await page.getByRole('button', { name: 'Elimina', exact: true }).click()
  await expect(clipButton(page, 'effimero')).toHaveCount(0)

  const toast = page.getByRole('status').filter({ hasText: 'eliminato' })
  await toast.getByRole('button', { name: 'Annulla' }).click()
  await expect(clipButton(page, 'effimero')).toBeVisible()

  await page.reload()
  await expect(clipButton(page, 'effimero')).toBeVisible()
})

test('cerca per nome e segnala quando non trova niente', async ({ page }) => {
  await importTone(page, 'kick')
  await importTone(page, 'snare')

  const search = page.getByRole('searchbox', { name: 'Cerca nella libreria' })
  await search.fill('kick')
  await expect(clipButton(page, 'kick')).toBeVisible()
  await expect(clipButton(page, 'snare')).toHaveCount(0)

  await search.fill('niente')
  await expect(page.getByText('Nessun clip corrisponde alla ricerca.')).toBeVisible()
})

test('un file non audio mostra un errore', async ({ page }) => {
  await page.getByTestId('import-input').setInputFiles({
    name: 'note.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('non sono audio'),
  })
  await expect(page.getByRole('alert')).toContainText('Non riesco a leggere «note.wav»')
})
