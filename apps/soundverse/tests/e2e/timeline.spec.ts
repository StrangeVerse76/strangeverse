import { readFile } from 'node:fs/promises'
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
const clock = (page: Page) => timeline(page).getByRole('status', { name: 'Posizione' })

async function importTone(page: Page, name: string, seconds: number) {
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

function readWav24Left(buffer: Buffer) {
  const channels = buffer.readUInt16LE(22)
  const dataSize = buffer.readUInt32LE(40)
  const frames = dataSize / (3 * channels)
  const left = new Float32Array(frames)
  for (let i = 0; i < frames; i++) left[i] = buffer.readIntLE(44 + i * 3 * channels, 3) / 0x800000
  return { channels, left }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('i clip si aggiungono in coda alla prima traccia', async ({ page }) => {
  await importTone(page, 'uno', 1)
  await importTone(page, 'due', 1)
  await addToTimeline(page, 'uno')
  await addToTimeline(page, 'due')

  const lane = timeline(page).getByRole('list', { name: 'Corsia Traccia 1' })
  await expect(lane.getByRole('listitem', { name: 'uno a 0:00.0' })).toBeVisible()
  await expect(lane.getByRole('listitem', { name: 'due a 0:01.0' })).toBeVisible()
  await expect(clock(page)).toHaveText('0:00.0 / 0:02.0')
})

test('trasporto: Play → Pausa → Riprendi → Stop, e click sul righello', async ({ page }) => {
  await importTone(page, 'lungo', 3)
  await addToTimeline(page, 'lungo')

  await timeline(page).getByRole('button', { name: 'Play' }).click()
  await expect(timeline(page).getByRole('button', { name: 'Pausa' })).toBeVisible()
  await page.waitForTimeout(400)
  await timeline(page).getByRole('button', { name: 'Pausa' }).click()
  await expect(timeline(page).getByRole('button', { name: 'Riprendi' })).toBeVisible()
  await expect(clock(page)).not.toHaveText(/^0:00\.0 /)
  const paused = await clock(page).textContent()

  await timeline(page).getByRole('button', { name: 'Riprendi' }).click()
  await expect(timeline(page).getByRole('button', { name: 'Pausa' })).toBeVisible()
  await timeline(page).getByRole('button', { name: 'Stop' }).click()
  await expect(timeline(page).getByRole('button', { name: 'Play' })).toBeVisible()
  await expect(clock(page)).toHaveText('0:00.0 / 0:03.0')
  expect(paused).not.toBe('0:00.0 / 0:03.0')

  // A 60 px/s (zoom predefinito), il click a 120 px dal bordo porta a 2 s.
  const ruler = timeline(page).getByTestId('ruler')
  await ruler.scrollIntoViewIfNeeded()
  await ruler.click({ position: { x: 120, y: 8 } })
  await expect(clock(page)).toHaveText(/^0:02\.0 \//)
  await expect(timeline(page).getByRole('button', { name: 'Riprendi' })).toBeVisible()
})

test('un clip trascinato dalla libreria si posa agganciato al battito', async ({ page }) => {
  await importTone(page, 'posato', 0.5)
  const lane = timeline(page).getByRole('list', { name: 'Corsia Traccia 2' })
  await lane.scrollIntoViewIfNeeded()
  const box = await lane.boundingBox()
  if (!box) throw new Error('corsia non visibile')

  // Gli eventi HTML5 di trascinamento, con un DataTransfer vero condiviso fra sorgente e destinazione.
  // 100 px a 60 px/s = 1,67 s → agganciato al battito (0,5 s a 120 BPM) = 1,5 s.
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  const at = { clientX: box.x + 100, clientY: box.y + 20 }
  await clipButton(page, 'posato').dispatchEvent('dragstart', { dataTransfer })
  await lane.dispatchEvent('dragover', { dataTransfer, ...at })
  await lane.dispatchEvent('drop', { dataTransfer, ...at })
  await expect(lane.getByRole('listitem', { name: 'posato a 0:01.5' })).toBeVisible()
})

test('ripetizioni e render: il mix dura quanto la timeline', async ({ page }) => {
  await importTone(page, 'mezzo', 0.5)
  await addToTimeline(page, 'mezzo')

  const repeat = timeline(page)
    .getByRole('region', { name: 'Blocco selezionato' })
    .getByRole('slider', { name: 'Ripeti' })
  await repeat.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(timeline(page).getByRole('listitem', { name: /mezzo/ })).toContainText('×3')
  await expect(clock(page)).toHaveText('0:00.0 / 0:01.5')

  await timeline(page).getByRole('textbox', { name: 'Nome del mix' }).fill('Il mio mix')
  await timeline(page).getByRole('button', { name: 'Renderizza in libreria' }).click()
  await expect(clipButton(page, 'Il mio mix')).toContainText('Mix · 0:01.5 · stereo')
})

test('nel mix renderizzato ogni clip parte al campione giusto', async ({ page }) => {
  await importTone(page, 'primo', 0.5)
  await importTone(page, 'secondo', 0.5)
  await addToTimeline(page, 'primo')
  await addToTimeline(page, 'secondo') // a 0,5 s
  // Frecce sul blocco selezionato: un battito (0,5 s) più avanti → parte a 1,0 s.
  const block = timeline(page).getByRole('listitem', { name: 'secondo a 0:00.5' })
  await block.focus()
  await page.keyboard.press('ArrowRight')
  await expect(timeline(page).getByRole('listitem', { name: 'secondo a 0:01.0' })).toBeVisible()

  await timeline(page).getByRole('button', { name: 'Renderizza in libreria' }).click()
  await expect(clipButton(page, 'Mix')).toContainText('0:01.5 · stereo')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library(page).getByRole('button', { name: 'Scarica WAV' }).click(),
  ])
  const path = await download.path()
  if (!path) throw new Error('download non salvato')
  const { channels, left } = readWav24Left(await readFile(path))
  expect(channels).toBe(2)

  const firstAbove = (from: number) => {
    for (let i = from; i < left.length; i++) if (Math.abs(left[i] ?? 0) > 0.001) return i
    return -1
  }
  // Silenzio fra 0,5 e 1,0 s, poi il secondo clip entro 1 ms da 1,0 s.
  const silentEnd = firstAbove(24_100)
  expect(Math.abs(silentEnd - 48_000)).toBeLessThanOrEqual(48)
})

test('eliminando un clip dalla libreria sparisce anche dalla timeline', async ({ page }) => {
  await importTone(page, 'temporaneo', 0.5)
  await addToTimeline(page, 'temporaneo')
  await expect(timeline(page).getByRole('listitem', { name: /temporaneo/ })).toBeVisible()

  await library(page).getByRole('button', { name: 'Elimina' }).click()
  await expect(timeline(page).getByRole('listitem', { name: /temporaneo/ })).toHaveCount(0)
})
