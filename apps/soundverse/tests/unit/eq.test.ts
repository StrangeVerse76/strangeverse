import { describe, expect, it } from 'vitest'
import { highShelf, peaking, responseDb } from '../../app/eq/biquad'
import { warmthCurve } from '../../app/eq/graph'
import {
  bandwidthToQ,
  defaultEq,
  eqFilters,
  eqPresets,
  usesSide,
  type EqSpec,
} from '../../app/eq/spec'

const SR = 48_000
const curve = (spec: EqSpec, hz: number) =>
  responseDb(
    eqFilters(spec, SR).map((p) => p.filter),
    hz,
    SR,
  )
const withLow = (boost: number, atten: number, freq: 20 | 30 | 60 | 100 = 100) => {
  const eq = defaultEq()
  eq.low = { ...eq.low, freq, boost, atten }
  return eq
}
const band = (from: number, to: number) =>
  Array.from({ length: 60 }, (_, i) => from * Math.pow(to / from, i / 59))

describe('bassi "a programma" (trucco Pultec)', () => {
  it('boost e atten a fondo su 100 Hz: +12,4 dB a 20 Hz e −16 dB a 250 Hz, come in Bragi', () => {
    const eq = withLow(10, 10)
    expect(curve(eq, 20)).toBeCloseTo(12.4, 1)
    expect(curve(eq, 250)).toBeCloseTo(-16.1, 1)
  })

  it('insieme non diventano un semplice taglio: sotto si pompa, sopra si scava', () => {
    const eq = withLow(10, 10)
    expect(Math.max(...band(20, 60).map((hz) => curve(eq, hz)))).toBeGreaterThan(8)
    expect(Math.min(...band(150, 600).map((hz) => curve(eq, hz)))).toBeLessThan(-10)
  })

  it('il boost da solo non scava mai, l’atten da solo non pompa mai', () => {
    const all = band(20, 20_000)
    expect(Math.min(...all.map((hz) => curve(withLow(10, 0), hz)))).toBeGreaterThan(-0.1)
    expect(Math.max(...all.map((hz) => curve(withLow(0, 10), hz)))).toBeLessThan(0.1)
  })
})

describe('sezioni e preset', () => {
  it('l’EQ neutro non ha filtri e non cambia niente', () => {
    expect(eqFilters(defaultEq(), SR)).toEqual([])
    expect(curve(defaultEq(), 1000)).toBe(0)
  })

  it('banda più larga = Q più basso', () => {
    expect(bandwidthToQ(0)).toBeCloseTo(4)
    expect(bandwidthToQ(10)).toBeCloseTo(0.3)
    expect(bandwidthToQ(3)).toBeGreaterThan(bandwidthToQ(7))
  })

  it('l’atten degli alti è uno scaffale che scende sopra la frequenza scelta', () => {
    const filters = [highShelf(5000, -16, 0.7, SR)]
    expect(responseDb(filters, 100, SR)).toBeCloseTo(0, 1)
    expect(responseDb(filters, 18_000, SR)).toBeLessThan(-14)
  })

  it('una campana ha il suo guadagno al centro', () => {
    expect(responseDb([peaking(1000, 6, 1, SR)], 1000, SR)).toBeCloseTo(6, 5)
  })

  it('in mid/side ogni sezione va dove è assegnata; in stereo tutto è stereo', () => {
    const eq = eqPresets.find((p) => p.name === 'Allarga')?.spec()
    if (!eq) throw new Error('preset mancante')
    expect(eqFilters(eq, SR).map((p) => p.target)).toEqual(['side', 'side'])
    expect(usesSide(eq)).toBe(true)
    expect(eqFilters({ ...eq, mode: 'stereo' }, SR).map((p) => p.target)).toEqual([
      'stereo',
      'stereo',
    ])
    expect(usesSide({ ...eq, mode: 'stereo' })).toBe(false)
  })

  it('ogni preset produce filtri stabili (poli dentro il cerchio unitario)', () => {
    for (const preset of eqPresets) {
      for (const { filter } of eqFilters(preset.spec(), SR)) {
        const [, a1, a2] = filter.a
        expect(Math.abs(a2), preset.name).toBeLessThan(1)
        expect(Math.abs(a1), preset.name).toBeLessThan(1 + a2)
      }
    }
  })
})

describe('calore', () => {
  it('guadagno 1 per i segnali deboli (non alza il volume) e curva crescente', () => {
    const points = 2049
    const c = warmthCurve(10, points)
    const mid = (points - 1) / 2
    const slope = ((c[mid + 1] ?? 0) - (c[mid - 1] ?? 0)) / (2 * (2 / (points - 1)))
    expect(slope).toBeCloseTo(1, 2)
    expect(c[mid]).toBeCloseTo(0, 5)
    for (let i = 1; i < points; i++) expect(c[i]).toBeGreaterThan(c[i - 1] ?? -Infinity)
  })
})
