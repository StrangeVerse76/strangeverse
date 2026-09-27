import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

function toneWav(seconds: number): Buffer {
  const data = Float32Array.from(
    { length: Math.round(seconds * 48_000) },
    (_, i) => Math.sin((2 * Math.PI * 220 * i) / 48_000) * Math.exp(-i / 8000),
  )
  return Buffer.from(encodeWav([data], 48_000))
}

const panel = (page: Page) => page.getByRole('region', { name: 'Pad', exact: true })
const pad = (page: Page, name: string) =>
  panel(page).getByRole('button', { name: new RegExp(`^Pad ${name}:`) })

async function importTone(page: Page, name: string) {
  await page
    .getByTestId('import-input')
    .setInputFiles({ name: `${name}.wav`, mimeType: 'audio/wav', buffer: toneWav(0.5) })
  await expect(
    page
      .getByRole('region', { name: 'Libreria' })
      .getByRole('button', { name: new RegExp(`^${name} `) }),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await panel(page).scrollIntoViewIfNeeded()
})

test('si assegna un clip a un pad e lo si suona con la tastiera', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await importTone(page, 'cassa')

  await pad(page, 'A1').dispatchEvent('pointerdown')
  await panel(page)
    .getByRole('combobox', { name: 'Campione del pad' })
    .selectOption({ label: 'cassa' })
  await expect(pad(page, 'A1')).toHaveAccessibleName('Pad A1: cassa')

  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('z')
  await expect(pad(page, 'A1')).toHaveClass(/pad--hit/)
  expect(errors).toEqual([])
})

test('trascinando un clip dalla libreria su un pad lo si assegna', async ({ page }) => {
  await importTone(page, 'rullante')
  const target = pad(page, 'A6')
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await page
    .getByRole('region', { name: 'Libreria' })
    .getByRole('button', { name: /^rullante / })
    .dispatchEvent('dragstart', { dataTransfer })
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
  await expect(target).toHaveAccessibleName('Pad A6: rullante')
})

test('i banchi hanno pad separati e il kit resta dopo il ricaricamento', async ({ page }) => {
  await importTone(page, 'charleston')
  await panel(page).getByRole('button', { name: 'B', exact: true }).click()
  await pad(page, 'B3').dispatchEvent('pointerdown')
  await panel(page)
    .getByRole('combobox', { name: 'Campione del pad' })
    .selectOption({ label: 'charleston' })
  await panel(page).getByRole('combobox', { name: 'Gruppo di mute' }).selectOption('1')
  await panel(page).getByRole('textbox', { name: 'Nome del kit' }).fill('Kit trap')
  await page.waitForTimeout(800)

  await page.reload()
  await panel(page).getByRole('button', { name: 'B', exact: true }).click()
  await expect(pad(page, 'B3')).toHaveAccessibleName('Pad B3: charleston')
  await pad(page, 'B3').dispatchEvent('pointerdown')
  await expect(panel(page).getByRole('combobox', { name: 'Gruppo di mute' })).toHaveValue('1')
  await expect(panel(page).getByRole('textbox', { name: 'Nome del kit' })).toHaveValue('Kit trap')
  await panel(page).getByRole('button', { name: 'A', exact: true }).click()
  await expect(pad(page, 'A3')).toHaveAccessibleName('Pad A3: vuoto')
})

test('eliminando un clip dalla libreria il pad si svuota', async ({ page }) => {
  await importTone(page, 'effimero')
  await pad(page, 'A2').dispatchEvent('pointerdown')
  await panel(page)
    .getByRole('combobox', { name: 'Campione del pad' })
    .selectOption({ label: 'effimero' })
  await page
    .getByRole('region', { name: 'Libreria' })
    .getByRole('button', { name: 'Elimina', exact: true })
    .click()
  await expect(pad(page, 'A2')).toHaveAccessibleName('Pad A2: vuoto')
})
