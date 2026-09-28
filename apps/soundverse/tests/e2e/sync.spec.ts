import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { encodeWav } from '../../app/audio/wav'

/**
 * Due "dispositivi" (due contesti del browser, ognuno con il suo IndexedDB) e un server finto in
 * memoria con le stesse regole di `server/sync`: versioni, eliminazioni, URL firmati per l'audio.
 */
interface Row {
  kind: string
  id: string
  data: unknown
  audioBytes: number | null
  seq: number
  deleted: boolean
}

function fakeServer() {
  const rows = new Map<string, Row>()
  const blobs = new Map<string, Buffer>()
  let seq = 0
  const remote = (r: Row) => ({ ...r, hasAudio: r.audioBytes !== null })

  async function install(context: BrowserContext) {
    await context.route('**/api/me', (route) =>
      route.fulfill({ json: { enabled: true, user: { name: 'Pietro', image: null } } }),
    )
    await context.route('**/api/sync/changes**', (route) => {
      const since = Number(new URL(route.request().url()).searchParams.get('since') ?? 0)
      const records = [...rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq)
      return route.fulfill({ json: { records: records.map(remote), more: false } })
    })
    await context.route('**/api/sync/push', (route) => {
      const { items } = route.request().postDataJSON() as {
        items: (Row & { base: number | null })[]
      }
      const results = items.map((item) => {
        const key = `${item.kind}:${item.id}`
        const current = rows.get(key)
        if ((current?.seq ?? null) !== item.base) {
          return {
            kind: item.kind,
            id: item.id,
            status: 'conflict',
            current: current && remote(current),
          }
        }
        const row: Row = {
          kind: item.kind,
          id: item.id,
          data: item.data,
          audioBytes: item.deleted ? null : (item.audioBytes ?? current?.audioBytes ?? null),
          seq: ++seq,
          deleted: item.deleted,
        }
        rows.set(key, row)
        if (item.deleted) blobs.delete(item.id)
        return { kind: item.kind, id: item.id, status: 'ok', seq: row.seq }
      })
      return route.fulfill({ json: { results } })
    })
    await context.route('**/api/sync/audio', (route) => {
      const body = route.request().postDataJSON() as { op: string; ids: string[] }
      if (body.op === 'put')
        return route.fulfill({ json: { urls: [`https://blob.test/${body.ids[0]}`] } })
      const urls = Object.fromEntries(
        body.ids.filter((id) => blobs.has(id)).map((id) => [id, `https://blob.test/${id}`]),
      )
      return route.fulfill({ json: { urls } })
    })
    await context.route('**/api/sync/usage', (route) =>
      route.fulfill({
        json: {
          audioBytes: [...blobs.values()].reduce((n, b) => n + b.byteLength, 0),
          quotaBytes: 1024 ** 3,
        },
      }),
    )
    await context.route('https://blob.test/**', async (route) => {
      const id = new URL(route.request().url()).pathname.slice(1)
      if (route.request().method() === 'PUT') {
        blobs.set(id, route.request().postDataBuffer() ?? Buffer.alloc(0))
        return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' } })
      }
      const blob = blobs.get(id)
      return blob
        ? route.fulfill({ body: blob, headers: { 'access-control-allow-origin': '*' } })
        : route.fulfill({ status: 404 })
    })
  }
  return { rows, blobs, install }
}

function toneWav(): Buffer {
  const data = Float32Array.from({ length: 24_000 }, (_, i) => 0.5 * Math.sin(i / 10))
  return Buffer.from(encodeWav([data], 48_000))
}

const library = (page: Page) =>
  page.getByRole('region', { name: 'Libreria' }).getByRole('list', { name: 'Clip' })
const synced = (page: Page) =>
  expect(page.getByRole('banner').getByRole('status')).toHaveText('Sincronizzato', {
    timeout: 15_000,
  })

test('quello che si crea su un dispositivo compare sull’altro', async ({ browser }) => {
  test.setTimeout(90_000)
  const server = fakeServer()
  const a = await browser.newContext()
  const b = await browser.newContext()
  await server.install(a)
  await server.install(b)

  // Dispositivo A: un campione importato (audio su Blob) e un clip synth (rifatto dalla ricetta).
  const pageA = await a.newPage()
  await pageA.goto('/')
  await expect(pageA.getByText('La libreria è vuota')).toBeVisible()
  await pageA
    .getByTestId('import-input')
    .setInputFiles({ name: 'tono.wav', mimeType: 'audio/wav', buffer: toneWav() })
  const synth = pageA.getByRole('region', { name: 'Synth' })
  await synth.getByRole('button', { name: 'Salva in libreria' }).click()
  await expect(library(pageA).getByRole('listitem')).toHaveCount(2)
  await expect
    .poll(() => [...server.rows.values()].filter((r) => r.kind === 'clip').length, {
      timeout: 15_000,
    })
    .toBe(2)
  await synced(pageA)
  expect(server.blobs.size).toBe(1) // solo il campione importato
  await expect(pageA.getByRole('banner')).toContainText('di audio')

  // Dispositivo B, vuoto: riceve entrambi.
  const pageB = await b.newPage()
  await pageB.goto('/')
  await synced(pageB)
  await expect(library(pageB).getByRole('button', { name: /^tono / })).toBeVisible()
  await expect(library(pageB).getByRole('button', { name: /^Synth / })).toBeVisible()
  const synthName = await library(pageA)
    .getByRole('button', { name: /^Synth / })
    .textContent()
  await expect(library(pageB).getByRole('button', { name: /^Synth / })).toHaveText(synthName ?? '')

  // Il progetto vuoto creato da ogni browser al primo avvio non viaggia.
  expect([...server.rows.values()].filter((r) => r.kind !== 'clip')).toEqual([])

  // Un progetto usato su A arriva su B, al posto del suo progetto vuoto.
  await library(pageA)
    .getByRole('button', { name: /^tono / })
    .click()
  await pageA.getByRole('button', { name: 'Aggiungi alla timeline' }).click()
  await pageA.getByRole('textbox', { name: 'Nome del progetto' }).fill('Demo')
  await expect
    .poll(
      () =>
        [...server.rows.values()].filter(
          (r) => r.kind === 'project' && (r.data as { name: string }).name === 'Demo',
        ).length,
      { timeout: 15_000 },
    )
    .toBe(1)
  await pageB.getByRole('button', { name: 'Sincronizza ora' }).click()
  const projects = pageB.getByRole('combobox', { name: 'Apri progetto' }).getByRole('option')
  await expect(projects).toHaveText(['Demo'])

  // Un'eliminazione su B arriva su A.
  await library(pageB)
    .getByRole('button', { name: /^tono / })
    .click()
  await pageB.getByRole('button', { name: 'Elimina', exact: true }).click()
  await expect
    .poll(
      () =>
        server.rows.get([...server.rows.keys()].find((k) => server.rows.get(k)?.deleted) ?? '')
          ?.deleted,
      {
        timeout: 15_000,
      },
    )
    .toBe(true)
  await pageA.getByRole('button', { name: 'Sincronizza ora' }).click()
  await expect(library(pageA).getByRole('button', { name: /^tono / })).toHaveCount(0)
  expect(server.blobs.size).toBe(0)

  await a.close()
  await b.close()
})
