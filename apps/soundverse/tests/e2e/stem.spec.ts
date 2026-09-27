import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

function toneWav(seconds: number, hz: number): Buffer {
  const data = Float32Array.from(
    { length: Math.round(seconds * 48_000) },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / 48_000),
  )
  return Buffer.from(encodeWav([data], 48_000))
}

/** Legge le voci di uno zip "store": nome e contenuto. */
function unzip(bytes: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = []
  let at = 0
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const size = bytes.readUInt32LE(at + 18)
    const nameLength = bytes.readUInt16LE(at + 26)
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString('utf8')
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size)
    out.push({ name, data })
    at += 30 + nameLength + size
  }
  return out
}

const library = (page: Page) => page.getByRole('region', { name: 'Libreria' })
const timeline = (page: Page) => page.getByRole('region', { name: 'Timeline' })

test('uno stem per traccia, allineati e lunghi quanto il mix, in uno zip', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  for (const [name, seconds, hz] of [
    ['basso', 1, 110],
    ['lead', 0.5, 880],
  ] as const) {
    await page
      .getByTestId('import-input')
      .setInputFiles({ name: `${name}.wav`, mimeType: 'audio/wav', buffer: toneWav(seconds, hz) })
    await expect(library(page).getByRole('button', { name: new RegExp(`^${name} `) })).toBeVisible()
  }
  // basso sulla traccia 1 (0–1 s), lead sulla traccia 2 a 1 s (1–1,5 s).
  await library(page)
    .getByRole('button', { name: /^basso / })
    .click()
  await library(page).getByRole('button', { name: 'Aggiungi alla timeline' }).click()
  const lane = timeline(page).getByRole('list', { name: 'Corsia Traccia 2' })
  await lane.scrollIntoViewIfNeeded()
  const box = await lane.boundingBox()
  if (!box) throw new Error('corsia non visibile')
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await library(page)
    .getByRole('button', { name: /^lead / })
    .dispatchEvent('dragstart', { dataTransfer })
  const at = { clientX: box.x + 60, clientY: box.y + 20 } // 60 px = 1 s
  await lane.dispatchEvent('dragover', { dataTransfer, ...at })
  await lane.dispatchEvent('drop', { dataTransfer, ...at })

  await timeline(page).getByRole('textbox', { name: 'Nome del mix' }).fill('Demo')
  await timeline(page).getByRole('checkbox', { name: 'anche in libreria' }).check()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    timeline(page).getByRole('button', { name: 'Esporta 2 stem' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('Demo stem.zip')
  const path = await download.path()
  if (!path) throw new Error('download non salvato')
  const entries = unzip(await readFile(path))
  expect(entries.map((e) => e.name)).toEqual(['Demo - Traccia 1.wav', 'Demo - Traccia 2.wav'])

  const frames = entries.map((e) => e.data.readUInt32LE(40) / (3 * e.data.readUInt16LE(22)))
  expect(frames[0]).toBe(frames[1]) // stessa durata
  expect(frames[0]).toBe(1.5 * 48_000)

  // Nello stem della traccia 2 il primo secondo è muto (lead parte a 1 s).
  const lead = entries[1]?.data
  if (!lead) throw new Error('stem mancante')
  const channels = lead.readUInt16LE(22)
  const sample = (frame: number) => Math.abs(lead.readIntLE(44 + frame * 3 * channels, 3))
  expect(Math.max(...Array.from({ length: 1000 }, (_, i) => sample(i * 40)))).toBe(0)
  // Dopo 1 s c'è segnale: il picco su una finestra (un campione singolo può cadere sullo zero).
  const from = Math.round(1.1 * 48_000)
  expect(Math.max(...Array.from({ length: 200 }, (_, i) => sample(from + i)))).toBeGreaterThan(
    0x100000,
  )

  await expect(library(page).getByRole('button', { name: /^Demo – Traccia 1 / })).toBeVisible()
})
