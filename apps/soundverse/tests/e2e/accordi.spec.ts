import { expect, test, type Page } from '@playwright/test'

const panel = (page: Page) => page.getByRole('region', { name: 'Accordi' })
const chordNames = (page: Page) =>
  panel(page).getByRole('list', { name: 'Accordi della progressione' }).locator('.chord__name')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await panel(page).scrollIntoViewIfNeeded()
})

test('mostra la progressione in chiaro e segue tonalità, modo e preset', async ({ page }) => {
  await expect(chordNames(page)).toHaveText(['Do', 'Sol', 'Lam', 'Fa'])

  await panel(page).getByRole('combobox', { name: 'Tonica' }).selectOption({ label: 'La' })
  await panel(page)
    .getByRole('combobox', { name: 'Progressione' })
    .selectOption({ label: 'Epica (i–VI–III–VII)' })
  await expect(chordNames(page)).toHaveText(['Lam', 'Fa', 'Do', 'Sol'])
  await expect(panel(page).getByText('La minore')).toBeVisible()

  await panel(page).getByRole('checkbox', { name: 'Settime' }).check()
  await expect(chordNames(page)).toHaveText(['Lam7', 'Fa maj7', 'Do maj7', 'Sol7'])
})

test('Casuale cambia seed e parte sempre dalla tonica; il grado si sceglie a mano', async ({
  page,
}) => {
  await panel(page).getByRole('button', { name: 'Casuale' }).click()
  await expect(panel(page).getByText(/seed \d+/)).not.toHaveText(/seed 1$/)
  await expect(chordNames(page).first()).toHaveText('Do')

  await panel(page).getByRole('combobox', { name: "Grado dell'accordo 2" }).selectOption('2')
  await expect(chordNames(page).nth(1)).toHaveText('Rem')
})

test('ascolta e salva: il clip dura accordi × battiti e sa BPM e tonalità', async ({ page }) => {
  await panel(page).getByRole('button', { name: 'Ascolta' }).click()
  await expect(panel(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await panel(page).getByRole('button', { name: 'Stop' }).click()

  await panel(page).getByRole('button', { name: 'Salva in libreria' }).click()
  // 4 accordi × 4 battiti a 100 BPM = 9,6 s.
  await expect(
    page.getByRole('region', { name: 'Libreria' }).getByRole('button', { name: /^Accordi / }),
  ).toContainText('Synth · 0:09.6 · mono · 100 BPM · Do maggiore')
})
