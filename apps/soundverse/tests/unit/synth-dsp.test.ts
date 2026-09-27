import { describe, expect, it } from 'vitest'
import { softclipCurve } from '../../app/audio/effects'
import { envelopeSchedule } from '../../app/audio/envelope'
import { generateNoise } from '../../app/audio/noise'
import { createRandom } from '../../app/audio/random'
import { defaultEffect, defaultSpec, normalizeSpec } from '../../app/synth/spec'
import { formatParam } from '../../app/utils/format'
import { fromNormalized, roundTo, toNormalized } from '../../app/utils/scale'

describe('createRandom', () => {
  it('stesso seed, stessa sequenza; seed diverso, sequenza diversa', () => {
    const a = createRandom(7)
    const b = createRandom(7)
    const c = createRandom(8)
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of seqA) expect(v).toBeLessThan(1)
  })
})

describe('generateNoise', () => {
  it.each(['white', 'pink', 'brown'] as const)(
    '%s è deterministico e resta in [-1, 1]',
    (color) => {
      const a = generateNoise(color, 4800, 123)
      expect(generateNoise(color, 4800, 123)).toEqual(a)
      expect(generateNoise(color, 4800, 124)).not.toEqual(a)
      expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1)
    },
  )

  it('il rumore marrone è più "lento" del bianco', () => {
    const change = (s: Float32Array) =>
      s.slice(1).reduce((sum, v, i) => sum + Math.abs(v - (s[i] ?? 0)), 0) / s.length
    expect(change(generateNoise('brown', 4800, 1))).toBeLessThan(
      change(generateNoise('white', 4800, 1)),
    )
  })
})

describe('envelopeSchedule', () => {
  it('mette il release alla fine della durata', () => {
    const s = envelopeSchedule({ attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 }, 1)
    expect(s.attackEnd).toBeCloseTo(0.1)
    expect(s.decayEnd).toBeCloseTo(0.3)
    expect(s.releaseStart).toBeCloseTo(0.7)
    expect(s.end).toBe(1)
    expect(s.sustain).toBe(0.5)
  })

  it('riduce le fasi in proporzione se non ci stanno', () => {
    const s = envelopeSchedule({ attack: 1, decay: 1, sustain: 0.5, release: 2 }, 2)
    expect(s.attackEnd).toBeCloseTo(0.5)
    expect(s.decayEnd).toBeCloseTo(1)
    expect(s.releaseStart).toBeCloseTo(1)
    expect(s.end).toBe(2)
  })
})

describe('scale dei controlli', () => {
  it('lineare e logaritmica sono reversibili', () => {
    const lin = { min: -12, max: 12 }
    const log = { min: 20, max: 20_000, log: true }
    expect(fromNormalized(toNormalized(3, lin), lin)).toBeCloseTo(3)
    expect(toNormalized(632.455, log)).toBeCloseTo(0.5, 3)
    expect(fromNormalized(0.5, log)).toBeCloseTo(632.455, 2)
    expect(toNormalized(99_999, log)).toBe(1)
  })

  it('roundTo evita gli errori di virgola mobile', () => {
    expect(roundTo(0.1 + 0.2, 0.01)).toBe(0.3)
    expect(roundTo(7.6, 1)).toBe(8)
  })
})

describe('normalizeSpec', () => {
  it('riporta i valori nei limiti e sostituisce quelli non numerici', () => {
    const spec = normalizeSpec({
      ...defaultSpec(),
      duration: 999,
      master: -1,
      oscillators: [{ waveform: 'sine', frequency: 5, gain: 2, detune: Number.NaN }],
      effects: [{ type: 'delay', time: 10, feedback: 2, mix: 0.5 }],
    })
    expect(spec.duration).toBe(30)
    expect(spec.master).toBe(0)
    expect(spec.oscillators[0]).toEqual({ waveform: 'sine', frequency: 20, gain: 1, detune: 0 })
    expect(spec.effects[0]).toEqual({ type: 'delay', time: 2, feedback: 0.95, mix: 0.5 })
  })

  it('crea effetti con i valori predefiniti', () => {
    expect(defaultEffect('bitcrush')).toEqual({ type: 'bitcrush', bits: 8, downsample: 4 })
  })
})

describe('softclipCurve', () => {
  it('è crescente e tocca -1 e 1 agli estremi', () => {
    const curve = softclipCurve(5, 101)
    expect(curve[0]).toBeCloseTo(-1)
    expect(curve[100]).toBeCloseTo(1)
    expect(curve[50]).toBeCloseTo(0)
    for (let i = 1; i < curve.length; i++)
      expect(curve[i]).toBeGreaterThan(curve[i - 1] ?? -Infinity)
  })
})

describe('formatParam', () => {
  it('usa unità compatte', () => {
    expect(formatParam(220, 'Hz')).toBe('220 Hz')
    expect(formatParam(1500, 'Hz')).toBe('1.50 kHz')
    expect(formatParam(55, 'Hz')).toBe('55.0 Hz')
    expect(formatParam(0.25, 's')).toBe('250 ms')
    expect(formatParam(1.5, 's')).toBe('1.50 s')
    expect(formatParam(3, 'dB')).toBe('+3.0 dB')
    expect(formatParam(-7, 'ct')).toBe('-7 ct')
    expect(formatParam(8, '', 1)).toBe('8')
    expect(formatParam(0.5, '')).toBe('0.50')
  })
})
