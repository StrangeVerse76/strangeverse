import { describe, expect, it } from 'vitest'
import { collapseMono, countInSeconds, joinChunks, meterLevel, peakDb } from '../../app/record/take'

describe('registrazione', () => {
  it('unisce i blocchi in canali continui', () => {
    const joined = joinChunks([
      [Float32Array.from([1, 2]), Float32Array.from([3, 4])],
      [Float32Array.from([5]), Float32Array.from([6])],
    ])
    expect(joined.map((c) => Array.from(c))).toEqual([
      [1, 2, 5],
      [3, 4, 6],
    ])
  })

  it('un ingresso mono (un canale per blocco) resta mono', () => {
    const joined = joinChunks([[Float32Array.from([1])], [Float32Array.from([2])]])
    expect(joined).toHaveLength(1)
    expect(Array.from(joined[0] ?? [])).toEqual([1, 2])
  })

  it('due canali identici diventano uno solo; diversi restano due', () => {
    const same = Float32Array.from([0.1, 0.2])
    expect(collapseMono([same, Float32Array.from(same)])).toHaveLength(1)
    expect(collapseMono([same, Float32Array.from([0.1, 0.3])])).toHaveLength(2)
  })

  it('conteggio e livello', () => {
    expect(countInSeconds(1, 120)).toBe(2)
    expect(countInSeconds(2, 60)).toBe(8)
    expect(peakDb(Float32Array.from([0.5, -1]))).toBe(0)
    expect(peakDb(new Float32Array(4))).toBe(-Infinity)
  })
})

describe('misuratore', () => {
  it('sale subito al picco e scende di 20 dB al secondo', () => {
    expect(meterLevel(-Infinity, -12, 0.016)).toBe(-12)
    expect(meterLevel(-12, -Infinity, 0.5)).toBeCloseTo(-22)
    expect(meterLevel(-12, -6, 0.5)).toBe(-6)
    expect(meterLevel(-55, -Infinity, 1)).toBe(-Infinity)
  })
})
