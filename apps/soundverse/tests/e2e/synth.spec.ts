import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const synth = (page: Page) => page.getByRole('region', { name: 'Synth' })
const libraryList = (page: Page) =>
  page.getByRole('region', { name: 'Libreria' }).getByRole('list', { name: 'Clip' })

async function saveAndDownload(page: Page): Promise<Buffer> {
  await synth(page).getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(synth(page).getByRole('button', { name: 'Salva in libreria' })).toBeEnabled()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('region', { name: 'Clip selezionato' })
      .getByRole('button', { name: 'Scarica WAV' })
      .click(),
  ])
  const path = await download.path()
  if (!path) throw new Error('download non salvato')
  return readFile(path)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('le manopole si regolano da tastiera e tornano al valore predefinito col doppio click', async ({
  page,
}) => {
  const freq = synth(page)
    .getByRole('group', { name: 'Oscillatore 1' })
    .getByRole('slider', { name: 'Freq' })
  await expect(freq).toHaveAttribute('aria-valuetext', '220 Hz')

  await freq.focus()
  await page.keyboard.press('ArrowUp')
  await expect(freq).not.toHaveAttribute('aria-valuetext', '220 Hz')
  await page.keyboard.press('End')
  await expect(freq).toHaveAttribute('aria-valuetext', '8.00 kHz')

  await freq.dblclick()
  await expect(freq).toHaveAttribute('aria-valuetext', '220 Hz')
})

test('Ascolta suona per la durata e poi torna disponibile', async ({ page }) => {
  await synth(page).getByRole('button', { name: 'Ascolta' }).click()
  await expect(synth(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(synth(page).getByRole('button', { name: 'Ascolta' })).toBeVisible({ timeout: 5_000 })
})

test('Salva crea un clip synth della durata impostata', async ({ page }) => {
  await synth(page).getByRole('textbox', { name: 'Nome del suono' }).fill('Mio tono')
  await synth(page).getByRole('button', { name: 'Salva in libreria' }).click()

  const clip = libraryList(page).getByRole('button', { name: /Mio tono/ })
  await expect(clip).toContainText('Synth · 0:01.0 · mono')
  await expect(clip).toHaveAttribute('aria-pressed', 'true')
})

test('stessa spec, stesso file: il render è deterministico anche con rumore e riverbero', async ({
  page,
}) => {
  const panel = synth(page)
  await panel.getByRole('checkbox', { name: 'Rumore' }).check()
  await panel
    .getByRole('combobox', { name: 'Effetto da aggiungere' })
    .selectOption({ label: 'Riverbero' })
  await panel.getByRole('button', { name: 'Aggiungi', exact: true }).click()

  const first = await saveAndDownload(page)
  const second = await saveAndDownload(page)
  expect(first.length).toBeGreaterThan(44)
  expect(second.equals(first)).toBe(true)

  // Cambiando seed il rumore cambia, quindi cambia anche il file.
  await panel.getByRole('button', { name: 'Cambia' }).click()
  const third = await saveAndDownload(page)
  expect(third.equals(first)).toBe(false)
})

test('il bitcrush (AudioWorklet) funziona sia in ascolto sia nel salvataggio', async ({ page }) => {
  const panel = synth(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await panel
    .getByRole('combobox', { name: 'Effetto da aggiungere' })
    .selectOption({ label: 'Bitcrush' })
  await panel.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(panel.getByRole('listitem', { name: 'Effetto 1: Bitcrush' })).toBeVisible()

  await panel.getByRole('button', { name: 'Ascolta' }).click()
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible()
  await panel.getByRole('button', { name: 'Stop' }).click()

  await panel.getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(libraryList(page).getByRole('button', { name: /Synth/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('gli effetti si riordinano e si rimuovono', async ({ page }) => {
  const panel = synth(page)
  for (const label of ['Delay', 'Tremolo']) {
    await panel.getByRole('combobox', { name: 'Effetto da aggiungere' }).selectOption({ label })
    await panel.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  }
  await expect(panel.getByRole('listitem', { name: 'Effetto 1: Delay' })).toBeVisible()

  await panel.getByRole('button', { name: 'Sposta Tremolo prima' }).click()
  await expect(panel.getByRole('listitem', { name: 'Effetto 1: Tremolo' })).toBeVisible()

  await panel.getByRole('button', { name: 'Rimuovi Tremolo' }).click()
  await expect(panel.getByRole('listitem', { name: 'Effetto 1: Delay' })).toBeVisible()
  await expect(panel.getByRole('listitem', { name: /Tremolo/ })).toHaveCount(0)
})

test('un preset carica la sua spec', async ({ page }) => {
  await synth(page)
    .getByRole('combobox', { name: 'Carica un preset' })
    .selectOption({ label: 'Pad' })

  await expect(synth(page).getByRole('slider', { name: 'Durata' })).toHaveAttribute(
    'aria-valuetext',
    '4.00 s',
  )
  await expect(synth(page).getByRole('group', { name: /Oscillatore/ })).toHaveCount(3)
  await expect(synth(page).getByRole('textbox', { name: 'Nome del suono' })).toHaveValue('Pad')
})
