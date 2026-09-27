import { expect, test, type Page } from '@playwright/test'
import { peaking, responseDb } from '../../app/eq/biquad'
import { bandwidthToQ } from '../../app/eq/spec'
import { encodeWav } from '../../app/audio/wav'

/** Tono di 1 s a 440 Hz, ampiezza 0,5: RMS −9,03 dBFS. */
function toneWav(channels: 1 | 2): Buffer {
  const data = Float32Array.from(
    { length: 48_000 },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000),
  )
  return Buffer.from(
    encodeWav(
      Array.from({ length: channels }, () => data),
      48_000,
    ),
  )
}

const samples = (page: Page) => page.getByRole('region', { name: 'Campioni' })

async function loadAndAddEq(page: Page, channels: 1 | 2) {
  await samples(page)
    .getByTestId('sample-input')
    .setInputFiles({
      name: 'tono.wav',
      mimeType: 'audio/wav',
      buffer: toneWav(channels),
    })
  await expect(samples(page).getByLabel('Analisi della sorgente')).toContainText('RMS -9.0 dBFS')
  await samples(page)
    .getByRole('combobox', { name: 'Operazione da aggiungere' })
    .selectOption({ label: 'Equalizzatore' })
  await samples(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('il browser suona la stessa curva che disegniamo (entro 0,2 dB)', async ({ page }) => {
  await loadAndAddEq(page, 1)
  // Medio-bassi: 400 Hz, banda 5 (predefiniti), picco a +10 dB.
  const peak = samples(page).getByRole('slider', { name: 'Medio-bassi: picco' })
  await peak.focus()
  await page.keyboard.press('End')

  await samples(page).getByRole('button', { name: 'Ascolta risultato' }).click()
  const stats = samples(page).getByLabel('Analisi del risultato')
  await expect(stats).toBeVisible()
  await samples(page).getByRole('button', { name: 'Stop' }).click()

  const expectedGain = responseDb([peaking(400, 10, bandwidthToQ(5), 48_000)], 440, 48_000)
  const expectedRms = 20 * Math.log10(0.5 / Math.SQRT2) + expectedGain
  const text = (await stats.textContent()) ?? ''
  const measured = Number(/RMS (-?[\d.]+) dBFS/.exec(text)?.[1])
  expect(Math.abs(measured - expectedRms)).toBeLessThanOrEqual(0.2)
  await expect(stats).toContainText('mono') // in stereo un clip mono resta mono
})

test('mid/side su un clip mono avvisa che il Side è vuoto', async ({ page }) => {
  await loadAndAddEq(page, 1)
  await samples(page)
    .getByRole('combobox', { name: 'Preset EQ' })
    .selectOption({ label: 'Allarga' })
  await expect(samples(page).getByRole('alert')).toContainText('Il clip è mono')
})

test('ascolto dal vivo: le modifiche ricostruiscono il grafo senza errori', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await loadAndAddEq(page, 2)
  await samples(page).getByRole('button', { name: 'Ascolta con EQ' }).click()
  await expect(samples(page).getByRole('button', { name: 'Ferma ascolto EQ' })).toBeVisible()

  await samples(page)
    .getByRole('combobox', { name: 'Preset EQ' })
    .selectOption({ label: 'Corpo e aria' })
  const boost = samples(page).getByRole('slider', { name: 'Bassi: boost' })
  await boost.focus()
  await page.keyboard.press('PageUp')
  await samples(page).getByRole('combobox', { name: 'Modalità EQ' }).selectOption('midSide')
  await page.waitForTimeout(200)

  await samples(page).getByRole('button', { name: 'Ferma ascolto EQ' }).click()
  expect(errors).toEqual([])
})

test('Crea nuovo clip con l’EQ nella ricetta', async ({ page }) => {
  await loadAndAddEq(page, 2)
  await samples(page)
    .getByRole('combobox', { name: 'Preset EQ' })
    .selectOption({ label: 'Voce avanti' })
  await samples(page).getByRole('button', { name: 'Crea nuovo clip' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Libreria' })
      .getByRole('button', { name: /tono \(modificato\)/ }),
  ).toContainText('Campione · 0:01.0 · stereo')
})

test('mid/side senza filtri restituisce l’originale (codifica e decodifica esatte)', async ({
  page,
}) => {
  await loadAndAddEq(page, 2)
  await samples(page).getByRole('combobox', { name: 'Modalità EQ' }).selectOption('midSide')
  await samples(page).getByRole('button', { name: 'Ascolta risultato' }).click()
  await expect(samples(page).getByLabel('Analisi del risultato')).toContainText(
    'stereo · picco -6.0 dBFS · RMS -9.0 dBFS',
  )
})
