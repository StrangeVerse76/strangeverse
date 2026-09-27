import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

/** Un colpo breve, per i pad e per la timeline. */
function hitWav(): Buffer {
  const data = Float32Array.from(
    { length: 24_000 },
    (_, i) => Math.sin(i / 8) * Math.exp(-i / 4000),
  )
  return Buffer.from(encodeWav([data], 48_000))
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const library = (page: Page) => region(page, 'Libreria')

async function saved(page: Page, count: number) {
  await expect(library(page).getByRole('list', { name: 'Clip' }).getByRole('listitem')).toHaveCount(
    count,
  )
}

interface Check {
  name: string
  type: string
  channels: number[]
  frames: number[]
  maxDiff: number
}

test('ogni clip si rifà identico dalla sua ricetta', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    ;(window as unknown as { __SV_TEST__: boolean }).__SV_TEST__ = true
  })
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()

  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'colpo.wav', mimeType: 'audio/wav', buffer: hitWav() })
  await saved(page, 1)

  // Synth, batteria e accordi.
  for (const panel of ['Synth', 'Batteria', 'Accordi']) {
    const p = region(page, panel)
    await p.scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: 'Salva in libreria' }).click()
    await expect(p.getByRole('button', { name: 'Salva in libreria' })).toBeEnabled()
  }
  await saved(page, 4)

  // Campioni: una catena sul colpo importato.
  const samples = region(page, 'Campioni')
  await samples.scrollIntoViewIfNeeded()
  await samples
    .getByRole('combobox', { name: 'Clip sorgente' })
    .selectOption({ label: 'colpo · Campione' })
  for (const label of ['Inverti', 'Normalizza']) {
    await samples
      .getByRole('combobox', { name: 'Operazione da aggiungere' })
      .selectOption({ label })
    await samples.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  }
  await samples.getByRole('button', { name: 'Crea nuovo clip' }).click()
  await saved(page, 5)

  // Pad: il colpo su A1, due colpi registrati, pattern salvato.
  const pads = region(page, 'Pad')
  await pads.scrollIntoViewIfNeeded()
  await pads.getByRole('button', { name: /^Pad A1:/ }).dispatchEvent('pointerdown')
  await pads.getByRole('combobox', { name: 'Campione del pad' }).selectOption({ label: 'colpo' })
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  const seq = page.getByRole('region', { name: 'Sequencer dei pad' })
  await seq.getByRole('button', { name: '● Rec' }).click()
  await expect(seq.getByTestId('seq-playhead')).toBeVisible()
  await page.keyboard.press('z')
  await page.waitForTimeout(400)
  await page.keyboard.press('z')
  await seq.getByRole('button', { name: 'Stop' }).click()
  await seq.getByRole('textbox', { name: 'Nome del pattern salvato' }).fill('Beat')
  await seq.getByRole('button', { name: 'Salva in libreria' }).click()
  await saved(page, 6)

  // Mix: il colpo e la batteria nella timeline.
  for (const name of [/^colpo /, /^Batteria /]) {
    await library(page).getByRole('button', { name }).first().click()
    await library(page).getByRole('button', { name: 'Aggiungi alla timeline' }).click()
  }
  await region(page, 'Timeline').getByRole('button', { name: 'Renderizza in libreria' }).click()
  await saved(page, 7)

  const checks = await page.evaluate(() =>
    (
      window as unknown as { __soundverse: { recipeCheck(): Promise<Check[]> } }
    ).__soundverse.recipeCheck(),
  )
  expect(checks.map((c) => c.type).sort()).toEqual(
    ['chords', 'drums', 'mix', 'padPattern', 'sample', 'synth'].sort(),
  )
  for (const c of checks) {
    expect(c.channels[1], c.name).toBe(c.channels[0])
    expect(c.frames[1], c.name).toBe(c.frames[0])
    // L'audio salvato è a 24 bit, e il browser lo rilegge dividendo per 2^23 invece che per
    // 2^23 − 1: la differenza sta entro mezzo gradino di arrotondamento più uno di scala.
    expect(c.maxDiff, c.name).toBeLessThanOrEqual(1.5 / 2 ** 23)
  }
})
