import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'
import { readStore } from './helpers/idb'

function hitWav(): Buffer {
  const data = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 8) * Math.exp(-i / 800))
  return Buffer.from(encodeWav([data], 48_000))
}

const pads = (page: Page) => page.getByRole('region', { name: 'Pad', exact: true })
const seq = (page: Page) => page.getByRole('region', { name: 'Sequencer dei pad' })
const lane = (page: Page, pad: string) =>
  seq(page).getByRole('listitem', { name: new RegExp(`^Pad ${pad}: \\d+ colpi`) })

async function prepare(page: Page) {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'colpo.wav', mimeType: 'audio/wav', buffer: hitWav() })
  await pads(page).scrollIntoViewIfNeeded()
  await pads(page)
    .getByRole('button', { name: /^Pad A1:/ })
    .dispatchEvent('pointerdown')
  await pads(page)
    .getByRole('combobox', { name: 'Campione del pad' })
    .selectOption({ label: 'colpo' })
  await page.locator('body').click({ position: { x: 5, y: 5 } })
}

const hits = async (page: Page, pad: string) =>
  Number((await lane(page, pad).getAttribute('aria-label'))?.match(/(\d+) colpi/)?.[1] ?? 0)

test('Rec registra i colpi suonati sulla tastiera; Annulla li toglie', async ({ page }) => {
  await prepare(page)
  await seq(page).getByRole('button', { name: '● Rec' }).click()
  await expect(seq(page).getByTestId('seq-playhead')).toBeVisible()
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z')
    await page.waitForTimeout(300)
  }
  await seq(page).getByRole('button', { name: 'Stop' }).click()
  expect(await hits(page, 'A1')).toBeGreaterThanOrEqual(2)

  await seq(page).getByRole('button', { name: 'Annulla' }).click()
  await expect(lane(page, 'A1')).toHaveCount(0)
})

test('Note Repeat tenendo premuto registra un colpo per passo della griglia', async ({ page }) => {
  await prepare(page)
  await seq(page).getByRole('checkbox', { name: 'Note Repeat' }).check()
  await seq(page).getByRole('combobox', { name: 'Griglia' }).selectOption('1/8')
  await seq(page).getByRole('button', { name: '● Rec' }).click()
  await page.keyboard.down('z')
  // A 90 BPM un ottavo dura 0,33 s: in 1,2 s ne passano 3–4.
  await page.waitForTimeout(1200)
  await page.keyboard.up('z')
  await seq(page).getByRole('button', { name: 'Stop' }).click()
  const count = await hits(page, 'A1')
  expect(count).toBeGreaterThanOrEqual(3)
  expect(count).toBeLessThanOrEqual(5)
})

test('un pattern scelto mentre suona va in coda e parte a fine giro', async ({ page }) => {
  await prepare(page)
  await seq(page).getByRole('button', { name: 'Play' }).click()
  await seq(page).getByRole('button', { name: 'Nuovo pattern' }).click()
  const second = seq(page)
    .getByRole('group', { name: 'Pattern' })
    .getByRole('button', { name: '2', exact: true })
  await expect(second).toHaveClass(/chip--queued/)
  await expect(seq(page).getByText('In coda: pattern 2')).toBeVisible()
  // Un giro a 90 BPM (1 battuta) dura 2,67 s.
  await expect(second).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 })
  await seq(page).getByRole('button', { name: 'Stop' }).click()
})

test('il pattern si salva in libreria con la durata di un giro e il suo BPM', async ({ page }) => {
  await prepare(page)
  await seq(page).getByRole('button', { name: '● Rec' }).click()
  await expect(seq(page).getByTestId('seq-playhead')).toBeVisible()
  await page.keyboard.press('z')
  await page.waitForTimeout(400)
  await page.keyboard.press('z')
  await seq(page).getByRole('button', { name: 'Stop' }).click()
  await seq(page).getByRole('textbox', { name: 'Nome del pattern salvato' }).fill('Beat')
  await seq(page).getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(
    page.getByRole('region', { name: 'Libreria' }).getByRole('button', { name: /^Beat / }),
  ).toContainText('Batteria · 0:02.7 · stereo · 90 BPM')
})

test('i pattern registrati restano nel kit dopo il ricaricamento', async ({ page }) => {
  await prepare(page)
  await seq(page).getByRole('button', { name: '● Rec' }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('z')
  await page.waitForTimeout(300)
  await seq(page).getByRole('button', { name: 'Stop' }).click()
  await expect(lane(page, 'A1')).toBeVisible()
  // Il kit si salva da solo: si ricarica quando è davvero in IndexedDB.
  await expect
    .poll(async () => {
      const kits = await readStore<{ patterns?: { events: unknown[] }[] }>(page, 'kits')
      return kits.some((k) => (k.patterns?.[0]?.events.length ?? 0) > 0)
    })
    .toBe(true)
  await page.reload()
  await pads(page).scrollIntoViewIfNeeded()
  await expect(lane(page, 'A1')).toBeVisible()
})
