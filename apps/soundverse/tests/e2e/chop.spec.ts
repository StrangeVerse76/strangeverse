import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

const SR = 48_000

/** Quattro colpi a 0, 0,5, 1 e 1,5 s. */
function loopWav(): Buffer {
  const out = new Float32Array(2 * SR)
  let seed = 3
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (const t of [0, 0.5, 1, 1.5]) {
    const start = Math.round(t * SR)
    for (let i = 0; i < 6000; i++)
      out[start + i] = (out[start + i] ?? 0) + 0.8 * noise() * Math.exp(-i / 900)
  }
  return Buffer.from(encodeWav([out], SR))
}

const chop = (page: Page) => page.getByRole('region', { name: 'Chop' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'loop.wav', mimeType: 'audio/wav', buffer: loopWav() })
  await chop(page).scrollIntoViewIfNeeded()
  await chop(page)
    .getByRole('combobox', { name: 'Campione da tagliare' })
    .selectOption({ label: 'loop' })
})

test('taglia sui transitori e mette le fette sui pad in ordine', async ({ page }) => {
  await expect(chop(page).getByRole('button', { name: 'Crea 4 fette' })).toBeVisible()
  await chop(page).getByRole('button', { name: 'Crea 4 fette' }).click()

  const library = page.getByRole('region', { name: 'Libreria' }).getByRole('list', { name: 'Clip' })
  for (const n of [1, 2, 3, 4]) {
    await expect(library.getByRole('button', { name: new RegExp(`^loop ${n} `) })).toContainText(
      '0:00.5',
    )
  }
  const pads = page.getByRole('region', { name: 'Pad', exact: true })
  await expect(pads.getByRole('button', { name: 'Pad A1: loop 1' })).toBeVisible()
  await expect(pads.getByRole('button', { name: 'Pad A4: loop 4' })).toBeVisible()
})

test('a griglia e a tempo', async ({ page }) => {
  await chop(page).getByRole('button', { name: 'Griglia' }).click()
  await expect(chop(page).getByRole('button', { name: 'Crea 8 fette' })).toBeVisible()
  await chop(page).getByRole('button', { name: 'A tempo' }).click()
  // BPM stimato del loop (120) e un battito a fetta: 2 s = 4 fette.
  await expect(chop(page).getByRole('button', { name: 'Crea 4 fette' })).toBeVisible()
})

test('i tagli si spostano da tastiera, si tolgono e si aggiungono', async ({ page }) => {
  const second = chop(page).getByRole('slider', { name: 'Taglio 2' })
  await expect(second).toHaveAttribute('aria-valuetext', '0:00.5')
  await second.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(second).toHaveAttribute('aria-valuenow', /^0\.5[01]/)

  await page.keyboard.press('Delete')
  await expect(chop(page).getByRole('button', { name: 'Crea 3 fette' })).toBeVisible()

  const overlay = chop(page).getByTestId('chop-overlay')
  const box = await overlay.boundingBox()
  if (!box) throw new Error('forma d’onda non visibile')
  await overlay.dblclick({ position: { x: box.width * 0.9, y: box.height / 2 } })
  await expect(chop(page).getByRole('button', { name: 'Crea 4 fette' })).toBeVisible()
})
