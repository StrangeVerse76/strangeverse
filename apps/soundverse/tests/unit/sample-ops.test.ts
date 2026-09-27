import { describe, expect, it } from 'vitest'
import { applyOps, defaultOp, rmsLevel, varispeed } from '../../app/samples/ops'

const SR = 48_000
const ramp = (length: number) => Float32Array.from({ length }, (_, i) => i / length)
const arr = (a: Float32Array) => Array.from(a)

describe('applyOps', () => {
  it('non modifica i canali della sorgente', () => {
    const source = [Float32Array.from([0.1, 0.2, 0.3])]
    applyOps(source, [{ type: 'reverse' }, { type: 'gain', db: 6 }])
    expect(arr(source[0] ?? new Float32Array())).toEqual([0.1, 0.2, 0.3].map(Math.fround))
  })

  it('trim taglia fra start ed end (secondi), anche se invertiti', () => {
    const source = [ramp(SR)]
    const [out] = applyOps(source, [{ type: 'trim', start: 0.5, end: 0.25 }])
    expect(out).toHaveLength(SR / 4)
    expect(out?.[0]).toBeCloseTo(0.25)
  })

  it('normalize porta il picco al valore richiesto', () => {
    const [out] = applyOps(
      [Float32Array.from([0.1, -0.25, 0.2])],
      [{ type: 'normalize', peakDb: 0 }],
    )
    expect(Math.max(...arr(out ?? new Float32Array()).map(Math.abs))).toBeCloseTo(1)
    expect(out?.[0]).toBeCloseTo(0.4)
  })

  it('normalize lascia intatto il silenzio', () => {
    const [out] = applyOps([new Float32Array(4)], [{ type: 'normalize', peakDb: -1 }])
    expect(arr(out ?? new Float32Array())).toEqual([0, 0, 0, 0])
  })

  it('reverse inverte, mono fa la media dei canali', () => {
    const left = Float32Array.from([1, 0])
    const right = Float32Array.from([0, 1])
    const reversed = applyOps([left], [{ type: 'reverse' }])
    expect(arr(reversed[0] ?? new Float32Array())).toEqual([0, 1])
    const mono = applyOps([left, right], [{ type: 'mono' }])
    expect(mono).toHaveLength(1)
    expect(arr(mono[0] ?? new Float32Array())).toEqual([0.5, 0.5])
  })

  it('gain applica i dB', () => {
    const [out] = applyOps([Float32Array.from([0.5])], [{ type: 'gain', db: -6.0206 }])
    expect(out?.[0]).toBeCloseTo(0.25, 4)
  })

  it('fade parte e finisce a zero, e si riduce se non ci sta', () => {
    const [out] = applyOps(
      [new Float32Array(SR).fill(1)],
      [{ type: 'fade', fadeIn: 0.1, fadeOut: 0.1 }],
    )
    expect(out?.[0]).toBe(0)
    expect(out?.[SR - 1]).toBe(0)
    expect(out?.[SR / 2]).toBe(1)
    expect(out?.[SR * 0.05]).toBeCloseTo(0.5, 2)

    const [short] = applyOps(
      [new Float32Array(100).fill(1)],
      [{ type: 'fade', fadeIn: 5, fadeOut: 5 }],
    )
    expect(short?.[0]).toBe(0)
    expect(short?.[99]).toBe(0)
  })

  it('le operazioni si applicano in ordine', () => {
    const source = [Float32Array.from([0, 0, 0, 1])]
    const a = applyOps(source, [{ type: 'trim', start: 0, end: 2 / SR }, { type: 'reverse' }])
    expect(arr(a[0] ?? new Float32Array())).toEqual([0, 0])
    const b = applyOps(source, [{ type: 'reverse' }, { type: 'trim', start: 0, end: 2 / SR }])
    expect(arr(b[0] ?? new Float32Array())).toEqual([1, 0])
  })
})

describe('varispeed', () => {
  it('a velocità doppia dimezza la durata, a metà la raddoppia', () => {
    expect(varispeed(ramp(1000), 2)).toHaveLength(500)
    expect(varispeed(ramp(1000), 0.5)).toHaveLength(2000)
  })

  it('interpola linearmente fra i campioni', () => {
    const out = varispeed(Float32Array.from([0, 1, 0]), 0.5)
    expect(arr(out)).toEqual([0, 0.5, 1, 0.5, 0, 0])
  })
})

describe('rmsLevel e defaultOp', () => {
  it('RMS di un’onda quadra piena è 1, del silenzio 0', () => {
    expect(rmsLevel([Float32Array.from([1, -1, 1, -1])])).toBe(1)
    expect(rmsLevel([new Float32Array(10)])).toBe(0)
  })

  it('le operazioni nuove hanno i valori predefiniti', () => {
    expect(defaultOp('speed')).toEqual({ type: 'speed', rate: 1 })
    expect(defaultOp('mono')).toEqual({ type: 'mono' })
  })
})
