import { describe, expect, it } from 'vitest'
import { computePeaks, peakLevel, toDb } from '../../app/audio/peaks'

describe('computePeaks', () => {
  it('prende il massimo assoluto per intervallo, su tutti i canali', () => {
    const left = new Float32Array([0.1, -0.2, 0.3, 0.4])
    const right = new Float32Array([0, 0.5, -0.9, 0])
    expect(computePeaks([left, right], 2)).toEqual([expect.closeTo(0.5, 6), expect.closeTo(0.9, 6)])
  })

  it('funziona anche con più intervalli che campioni', () => {
    const peaks = computePeaks([new Float32Array([0.5, -1])], 4)
    expect(peaks).toHaveLength(4)
    expect(Math.max(...peaks)).toBe(1)
  })

  it('restituisce zeri per l’audio vuoto', () => {
    expect(computePeaks([new Float32Array(0)], 3)).toEqual([0, 0, 0])
    expect(computePeaks([], 2)).toEqual([0, 0])
  })
})

describe('peakLevel e toDb', () => {
  it('misura il picco e lo converte in dBFS', () => {
    expect(peakLevel([new Float32Array([0.25, -0.5])])).toBe(0.5)
    expect(toDb(1)).toBe(0)
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2)
    expect(toDb(0)).toBe(-Infinity)
  })
})
