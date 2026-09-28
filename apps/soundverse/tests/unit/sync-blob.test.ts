import { describe, expect, it } from 'vitest'
import { encodeWav } from '../../app/audio/wav'
import { downloadUrls, removeAudio, uploadUrl } from '../../server/sync/blob'

// Test d'integrazione su Blob vero (prefisso `development/`): gira solo con le credenziali
// locali di `vercel env pull`, quindi non in CI.
const configured = !!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN

describe.skipIf(!configured)('audio su Blob con URL firmati', () => {
  it('carica, scarica e cancella un WAV', { timeout: 30_000 }, async () => {
    const pathname = `development/audio/test-${crypto.randomUUID()}.wav`
    const wav = new Uint8Array(
      encodeWav([Float32Array.from({ length: 480 }, (_, i) => i / 480)], 48_000),
    )
    const put = await fetch(await uploadUrl(pathname, wav.byteLength), {
      method: 'PUT',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    })
    expect(put.status, await put.clone().text()).toBeLessThan(300)

    // L'URL vale solo per la dimensione dichiarata: un file più grande viene rifiutato.
    const bigger = await fetch(await uploadUrl(pathname, wav.byteLength), {
      method: 'PUT',
      headers: { 'content-type': 'audio/wav' },
      body: new Uint8Array(wav.byteLength + 1000),
    })
    expect(bigger.ok).toBe(false)

    const [url] = await downloadUrls([pathname])
    const got = await fetch(url ?? '')
    expect(got.ok).toBe(true)
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(wav)

    await removeAudio(pathname)
    const [after] = await downloadUrls([pathname])
    expect((await fetch(`${after}&cache=0`)).status).toBe(404)
  })
})
