import { describe, expect, it } from 'vitest'
import { encodeMp3Chunks } from '../../app/audio/mp3-core'

const SR = 48_000
const tone = (seconds: number) =>
  Float32Array.from(
    { length: Math.round(seconds * SR) },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR),
  )

function join(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Legge l'intestazione del primo frame MPEG-1 Layer III. */
function header(bytes: Uint8Array) {
  const b1 = bytes[1] ?? 0
  const b2 = bytes[2] ?? 0
  const b3 = bytes[3] ?? 0
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  return {
    sync: (bytes[0] ?? 0) === 0xff && (b1 & 0xe0) === 0xe0,
    mpeg1: ((b1 >> 3) & 0b11) === 0b11,
    layer3: ((b1 >> 1) & 0b11) === 0b01,
    kbps: bitrates[(b2 >> 4) & 0x0f],
    sampleRate: [44_100, 48_000, 32_000][(b2 >> 2) & 0b11],
    mono: ((b3 >> 6) & 0b11) === 0b11,
  }
}

describe('encodeMp3Chunks', () => {
  it.each([128, 192, 320] as const)(
    'stereo a %s kbps: intestazione giusta e dimensione coerente',
    (kbps) => {
      const bytes = join(encodeMp3Chunks([tone(2), tone(2)], SR, kbps))
      const h = header(bytes)
      expect(h).toMatchObject({
        sync: true,
        mpeg1: true,
        layer3: true,
        kbps,
        sampleRate: 48_000,
        mono: false,
      })
      const expected = (kbps * 1000 * 2) / 8
      expect(bytes.length).toBeGreaterThan(expected * 0.9)
      expect(bytes.length).toBeLessThan(expected * 1.15)
    },
  )

  it('un clip mono resta mono', () => {
    expect(header(join(encodeMp3Chunks([tone(1)], SR, 128))).mono).toBe(true)
  })

  it('segnala l’avanzamento fino a 1', () => {
    const progress: number[] = []
    encodeMp3Chunks([tone(3)], SR, 128, (f) => progress.push(f))
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })
})
