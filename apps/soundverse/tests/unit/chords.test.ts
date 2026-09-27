import { describe, expect, it } from 'vitest'
import {
  chordDuration,
  keyName,
  noteSpec,
  notesOf,
  progressionVoice,
  type ProgressionSpec,
} from '../../app/chords/progression'
import {
  chordName,
  diatonicChord,
  midiToHz,
  randomProgression,
  roman,
  voiceChords,
} from '../../app/chords/theory'
import { chordSound } from '../../app/stores/chords'
import { fakeContext } from './fake-audio'

const C = 0
const A = 9

describe('accordi diatonici', () => {
  it('in Do maggiore: I, ii, V7, vii°, Imaj7', () => {
    expect(diatonicChord(C, 'major', 1, false)).toEqual({
      degree: 1,
      root: 0,
      intervals: [0, 4, 7],
    })
    expect(diatonicChord(C, 'major', 2, false)).toMatchObject({ root: 2, intervals: [0, 3, 7] })
    expect(diatonicChord(C, 'major', 5, true)).toMatchObject({ root: 7, intervals: [0, 4, 7, 10] })
    expect(diatonicChord(C, 'major', 7, false)).toMatchObject({ root: 11, intervals: [0, 3, 6] })
    expect(diatonicChord(C, 'major', 1, true).intervals).toEqual([0, 4, 7, 11])
  })

  it('in La minore il V è maggiore (sensibile), il VII resta Sol maggiore', () => {
    expect(diatonicChord(A, 'minor', 1, false)).toMatchObject({ root: 9, intervals: [0, 3, 7] })
    expect(diatonicChord(A, 'minor', 5, false)).toMatchObject({ root: 4, intervals: [0, 4, 7] })
    expect(diatonicChord(A, 'minor', 7, false)).toMatchObject({ root: 7, intervals: [0, 4, 7] })
    expect(diatonicChord(A, 'minor', 5, false, false).intervals).toEqual([0, 3, 7])
  })

  it('nomi italiani e numerali romani', () => {
    const name = (d: number, sevenths = false, mode: 'major' | 'minor' = 'major', tonic = C) =>
      chordName(diatonicChord(tonic, mode, d, sevenths))
    expect([1, 2, 5, 6, 7].map((d) => name(d))).toEqual(['Do', 'Rem', 'Sol', 'Lam', 'Si°'])
    expect([1, 2, 5, 7].map((d) => name(d, true))).toEqual(['Do maj7', 'Rem7', 'Sol7', 'Siø7'])
    expect(name(1, false, 'minor', A)).toBe('Lam')
    expect([5, 6, 7].map((d) => roman(diatonicChord(C, 'major', d, false)))).toEqual([
      'V',
      'vi',
      'vii°',
    ])
  })
})

describe('progressioni', () => {
  it('casuale ma deterministica: stesso seed, stessa progressione; parte dalla tonica', () => {
    expect(randomProgression(42)).toEqual(randomProgression(42))
    for (let seed = 1; seed < 50; seed++) {
      const p = randomProgression(seed, 4)
      expect(p).toHaveLength(4)
      expect(p[0]).toBe(1)
      expect([1, 6]).toContain(p[3])
      expect([4, 2]).toContain(p[1])
      expect([5, 7]).toContain(p[2])
    }
  })

  it('la condotta delle voci è morbida: le voci si muovono poco fra un accordo e l’altro', () => {
    const chords = [1, 5, 6, 4].map((d) => diatonicChord(C, 'major', d, false))
    const voiced = voiceChords(chords, 4)
    for (let i = 1; i < voiced.length; i++) {
      const prev = voiced[i - 1] ?? []
      const moves = (voiced[i] ?? []).map((n, v) => Math.abs(n - (prev[v] ?? n)))
      expect(Math.max(...moves)).toBeLessThanOrEqual(5)
    }
    // Le note sono quelle giuste (classi di altezza dell'accordo).
    expect(voiced[0]?.map((n) => n % 12).sort((a, b) => a - b)).toEqual([0, 4, 7])
  })
})

describe('suono e grafo', () => {
  const spec: ProgressionSpec = {
    tonic: C,
    mode: 'major',
    degrees: [1, 5, 6, 4],
    sevenths: false,
    bpm: 120,
    beatsPerChord: 2,
    octave: 4,
    bass: true,
    sound: chordSound(),
    master: 0.8,
  }

  it('ogni nota trasporta il suono: il primo oscillatore suona la nota', () => {
    const note = noteSpec(chordSound(), 69, 1, 1)
    expect(note.oscillators[0]?.frequency).toBeCloseTo(440)
    expect(note.oscillators[1]?.frequency).toBeCloseTo(880) // l'ottava sopra resta
    expect(note.duration).toBe(1)
  })

  it('basso due ottave sotto e nome della tonalità', () => {
    const notes = notesOf(spec)
    expect(notes[0]?.[0]).toBe(36) // Do2
    expect(notes[0]).toHaveLength(4)
    expect(keyName(spec)).toBe('Do maggiore')
    expect(midiToHz(69)).toBe(440)
  })

  it('il grafo suona ogni nota di ogni accordo al suo tempo', () => {
    const voice = progressionVoice(spec)
    const each = chordDuration(spec)
    expect(each).toBe(1)
    expect(voice.duration).toBe(4)
    const { fake, context } = fakeContext()
    voice.build(context, context.destination, 0)
    const starts = fake.created.filter((n) => n.kind === 'oscillator').flatMap((n) => n.started)
    // 4 accordi × (3 note + basso) × 2 oscillatori del suono.
    expect(starts).toHaveLength(4 * 4 * 2)
    expect([...new Set(starts)]).toEqual([0, 1, 2, 3])
  })
})
