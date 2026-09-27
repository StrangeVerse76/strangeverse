import { expect, test, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

/** Tono di 1 s a 440 Hz, ampiezza 0,5 (picco -6 dBFS, RMS -9 dBFS). */
function toneWav(channels: 1 | 2): Buffer {
  const data = Float32Array.from(
    { length: 48_000 },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000),
  )
  return Buffer.from(
    encodeWav(
      Array.from({ length: channels }, () => data),
      48_000,
    ),
  )
}

const samples = (page: Page) => page.getByRole('region', { name: 'Campioni' })
const libraryList = (page: Page) =>
  page.getByRole('region', { name: 'Libreria' }).getByRole('list', { name: 'Clip' })

async function loadTone(page: Page, name = 'tono', channels: 1 | 2 = 2) {
  await samples(page)
    .getByTestId('sample-input')
    .setInputFiles({
      name: `${name}.wav`,
      mimeType: 'audio/wav',
      buffer: toneWav(channels),
    })
  await expect(samples(page).getByLabel('Analisi della sorgente')).toContainText('RMS -9.0 dBFS')
}

/** Trascina sulla forma d'onda della sorgente da una frazione all'altra della larghezza. */
async function dragOnWaveform(page: Page, from: number, to: number) {
  const wave = samples(page).getByRole('img', { name: /Forma d'onda della sorgente/ })
  // Il pannello sta nel rack che scorre in orizzontale: va portato in vista, come farebbe una persona.
  await wave.scrollIntoViewIfNeeded()
  const box = await wave.boundingBox()
  if (!box) throw new Error('forma d’onda non visibile')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * from, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * ((from + to) / 2), y, { steps: 4 })
  await page.mouse.move(box.x + box.width * to, y, { steps: 4 })
  await page.mouse.up()
}

async function addOp(page: Page, label: string) {
  await samples(page)
    .getByRole('combobox', { name: 'Operazione da aggiungere' })
    .selectOption({ label })
  await samples(page).getByRole('button', { name: 'Aggiungi', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
})

test('carica un file, lo usa come sorgente e ne mostra l’analisi', async ({ page }) => {
  await loadTone(page)

  await expect(samples(page).getByRole('combobox', { name: 'Clip sorgente' })).toHaveValue(/.+/)
  await expect(samples(page).getByLabel('Analisi della sorgente')).toHaveText(
    /0:01\.0 · stereo · picco -6\.0 dBFS · RMS -9\.0 dBFS/,
  )
  await expect(libraryList(page).getByRole('button', { name: /tono/ })).toBeVisible()
})

test('regione, catena di operazioni e nuovo clip; la sorgente resta intatta', async ({ page }) => {
  await loadTone(page)
  const trimOption = samples(page).getByRole('option', { name: 'Taglia sulla regione' })
  await expect(trimOption).toBeDisabled()

  await dragOnWaveform(page, 0.25, 0.75)
  await expect(samples(page).getByText(/Regione 0:00\.\d–0:00\.\d/)).toBeVisible()

  await addOp(page, 'Taglia sulla regione')
  await addOp(page, 'Inverti')
  await addOp(page, 'Mono')
  await addOp(page, 'Normalizza')
  await expect(
    samples(page).getByRole('listitem', { name: 'Operazione 1: Taglia sulla regione' }),
  ).toBeVisible()
  await expect(
    samples(page).getByRole('listitem', { name: 'Operazione 4: Normalizza' }),
  ).toBeVisible()

  await samples(page).getByRole('button', { name: 'Ascolta risultato' }).click()
  await expect(samples(page).getByLabel('Analisi del risultato')).toContainText(
    '0:00.5 · mono · picco -0.2 dBFS',
  )
  await samples(page).getByRole('button', { name: 'Stop' }).click()

  await samples(page).getByRole('button', { name: 'Crea nuovo clip' }).click()
  await expect(
    libraryList(page).getByRole('button', { name: /tono \(modificato\)/ }),
  ).toContainText('Campione · 0:00.5 · mono')
  await expect(libraryList(page).getByRole('button', { name: /^tono Campione/ })).toContainText(
    'Campione · 0:01.0 · stereo',
  )
})

test('il taglio resta uno solo e sempre in testa', async ({ page }) => {
  await loadTone(page)
  await addOp(page, 'Guadagno')
  await dragOnWaveform(page, 0.1, 0.4)
  await addOp(page, 'Taglia sulla regione')
  await dragOnWaveform(page, 0.5, 0.9)
  await addOp(page, 'Taglia sulla regione')

  const items = samples(page)
    .getByRole('list')
    .filter({ has: page.getByRole('listitem', { name: /Operazione/ }) })
  await expect(items.getByRole('listitem')).toHaveCount(2)
  await expect(
    samples(page).getByRole('listitem', { name: 'Operazione 1: Taglia sulla regione' }),
  ).toContainText(/0:00\.[45]–0:00\.9/)
})

test('un gesto brevissimo sulla forma d’onda fa partire l’ascolto da lì', async ({ page }) => {
  await loadTone(page)
  const wave = samples(page).getByRole('img', { name: /Forma d'onda della sorgente/ })
  await wave.click({ position: { x: 20, y: 20 } })

  await expect(samples(page).getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect(samples(page).getByText(/Regione/)).toHaveCount(0)
  await samples(page).getByRole('button', { name: 'Stop' }).click()
})

test('se la sorgente viene eliminata, il pannello si svuota', async ({ page }) => {
  await loadTone(page, 'da-eliminare', 1)
  await page
    .getByRole('region', { name: 'Clip selezionato' })
    .getByRole('button', { name: 'Elimina' })
    .click()
  await expect(samples(page).getByText('Scegli un clip della libreria come sorgente')).toBeVisible()
})
