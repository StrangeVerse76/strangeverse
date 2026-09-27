import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const drums = (page: Page) => page.getByRole('region', { name: 'Batteria' })
const step = (page: Page, voice: string, n: number) =>
  drums(page).getByRole('button', { name: new RegExp(`^${voice} passo ${n}:`) })
const libraryList = (page: Page) =>
  page.getByRole('region', { name: 'Libreria' }).getByRole('list', { name: 'Clip' })

/** Legge i campioni di un WAV mono PCM 24 bit (il formato dei clip di Soundverse). */
function readWav24(buffer: Buffer): { sampleRate: number; samples: Float32Array } {
  const sampleRate = buffer.readUInt32LE(24)
  const dataSize = buffer.readUInt32LE(40)
  const samples = new Float32Array(dataSize / 3)
  for (let i = 0; i < samples.length; i++) samples[i] = buffer.readIntLE(44 + i * 3, 3) / 0x800000
  return { sampleRate, samples }
}

const firstAbove = (samples: Float32Array, threshold: number, from = 0) => {
  for (let i = from; i < samples.length; i++) if (Math.abs(samples[i] ?? 0) > threshold) return i
  return -1
}

async function clearAll(page: Page) {
  for (const voice of ['Cassa', 'Rullante', 'Charleston', 'Clap']) {
    await drums(page)
      .getByRole('button', { name: `Pulisci ${voice}` })
      .click()
  }
}

async function saveAndRead(page: Page) {
  await drums(page).getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(drums(page).getByRole('button', { name: 'Salva in libreria' })).toBeEnabled()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('region', { name: 'Clip selezionato' })
      .getByRole('button', { name: 'Scarica WAV' })
      .click(),
  ])
  const path = await download.path()
  if (!path) throw new Error('download non salvato')
  return readWav24(await readFile(path))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('un click su un passo cicla acceso → accento → spento', async ({ page }) => {
  const s = step(page, 'Clap', 3)
  await expect(s).toHaveAccessibleName('Clap passo 3: spento')
  await s.click()
  await expect(s).toHaveAccessibleName('Clap passo 3: acceso')
  await s.click()
  await expect(s).toHaveAccessibleName('Clap passo 3: accento')
  await s.click()
  await expect(s).toHaveAccessibleName('Clap passo 3: spento')
})

test('Play avvia il loop con il cursore sulla griglia; la barra spaziatrice lo ferma', async ({
  page,
}) => {
  await drums(page).getByRole('button', { name: 'Play' }).click()
  await expect(drums(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(drums(page).locator('.step--current').first()).toBeVisible()

  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Space')
  await expect(drums(page).getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(drums(page).locator('.step--current')).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(drums(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await page.keyboard.press('Space')
})

test('il clip salvato dura esattamente le sue battute', async ({ page }) => {
  await drums(page).getByRole('textbox', { name: 'Nome del pattern' }).fill('Groove')
  await drums(page).getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(libraryList(page).getByRole('button', { name: /Groove/ })).toContainText(
    'Batteria · 0:02.0 · mono',
  )

  await drums(page).getByRole('combobox', { name: 'Battute' }).selectOption('2')
  await expect(drums(page).getByRole('group', { name: 'Battuta da modificare' })).toBeVisible()
  await drums(page).getByRole('textbox', { name: 'Nome del pattern' }).fill('Groove lungo')
  await drums(page).getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(libraryList(page).getByRole('button', { name: /Groove lungo/ })).toContainText(
    'Batteria · 0:04.0 · mono',
  )
})

test('i colpi cadono al campione giusto e la coda finale si ripiega sull’inizio', async ({
  page,
}) => {
  await clearAll(page)
  // A 120 BPM il passo 5 è a 0,5 s; il passo 16 a 1,875 s, e la cassa (0,45 s) sfora la fine.
  await step(page, 'Cassa', 5).click()
  const onset = await saveAndRead(page)
  expect(onset.samples.length).toBe(2 * 48_000)
  const start = firstAbove(onset.samples, 0.01)
  expect(Math.abs(start - 24_000)).toBeLessThanOrEqual(48) // entro 1 ms

  await step(page, 'Cassa', 5).click()
  await step(page, 'Cassa', 5).click() // di nuovo spento
  await step(page, 'Cassa', 16).click()
  const folded = await saveAndRead(page)
  expect(folded.samples.length).toBe(2 * 48_000)
  // La coda del colpo a 1,875 s continua all'inizio del file.
  expect(firstAbove(folded.samples, 0.01)).toBeLessThan(480)
  expect(firstAbove(folded.samples, 0.01, 48_000)).toBeGreaterThan(1.87 * 48_000)
})

test('le voci si aggiungono, si silenziano e si rimuovono', async ({ page }) => {
  const add = drums(page).getByRole('combobox', { name: 'Voce da aggiungere' })
  await add.selectOption({ label: 'Tom' })
  await drums(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(drums(page).getByRole('listitem', { name: 'Tom' })).toBeVisible()

  const mute = drums(page).getByRole('button', { name: 'Muto Tom' })
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')

  await drums(page).getByRole('button', { name: 'Rimuovi Tom' }).click()
  await expect(drums(page).getByRole('listitem', { name: 'Tom' })).toHaveCount(0)
})
