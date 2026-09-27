import type { Page } from '@playwright/test'

/**
 * Legge tutto uno store IndexedDB di Soundverse dalla pagina.
 * Da usare con `expect.poll(() => readStore(page, 'kits'))`: `page.waitForFunction` con una
 * funzione che restituisce una Promise NON aspetta la Promise (la considera già "vera").
 */
export function readStore<T = unknown>(
  page: Page,
  store: 'clips' | 'projects' | 'kits',
): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('soundverse')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const request = open.result.transaction(name).objectStore(name).getAll()
          request.onsuccess = () => {
            open.result.close()
            resolve(request.result as T[])
          }
          request.onerror = () => reject(request.error)
        }
      }),
    store,
  )
}
