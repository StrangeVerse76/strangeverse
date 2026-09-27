import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

function toneWav(): Buffer {
  const data = Float32Array.from(
    { length: 24_000 },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000),
  )
  return Buffer.from(encodeWav([data], 48_000))
}

const mixer = (page: Page) => page.getByRole('region', { name: 'Mixer', exact: true })
const library = (page: Page) => page.getByRole('region', { name: 'Libreria' })

/** Legge il WAV scaricato del clip selezionato e restituisce il picco di ogni canale. */
async function channelPeaks(page: Page): Promise<number[]> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library(page).getByRole('button', { name: 'Scarica WAV' }).click(),
  ])
  const path = await download.path()
  if (!path) throw new Error('download non salvato')
  const bytes = await readFile(path)
  const channels = bytes.readUInt16LE(22)
  const frames = bytes.readUInt32LE(40) / (3 * channels)
  const peaks = Array.from({ length: channels }, () => 0)
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.abs(bytes.readIntLE(44 + (i * channels + c) * 3, 3) / 0x800000)
      if (v > (peaks[c] ?? 0)) peaks[c] = v
    }
  }
  return peaks
}

async function toneOnTrack1(page: Page) {
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'tono.wav', mimeType: 'audio/wav', buffer: toneWav() })
  await library(page).getByRole('button', { name: 'Aggiungi alla timeline' }).click()
}

async function renderMix(page: Page, name: string) {
  const timeline = page.getByRole('region', { name: 'Timeline' })
  await timeline.getByRole('textbox', { name: 'Nome del mix' }).fill(name)
  await timeline.getByRole('button', { name: 'Renderizza in libreria' }).click()
  await expect(library(page).getByRole('button', { name: new RegExp(`^${name} `) })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('un canale per traccia più quello dei pad, con EQ apribile', async ({ page }) => {
  await mixer(page).scrollIntoViewIfNeeded()
  await expect(mixer(page).getByRole('region', { name: 'Canale Traccia 1' })).toBeVisible()
  await expect(mixer(page).getByRole('region', { name: 'Canale Traccia 2' })).toBeVisible()
  await expect(mixer(page).getByRole('region', { name: 'Canale Pad' })).toBeVisible()
  await mixer(page).getByRole('button', { name: 'EQ Traccia 1' }).click()
  await expect(mixer(page).getByRole('combobox', { name: 'Preset EQ' })).toBeVisible()
})

test('pan tutto a sinistra: nel mix il canale destro è muto', async ({ page }) => {
  await toneOnTrack1(page)
  await mixer(page).scrollIntoViewIfNeeded()
  await mixer(page).getByRole('slider', { name: 'Pan Traccia 1' }).focus()
  await page.keyboard.press('Home')
  await renderMix(page, 'Sinistra')
  const [left, right] = await channelPeaks(page)
  expect(left).toBeGreaterThan(0.3)
  expect(right).toBeLessThan(0.001)
})

test('il solo su un’altra traccia zittisce quella del tono', async ({ page }) => {
  await toneOnTrack1(page)
  await mixer(page).scrollIntoViewIfNeeded()
  await mixer(page).getByRole('button', { name: 'Solo Traccia 2' }).click()
  await renderMix(page, 'Silenzio')
  const peaks = await channelPeaks(page)
  expect(Math.max(...peaks)).toBeLessThan(0.001)
})
