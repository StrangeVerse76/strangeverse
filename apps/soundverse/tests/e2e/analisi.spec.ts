import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

const SR = 48_000

function clickTrack(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  const period = (60 / bpm) * SR
  let seed = 1
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let beat = 0, start = 0; start < out.length; beat++, start = Math.round(beat * period)) {
    for (let i = 0; i < 2400 && start + i < out.length; i++) {
      out[start + i] = (out[start + i] ?? 0) + 0.8 * noise() * Math.exp(-i / 300)
    }
  }
  return out
}

function cMajorChords(): Float32Array {
  const each = SR
  const progression = [
    [48, 60, 64, 67],
    [53, 65, 69, 72],
    [55, 67, 71, 74],
    [48, 60, 64, 67],
  ]
  const out = new Float32Array(each * progression.length)
  progression.forEach((notes, c) => {
    for (const note of notes) {
      const hz = 440 * Math.pow(2, (note - 69) / 12)
      for (let i = 0; i < each; i++) {
        const t = i / SR
        out[c * each + i] =
          (out[c * each + i] ?? 0) + 0.15 * Math.exp(-t * 1.5) * Math.sin(2 * Math.PI * hz * t)
      }
    }
  })
  return out
}

const library = (page: Page) => page.getByRole('region', { name: 'Libreria' })
const clipButton = (page: Page, name: string) =>
  library(page)
    .getByRole('list', { name: 'Clip' })
    .getByRole('button', { name: new RegExp(`^${name} `) })

async function importSignal(page: Page, name: string, signal: Float32Array) {
  await page.getByTestId('import-input').setInputFiles({
    name: `${name}.wav`,
    mimeType: 'audio/wav',
    buffer: Buffer.from(encodeWav([signal], SR)),
  })
  await expect(clipButton(page, name)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('all’importazione stima BPM e tonalità', async ({ page }) => {
  await importSignal(page, 'click', clickTrack(100, 6))
  await expect(clipButton(page, 'click')).toContainText(/ · (99|100|101)(\.\d)? BPM/)

  await importSignal(page, 'accordi', cMajorChords())
  await expect(clipButton(page, 'accordi')).toContainText('Do maggiore')
})

test('BPM e tonalità si correggono a mano, anche con ×2, e restano dopo il ricaricamento', async ({
  page,
}) => {
  await importSignal(page, 'loop', clickTrack(100, 4))
  const bpm = library(page).getByRole('spinbutton', { name: 'BPM del clip' })
  await bpm.fill('87')
  await bpm.press('Enter')
  await library(page).getByRole('button', { name: 'Raddoppia il BPM' }).click()
  await expect(bpm).toHaveValue('174')
  await library(page).getByRole('combobox', { name: 'Tonalità del clip' }).selectOption('Re minore')

  await page.reload()
  await expect(clipButton(page, 'loop')).toContainText('174 BPM · Re minore')
})

test('i clip della batteria hanno il BPM esatto del pattern', async ({ page }) => {
  const drums = page.getByRole('region', { name: 'Batteria' })
  const bpm = drums.getByRole('slider', { name: 'BPM' })
  await bpm.focus()
  await page.keyboard.press('ArrowUp') // 121
  await drums.getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(clipButton(page, 'Batteria')).toContainText('121 BPM')
})

test('"Da BPM a BPM" parte dal BPM stimato della sorgente', async ({ page }) => {
  await importSignal(page, 'lento', clickTrack(90, 6))
  const samples = page.getByRole('region', { name: 'Campioni' })
  await samples
    .getByRole('combobox', { name: 'Operazione da aggiungere' })
    .selectOption({ label: 'Da BPM a BPM' })
  await samples.getByRole('button', { name: 'Aggiungi', exact: true }).click()
  await expect(samples.getByRole('slider', { name: 'Da', exact: true })).toHaveAttribute(
    'aria-valuenow',
    /^(89|90|91)(\.\d)?$/,
  )
  await expect(samples.getByRole('slider', { name: 'A', exact: true })).toHaveAttribute(
    'aria-valuenow',
    '120',
  )
})
