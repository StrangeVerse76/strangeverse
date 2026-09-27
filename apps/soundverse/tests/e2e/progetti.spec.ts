import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

function toneWav(seconds: number): Buffer {
  const length = Math.round(seconds * 48_000)
  const data = Float32Array.from(
    { length },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000),
  )
  return Buffer.from(encodeWav([data], 48_000))
}

const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' })
const library = (page: Page) => page.getByRole('region', { name: 'Libreria' })
const clipButton = (page: Page, name: string) =>
  library(page)
    .getByRole('list', { name: 'Clip' })
    .getByRole('button', { name: new RegExp(`^${name} `) })
const projectSelect = (page: Page) =>
  timeline(page).getByRole('combobox', { name: 'Apri progetto' })
const projectName = (page: Page) =>
  timeline(page).getByRole('textbox', { name: 'Nome del progetto' })

async function importTone(page: Page, name: string, seconds = 0.5) {
  await page.getByTestId('import-input').setInputFiles({
    name: `${name}.wav`,
    mimeType: 'audio/wav',
    buffer: toneWav(seconds),
  })
  await expect(clipButton(page, name)).toBeVisible()
}

async function addToTimeline(page: Page, name: string) {
  await clipButton(page, name).click()
  await library(page).getByRole('button', { name: 'Aggiungi alla timeline' }).click()
}

/** Aspetta il salvataggio automatico (qualche centinaio di ms dopo l'ultima modifica). */
const waitForSave = (page: Page) => page.waitForTimeout(800)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await expect(projectName(page)).toHaveValue('Progetto 1')
})

test('il progetto si salva da solo e si ritrova dopo il ricaricamento', async ({ page }) => {
  await importTone(page, 'tono')
  await addToTimeline(page, 'tono')
  await projectName(page).fill('Mio brano')
  await waitForSave(page)

  await page.reload()
  await expect(projectName(page)).toHaveValue('Mio brano')
  await expect(timeline(page).getByRole('listitem', { name: 'tono a 0:00.0' })).toBeVisible()
})

test('Nuovo riparte da zero; il progetto precedente resta apribile', async ({ page }) => {
  await importTone(page, 'tono')
  await addToTimeline(page, 'tono')
  await timeline(page).getByRole('button', { name: '+ Traccia' }).click()
  const bpm = timeline(page).getByRole('slider', { name: 'BPM' })
  await bpm.focus()
  await page.keyboard.press('End')
  await expect(bpm).toHaveAttribute('aria-valuenow', '240')

  await timeline(page).getByRole('button', { name: 'Nuovo' }).click()
  await expect(projectName(page)).toHaveValue('Progetto 2')
  await expect(bpm).toHaveAttribute('aria-valuenow', '120')
  await expect(timeline(page).getByRole('group', { name: /^Traccia \d$/ })).toHaveCount(2)
  await expect(timeline(page).getByRole('listitem')).toHaveCount(0)

  await projectSelect(page).selectOption({ label: 'Progetto 1' })
  await expect(timeline(page).getByRole('listitem', { name: 'tono a 0:00.0' })).toBeVisible()
  await expect(bpm).toHaveAttribute('aria-valuenow', '240')
})

test('Duplica ed Elimina (con conferma)', async ({ page }) => {
  await importTone(page, 'tono')
  await addToTimeline(page, 'tono')
  await timeline(page).getByRole('button', { name: 'Duplica' }).click()
  await expect(projectName(page)).toHaveValue('Progetto 1 (copia)')
  await expect(timeline(page).getByRole('listitem', { name: 'tono a 0:00.0' })).toBeVisible()
  await expect(projectSelect(page).getByRole('option')).toHaveCount(2)

  await timeline(page).getByRole('button', { name: 'Elimina progetto' }).click()
  await timeline(page).getByRole('button', { name: 'Conferma eliminazione' }).click()
  await expect(projectSelect(page).getByRole('option')).toHaveCount(1)
  await expect(projectName(page)).toHaveValue('Progetto 1')
})

test('un progetto con clip non più in libreria si apre e segnala i blocchi mancanti', async ({
  page,
}) => {
  await importTone(page, 'effimero')
  await addToTimeline(page, 'effimero')
  await timeline(page).getByRole('button', { name: 'Nuovo' }).click()

  // Il clip si elimina mentre è aperto un altro progetto.
  await clipButton(page, 'effimero').click()
  await library(page).getByRole('button', { name: 'Elimina', exact: true }).click()
  // L'eliminazione è asincrona (IndexedDB): si cambia progetto solo quando è finita.
  await expect(clipButton(page, 'effimero')).toHaveCount(0)
  await projectSelect(page).selectOption({ label: 'Progetto 1' })

  await expect(timeline(page).getByRole('alert')).toContainText(
    '1 blocco usa clip non più in libreria',
  )
  await expect(
    timeline(page).getByRole('listitem', { name: 'Clip mancante a 0:00.0' }),
  ).toBeVisible()
  await timeline(page).getByRole('button', { name: 'Rimuovili' }).click()
  await expect(timeline(page).getByRole('listitem')).toHaveCount(0)
})

test('un clip mix si riapre come progetto dalla sua ricetta', async ({ page }) => {
  await importTone(page, 'base')
  await addToTimeline(page, 'base')
  await timeline(page).getByRole('textbox', { name: 'Nome del mix' }).fill('Versione A')
  await timeline(page).getByRole('button', { name: 'Renderizza in libreria' }).click()
  await expect(clipButton(page, 'Versione A')).toBeVisible()

  await timeline(page).getByRole('button', { name: 'Nuovo' }).click()
  await clipButton(page, 'Versione A').click()
  await library(page).getByRole('button', { name: 'Apri come progetto' }).click()
  await expect(projectName(page)).toHaveValue('Versione A')
  await expect(timeline(page).getByRole('listitem', { name: 'base a 0:00.0' })).toBeVisible()
})

test('un database della versione precedente si aggiorna senza perdere i clip', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // Prima dell'app: un database "soundverse" versione 1, com'era prima dei progetti, con un clip.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    const request = indexedDB.open('soundverse', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('clips', { keyPath: 'id' })
      db.createObjectStore('audio')
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['clips', 'audio'], 'readwrite')
      tx.objectStore('clips').put({
        id: 'vecchio',
        name: 'Clip di prima',
        kind: 'sample',
        tags: [],
        duration: 1,
        sampleRate: 48_000,
        channels: 1,
        peak: 0.5,
        peaks: [],
        createdAt: 1,
        recipe: { type: 'import', fileName: 'prima.wav' },
      })
      tx.objectStore('audio').put(new Blob([new Uint8Array(44)], { type: 'audio/wav' }), 'vecchio')
      tx.oncomplete = () => db.close()
    }
  })
  await page.goto('/')
  await page.waitForTimeout(300)
  await page.reload()

  await expect(clipButton(page, 'Clip di prima')).toBeVisible()
  await expect(projectName(page)).toHaveValue('Progetto 1')
  await context.close()
})
