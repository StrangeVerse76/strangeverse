import { expect, test, type Page } from '@playwright/test'

const header = (page: Page) => page.getByRole('banner')

const me = (page: Page, body: unknown) =>
  page.route('**/api/me', (route) => route.fulfill({ json: body }))

test('dove il login non è configurato non compare niente', async ({ page }) => {
  await me(page, { enabled: false, user: null })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Libreria' })).toBeVisible()
  await expect(header(page).getByRole('button', { name: 'Accedi con GitHub' })).toHaveCount(0)
})

test('senza sessione c’è "Accedi con GitHub"; un rifiuto si vede', async ({ page }) => {
  await me(page, { enabled: true, user: null })
  await page.goto('/?error=login')
  await expect(header(page).getByRole('button', { name: 'Accedi con GitHub' })).toBeVisible()
  await expect(header(page).getByRole('alert')).toHaveText('Accesso non consentito')
})

test('con la sessione si vede chi è entrato e si può uscire', async ({ page }) => {
  await me(page, { enabled: true, user: { name: 'Pietro', image: null } })
  let signedOut = false
  await page.route('**/api/auth/sign-out', async (route) => {
    signedOut = true
    await me(page, { enabled: true, user: null })
    await route.fulfill({ json: { success: true } })
  })
  await page.goto('/')
  await expect(header(page)).toContainText('Pietro')
  await header(page).getByRole('button', { name: 'Esci' }).click()
  await expect(header(page).getByRole('button', { name: 'Accedi con GitHub' })).toBeVisible()
  expect(signedOut).toBe(true)
})
