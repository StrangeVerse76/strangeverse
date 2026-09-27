import { expect, test } from '@playwright/test'

test('la home mostra il catalogo con Soundverse online', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('StrangeVerse')
  await expect(page.getByRole('heading', { level: 1, name: 'StrangeVerse' })).toBeVisible()

  const catalog = page.getByRole('region', { name: 'Le app' })
  const soundverse = catalog.getByRole('article').filter({ hasText: 'Soundverse' })
  await expect(soundverse).toBeVisible()
  await expect(soundverse).toContainText('Online')
  await expect(soundverse.getByRole('link', { name: 'Soundverse' })).toHaveAttribute(
    'href',
    'https://soundverse-strange-verse.vercel.app',
  )
})

test('si arriva a "Chi sono" dal menu', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Principale' })
    .getByRole('link', { name: 'Chi sono' })
    .click()

  await expect(page).toHaveURL(/\/chi-sono$/)
  await expect(page).toHaveTitle('Chi sono · StrangeVerse')
  await expect(page.getByRole('heading', { level: 1, name: 'Chi sono' })).toBeVisible()
})

test('una pagina inesistente mostra il 404', async ({ page }) => {
  const response = await page.goto('/non-esiste')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Questa pagina non esiste' })).toBeVisible()

  await page.getByRole('button', { name: 'Torna alla home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('il tema si cambia e resta dopo il ricaricamento', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Passa al tema chiaro' }).click()
  await expect(html).toHaveClass(/light/)

  await page.reload()
  await expect(html).toHaveClass(/light/)
})

test('ha favicon e meta description', async ({ page, request }) => {
  await page.goto('/')

  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /multiverso/)
  const favicon = await request.get('/favicon.svg')
  expect(favicon.ok()).toBe(true)
})

test('la pagina non scorre in orizzontale', async ({ page }) => {
  await page.goto('/')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

test('ogni elemento dell’header sta dentro lo schermo', async ({ page }) => {
  await page.goto('/')
  const width = page.viewportSize()?.width ?? 0
  const header = page.getByRole('banner')
  for (const item of [
    header.getByRole('link', { name: 'StrangeVerse' }),
    header.getByRole('link', { name: 'Chi sono' }),
    header.getByRole('button', { name: /Passa al tema/ }),
  ]) {
    const box = await item.boundingBox()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
  }
})
