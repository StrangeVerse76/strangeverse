import { describe, expect, it } from 'vitest'
import { applyOps, rmsLevel } from '../../app/samples/ops'
import { pitchShift, timeStretch } from '../../app/samples/stretch'

const SR = 48_000
const tone = (hz: number, seconds: number, amp = 0.5) =>
  Float32Array.from(
    { length: Math.round(seconds * SR) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR),
  )

/** Frequenza stimata dagli attraversamenti dello zero, sulla parte centrale (lontano dai bordi). */
function frequency(signal: Float32Array): number {
  const from = Math.floor(signal.length * 0.2)
  const to = Math.floor(signal.length * 0.8)
  let crossings = 0
  for (let i = from + 1; i < to; i++) {
    if ((signal[i - 1] ?? 0) < 0 && (signal[i] ?? 0) >= 0) crossings++
  }
  return crossings / ((to - from) / SR)
}

const db = (x: number) => 20 * Math.log10(x)

describe('timeStretch (WSOLA)', () => {
  it.each([0.5, 1.5, 2, 3])(
    '×%s cambia la durata e lascia l’intonazione (entro l’1%%)',
    (factor) => {
      const [out] = timeStretch([tone(440, 1)], factor)
      expect(out?.length).toBe(Math.round(SR * factor))
      expect(frequency(out ?? new Float32Array())).toBeGreaterThan(440 * 0.99)
      expect(frequency(out ?? new Float32Array())).toBeLessThan(440 * 1.01)
    },
  )

  it('mantiene il livello (RMS entro 1 dB)', () => {
    const input = tone(440, 1)
    const [out] = timeStretch([input], 1.7)
    expect(
      Math.abs(db(rmsLevel([out ?? new Float32Array()])) - db(rmsLevel([input]))),
    ).toBeLessThan(1)
  })

  it('due canali uguali restano uguali (stesso spostamento per tutti i canali)', () => {
    const input = tone(330, 0.5)
    const [left, right] = timeStretch([input, input.slice()], 1.3)
    expect(right).toEqual(left)
  })

  it('×1 è una copia', () => {
    const input = tone(440, 0.1)
    const [out] = timeStretch([input], 1)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })

  it('10 s stereo in tempi ragionevoli', () => {
    const input = tone(220, 10)
    const started = performance.now()
    timeStretch([input, input], 1.25)
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

describe('pitchShift', () => {
  it.each([
    [12, 220, 440],
    [-12, 440, 220],
    [7, 440, 440 * Math.pow(2, 7 / 12)],
  ])('%s semitoni: da %s Hz a %s Hz, stessa durata', (semitones, from, to) => {
    const input = tone(from, 1)
    const [out] = pitchShift([input], semitones)
    expect(out?.length).toBe(input.length)
    expect(frequency(out ?? new Float32Array()) / to).toBeCloseTo(1, 1)
    expect(Math.abs(frequency(out ?? new Float32Array()) - to) / to).toBeLessThan(0.01)
  })
})

describe('operazioni di tempo e intonazione', () => {
  it('"da 120 a 60 BPM" raddoppia la durata; "da 120 a 240" la dimezza', () => {
    const input = [tone(440, 1)]
    expect(applyOps(input, [{ type: 'tempo', fromBpm: 120, toBpm: 60 }])[0]).toHaveLength(2 * SR)
    expect(applyOps(input, [{ type: 'tempo', fromBpm: 120, toBpm: 240 }])[0]).toHaveLength(SR / 2)
  })

  it('stretch e pitch sono operazioni della catena', () => {
    const input = [tone(440, 1)]
    expect(applyOps(input, [{ type: 'stretch', factor: 0.25 }])[0]).toHaveLength(SR / 4)
    expect(applyOps(input, [{ type: 'pitch', semitones: 3 }])[0]).toHaveLength(SR)
  })
})
