import { expect, test, type Page } from '@playwright/test'

/** Un controller MIDI finto: `window.__midiSend([status, a, b])` manda un messaggio. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input: {
      id: string
      name: string
      onmidimessage: ((e: { data: Uint8Array }) => void) | null
    } = {
      id: 'finto',
      name: 'Controller di prova',
      onmidimessage: null,
    }
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: async () => ({
        inputs: new Map([['finto', input]]),
        outputs: new Map(),
        onstatechange: null,
      }),
    })
    ;(window as unknown as { __midiSend: (b: number[]) => void }).__midiSend = (bytes) =>
      input.onmidimessage?.({ data: new Uint8Array(bytes) })
  })
}

const send = (page: Page, bytes: number[]) =>
  page.evaluate(
    (b) => (window as unknown as { __midiSend: (b: number[]) => void }).__midiSend(b),
    bytes,
  )
const midi = (page: Page) => page.getByRole('region', { name: 'MIDI', exact: true })
const pads = (page: Page) => page.getByRole('region', { name: 'Pad', exact: true })
const hits = async (page: Page, pad: string) =>
  Number(
    await pads(page)
      .getByRole('button', { name: new RegExp(`^Pad ${pad}:`) })
      .getAttribute('data-hits'),
  )

async function connect(page: Page) {
  await page.goto('/')
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await midi(page).scrollIntoViewIfNeeded()
  await midi(page).getByRole('button', { name: 'Collega MIDI' }).click()
  await expect(midi(page).getByRole('list', { name: 'Ingressi MIDI' })).toContainText(
    'Controller di prova',
  )
}

test('le note del controller suonano i pad (Do1 = A1)', async ({ page }) => {
  await fakeMidi(page)
  await connect(page)
  const before = await hits(page, 'A1')
  await send(page, [0x90, 36, 100])
  await expect.poll(() => hits(page, 'A1')).toBe(before + 1)
  await expect(midi(page).getByText('Nota 36 · velocity 100')).toBeVisible()
})

test('Impara pad: la prossima nota va al pad selezionato', async ({ page }) => {
  await fakeMidi(page)
  await connect(page)
  await pads(page)
    .getByRole('button', { name: /^Pad A6:/ })
    .dispatchEvent('pointerdown')
  await midi(page).getByRole('button', { name: 'Impara pad' }).click()
  await expect(midi(page).getByText('andrà al pad A6')).toBeVisible()
  await send(page, [0x90, 60, 90])
  await expect(midi(page).getByRole('list', { name: 'Mappature MIDI' })).toContainText(
    'Nota 60 → pad A6',
  )

  const before = await hits(page, 'A6')
  await send(page, [0x90, 60, 90])
  await expect.poll(() => hits(page, 'A6')).toBe(before + 1)
})

test('Impara manopola: un CC muove il pan, e la mappa resta dopo il ricaricamento', async ({
  page,
}) => {
  await fakeMidi(page)
  await connect(page)
  await midi(page).getByRole('button', { name: 'Impara manopola' }).click()
  const pan = page
    .getByRole('region', { name: 'Mixer', exact: true })
    .getByRole('slider', { name: 'Pan Traccia 1' })
  await pan.focus()
  await send(page, [0xb0, 10, 64])
  await expect(midi(page).getByRole('list', { name: 'Mappature MIDI' })).toContainText(
    'CC 10 (canale 1) → Pan Traccia 1',
  )

  await send(page, [0xb0, 10, 0])
  await expect(pan).toHaveAttribute('aria-valuenow', '-1')
  await send(page, [0xb0, 10, 127])
  await expect(pan).toHaveAttribute('aria-valuenow', '1')

  await page.reload()
  await midi(page).scrollIntoViewIfNeeded()
  await midi(page).getByRole('button', { name: 'Collega MIDI' }).click()
  await expect(midi(page).getByRole('list', { name: 'Mappature MIDI' })).toContainText(
    'Pan Traccia 1',
  )
})

test('senza Web MIDI il pannello lo dice', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
      value: undefined,
      configurable: true,
    })
    delete (Navigator.prototype as { requestMIDIAccess?: unknown }).requestMIDIAccess
  })
  await page.goto('/')
  // Come negli altri test: un clic prima che l'app sia pronta andrebbe perso.
  await expect(page.getByText('La libreria è vuota')).toBeVisible()
  await midi(page).scrollIntoViewIfNeeded()
  await midi(page).getByRole('button', { name: 'Collega MIDI' }).click()
  await expect(midi(page).getByText('non supporta il MIDI')).toBeVisible()
})
