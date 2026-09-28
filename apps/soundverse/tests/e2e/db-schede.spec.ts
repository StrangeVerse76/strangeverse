import { expect, test } from '@playwright/test'

/** Apre in una scheda il database com'era alla versione 3 e lo tiene aperto. */
const holdOldDatabase = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('soundverse', 3)
    request.onupgradeneeded = () => {
      for (const name of ['clips', 'projects', 'kits']) {
        request.result.createObjectStore(name, { keyPath: 'id' })
      }
      request.result.createObjectStore('audio')
    }
    request.onsuccess = () => {
      ;(window as unknown as { __old: IDBDatabase }).__old = request.result
      resolve()
    }
    request.onerror = () => reject(request.error)
  })

test('una scheda con la versione vecchia non blocca in silenzio', async ({ context }) => {
  const old = await context.newPage()
  await old.goto('/non-esiste')
  await old.evaluate(holdOldDatabase)

  const page = await context.newPage()
  await page.goto('/')
  const library = page.getByRole('region', { name: 'Libreria' })
  await expect(library.getByRole('alert')).toContainText("aperto in un'altra scheda")

  // Chiusa la scheda vecchia, l'aggiornamento finisce e la libreria si carica.
  await old.evaluate(() => (window as unknown as { __old: IDBDatabase }).__old.close())
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await expect(library.getByRole('alert')).toHaveCount(0)
})

test('se un’altra scheda aggiorna il database, questa chiede di ricaricare', async ({
  context,
}) => {
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()

  const newer = await context.newPage()
  await newer.goto('/non-esiste')
  await newer.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('soundverse', 99)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
  )
  await expect(page.getByRole('region', { name: 'Libreria' }).getByRole('alert')).toContainText(
    'ricarica questa pagina',
  )
})
