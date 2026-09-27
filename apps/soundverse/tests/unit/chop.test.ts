import { describe, expect, it } from 'vitest'
import {
  beatSlices,
  detectTransients,
  gridSlices,
  normalizeMarkers,
  slicesFrom,
} from '../../app/chop/slices'

const SR = 48_000

/** Colpi di rumore smorzato agli istanti dati (s), con ampiezze diverse, più un fondo leggero. */
function hits(times: number[], seconds: number, amps: number[] = []): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  let seed = 7
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let i = 0; i < out.length; i++) out[i] = 0.002 * noise()
  times.forEach((t, k) => {
    const start = Math.round(t * SR)
    const amp = amps[k] ?? 0.8
    for (let i = 0; i < 6000 && start + i < out.length; i++)
      out[start + i] = (out[start + i] ?? 0) + amp * noise() * Math.exp(-i / 900)
  })
  return out
}

describe('detectTransients', () => {
  it('trova ogni colpo entro 2 ms, anche i più deboli', () => {
    const times = [0.25, 0.6, 1.1, 1.45, 2.0]
    const starts = detectTransients(hits(times, 2.5, [0.9, 0.3, 0.7, 0.2, 0.8]), 0.7, 0.05)
    expect(starts[0]).toBe(0)
    const found = starts.slice(1)
    expect(found).toHaveLength(times.length)
    found.forEach((s, i) => expect(Math.abs(s - (times[i] ?? 0) * SR)).toBeLessThanOrEqual(96))
  })

  it('con sensibilità bassa prende solo i colpi forti', () => {
    const starts = detectTransients(hits([0.25, 0.6, 1.1], 1.5, [0.9, 0.05, 0.9]), 0.1, 0.05)
    expect(starts.length - 1).toBe(2)
  })

  it('rispetta la distanza minima fra due tagli', () => {
    const starts = detectTransients(hits([0.3, 0.33, 0.8], 1.2), 0.8, 0.1)
    expect(starts.slice(1).map((s) => Math.round((s / SR) * 10) / 10)).toEqual([0.3, 0.8])
  })

  it('un colpo proprio all’inizio non crea una fetta vuota', () => {
    const starts = detectTransients(hits([0, 0.5], 1), 0.7, 0.05)
    expect(starts).toHaveLength(2)
    expect(starts[0]).toBe(0)
  })

  it('il silenzio è una fetta sola', () => {
    expect(detectTransients(new Float32Array(SR), 1, 0.05)).toEqual([0])
  })
})

describe('griglia e marcatori', () => {
  it('fette uguali e a tempo', () => {
    expect(gridSlices(1000, 4)).toEqual([0, 250, 500, 750])
    // 120 BPM, un battito = 0,5 s.
    expect(beatSlices(2 * SR, 120, 1)).toEqual([0, SR / 2, SR, 1.5 * SR])
  })

  it('i marcatori si riordinano, senza doppioni né fuori campione; lo 0 c’è sempre', () => {
    expect(normalizeMarkers([500, 100, 100, -5, 2000, 0], 1000)).toEqual([0, 100, 500])
    expect(slicesFrom([600, 300], 1000)).toEqual([
      [0, 300],
      [300, 600],
      [600, 1000],
    ])
  })
})

describe('beatSlices con un BPM non esatto', () => {
  it('non lascia una fetta minuscola in fondo', () => {
    // 2 s a 119,5 BPM: quattro battiti da 0,502 s e un avanzo di 8 ms.
    expect(beatSlices(2 * SR, 119.5, 1)).toHaveLength(4)
  })
})
