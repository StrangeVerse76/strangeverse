import { expect, test } from '@playwright/test'

test('lo studio mostra le aree principali', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Soundverse')
  for (const name of ['Synth', 'Batteria', 'Campioni', 'Libreria', 'Timeline']) {
    await expect(page.getByRole('region', { name })).toBeVisible()
  }
})

test("l'header riporta al portale", async ({ page }) => {
  await page.goto('/')

  const home = page.getByRole('link', { name: 'StrangeVerse' })
  await expect(home).toHaveAttribute('href', 'https://strangeverse-strange-verse.vercel.app')
  await expect(page.getByRole('link', { name: 'Soundverse' })).toBeVisible()
})

test('una pagina inesistente mostra il 404', async ({ page }) => {
  const response = await page.goto('/non-esiste')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Questa pagina non esiste' })).toBeVisible()
})

test('la pagina scorre in orizzontale solo dentro il rack', async ({ page }) => {
  await page.goto('/')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

test('la pagina Licenze cita l’encoder MP3 e la sua licenza', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Principale' })
    .getByRole('link', { name: 'Licenze' })
    .click()
  await expect(page).toHaveTitle('Licenze · Soundverse')
  await expect(page.getByRole('link', { name: 'GNU LGPL 3.0' })).toBeVisible()
})

test('ogni elemento dell’header sta dentro lo schermo', async ({ page }) => {
  await page.goto('/')
  const width = page.viewportSize()?.width ?? 0
  const header = page.getByRole('banner')
  for (const item of [
    header.getByRole('link', { name: 'StrangeVerse' }),
    header.getByRole('link', { name: 'Soundverse' }),
    header.getByRole('link', { name: 'Licenze' }),
    header.getByRole('button', { name: /Passa al tema/ }),
  ]) {
    const box = await item.boundingBox()
    expect(box, await item.textContent()).not.toBeNull()
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
  }
})
