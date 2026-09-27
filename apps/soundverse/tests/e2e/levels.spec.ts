import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'
import { readStore } from './helpers/idb'

function hitWav(): Buffer {
  const data = Float32Array.from({ length: 9600 }, (_, i) => Math.sin(i / 10) * Math.exp(-i / 2000))
  return Buffer.from(encodeWav([data], 48_000))
}

const panel = (page: Page) => page.getByRole('region', { name: 'Pad', exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: 'nota.wav', mimeType: 'audio/wav', buffer: hitWav() })
  await panel(page).scrollIntoViewIfNeeded()
  await panel(page)
    .getByRole('button', { name: /^Pad A1:/ })
    .dispatchEvent('pointerdown')
  await panel(page)
    .getByRole('combobox', { name: 'Campione del pad' })
    .selectOption({ label: 'nota' })
})

test('16 Levels: i pad mostrano i livelli del pad selezionato', async ({ page }) => {
  await panel(page).getByRole('button', { name: '16 Levels' }).click()
  await expect(panel(page).getByRole('button', { name: 'Livello 9: 0 st' })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Livello 16: +7 st' })).toBeVisible()

  await panel(page)
    .getByRole('combobox', { name: 'Parametro dei livelli' })
    .selectOption('velocity')
  await expect(panel(page).getByRole('button', { name: 'Livello 16: vel 127' })).toBeVisible()

  await panel(page).getByRole('button', { name: 'Pad', exact: true }).click()
  await expect(panel(page).getByRole('button', { name: /^Pad A1: nota/ })).toBeVisible()
})

test('un colpo registrato in 16 Levels resta nel pattern con la sua accordatura', async ({
  page,
}) => {
  await panel(page).getByRole('button', { name: '16 Levels' }).click()
  const seq = page.getByRole('region', { name: 'Sequencer dei pad' })
  await seq.getByRole('button', { name: '● Rec' }).click()
  await expect(seq.getByTestId('seq-playhead')).toBeVisible()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('4') // livello 16: +7 semitoni
  await page.waitForTimeout(200)
  await seq.getByRole('button', { name: 'Stop' }).click()
  await expect
    .poll(async () => {
      const kits = await readStore<{
        patterns?: { events: { overrides?: { tune?: number } }[] }[]
      }>(page, 'kits')
      return kits.flatMap((k) => k.patterns?.[0]?.events ?? []).map((e) => e.overrides?.tune)
    })
    .toContain(7)
})

test('la tastiera a piano suona e cambia ottava', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const piano = panel(page).getByRole('region', { name: 'Tastiera a piano' })
  await expect(piano.getByText('Do3 – Do5')).toBeVisible()
  await piano.getByRole('button', { name: 'Sol4', exact: true }).dispatchEvent('pointerdown')
  await piano.getByRole('button', { name: 'Ottava più alta' }).click()
  await expect(piano.getByText('Do4 – Do6')).toBeVisible()
  await piano.getByRole('button', { name: 'Do#5', exact: true }).dispatchEvent('pointerdown')
  expect(errors).toEqual([])
})
