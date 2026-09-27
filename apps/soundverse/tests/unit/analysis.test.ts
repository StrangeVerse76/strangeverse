import { describe, expect, it } from 'vitest'
import { analyze, estimateBpm, estimateKey, keyNames } from '../../app/analysis/analyze'
import { fft } from '../../app/analysis/fft'

const SR = 48_000

/** Una "batteria" di prova: colpi di rumore smorzato a tempo, con accento sul primo di ogni 4. */
function clickTrack(bpm: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  const period = (60 / bpm) * SR
  let seed = 1
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let beat = 0, start = 0; start < out.length; beat++, start = Math.round(beat * period)) {
    const amp = beat % 4 === 0 ? 1 : 0.6
    for (let i = 0; i < 2400 && start + i < out.length; i++) {
      out[start + i] = (out[start + i] ?? 0) + amp * noise() * Math.exp(-i / 300)
    }
  }
  return out
}

const midiHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12)

/** Accordi suonati uno dopo l'altro (note MIDI), con qualche armonica: come un piano elementare. */
function chords(progression: number[][], secondsEach: number): Float32Array {
  const each = Math.round(secondsEach * SR)
  const out = new Float32Array(each * progression.length)
  progression.forEach((notes, c) => {
    for (const note of notes) {
      const hz = midiHz(note)
      for (let i = 0; i < each; i++) {
        const t = i / SR
        const env = Math.exp(-t * 1.5)
        const s =
          Math.sin(2 * Math.PI * hz * t) +
          0.4 * Math.sin(4 * Math.PI * hz * t) +
          0.2 * Math.sin(6 * Math.PI * hz * t)
        out[c * each + i] = (out[c * each + i] ?? 0) + 0.15 * env * s
      }
    }
  })
  return out
}

// Triadi (MIDI): Do = 60.
const C = [48, 60, 64, 67]
const F = [53, 65, 69, 72]
const G = [55, 67, 71, 74]
const Am = [57, 69, 72, 76]
const Dm = [50, 62, 65, 69]
const E = [52, 64, 68, 71]

describe('fft', () => {
  it('trova la frequenza di una sinusoide nel bin giusto', () => {
    const n = 1024
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 64 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    const magnitudes = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k] ?? 0, im[k] ?? 0))
    expect(magnitudes.indexOf(Math.max(...magnitudes))).toBe(64)
  })
})

describe('estimateBpm', () => {
  it.each([70, 90, 100, 120, 128, 140, 160])('%s BPM entro 1 BPM', (bpm) => {
    const estimated = estimateBpm(clickTrack(bpm, 12))
    expect(estimated).not.toBeNull()
    expect(Math.abs((estimated ?? 0) - bpm)).toBeLessThanOrEqual(1)
  })

  it('sopra i 160 BPM può leggere la metà (ambiguità di ottava): per questo ci sono ×2 e ÷2', () => {
    const estimated = estimateBpm(clickTrack(174, 12)) ?? 0
    const ok = [174, 87].some((bpm) => Math.abs(estimated - bpm) <= 1)
    expect(ok).toBe(true)
  })

  it('il silenzio non ha un tempo', () => {
    expect(estimateBpm(new Float32Array(SR * 4))).toBeNull()
  })
})

describe('estimateKey', () => {
  it('Do–Fa–Sol–Do è Do maggiore', () => {
    expect(estimateKey(chords([C, F, G, C, F, G, C], 1))).toBe('Do maggiore')
  })

  it('La–Re–Mi (minore) è La minore', () => {
    expect(estimateKey(chords([Am, Dm, E, Am, Dm, E, Am], 1))).toBe('La minore')
  })

  it('trasportata di una quinta, Sol maggiore', () => {
    const up = (chord: number[]) => chord.map((n) => n + 7)
    expect(estimateKey(chords([up(C), up(F), up(G), up(C), up(F), up(G)], 1))).toBe('Sol maggiore')
  })

  it('ci sono 24 tonalità con nomi italiani', () => {
    expect(keyNames).toHaveLength(24)
    expect(keyNames).toContain('Fa# minore')
  })
})

describe('analyze', () => {
  it('sotto i 2 secondi non stima niente', () => {
    expect(analyze([clickTrack(120, 1.5)])).toEqual({ bpm: null, key: null })
  })
})
