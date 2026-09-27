import type { Voice } from '~/audio/render'
import { buildSynth } from '~/synth/graph'
import type { SynthSpec } from '~/synth/spec'
import { diatonicChord, midiToHz, NOTE_NAMES, voiceChords, type Chord, type Mode } from './theory'

export interface ProgressionSpec {
  /** Tonica, 0..11 (Do = 0). */
  tonic: number
  mode: Mode
  /** Gradi 1..7, in ordine. */
  degrees: number[]
  sevenths: boolean
  bpm: number
  beatsPerChord: number
  octave: number
  bass: boolean
  /** Il suono di ogni nota: una spec del synth, trasportata alla nota. */
  sound: SynthSpec
  /** Volume complessivo, 0..1. */
  master: number
}

export const chordDuration = (spec: Pick<ProgressionSpec, 'bpm' | 'beatsPerChord'>) =>
  (60 / spec.bpm) * spec.beatsPerChord

export const progressionLength = (spec: ProgressionSpec) =>
  chordDuration(spec) * spec.degrees.length

export function chordsOf(spec: ProgressionSpec): Chord[] {
  return spec.degrees.map((degree) => diatonicChord(spec.tonic, spec.mode, degree, spec.sevenths))
}

export const keyName = (spec: Pick<ProgressionSpec, 'tonic' | 'mode'>) =>
  `${NOTE_NAMES[spec.tonic] ?? '?'} ${spec.mode === 'major' ? 'maggiore' : 'minore'}`

/**
 * La spec del synth per una nota: gli oscillatori si trasportano tutti dello stesso rapporto
 * (così restano gli intervalli del suono, per esempio una quinta sovrapposta), la durata
 * diventa quella dell'accordo.
 */
export function noteSpec(
  sound: SynthSpec,
  midi: number,
  duration: number,
  gain: number,
): SynthSpec {
  const reference = sound.oscillators[0]?.frequency ?? 220
  const ratio = midiToHz(midi) / reference
  return {
    ...sound,
    duration,
    oscillators: sound.oscillators.map((osc) => ({ ...osc, frequency: osc.frequency * ratio })),
    master: sound.master * gain,
  }
}

/** Le note da suonare (MIDI), accordo per accordo, basso compreso. */
export function notesOf(spec: ProgressionSpec): number[][] {
  const chords = chordsOf(spec)
  const voiced = voiceChords(chords, spec.octave)
  return voiced.map((notes, i) => {
    const root = chords[i]?.root ?? 0
    // Basso: la fondamentale due ottave sotto la voce più grave dell'ottava scelta.
    const bass = 12 * (spec.octave - 1) + root
    return spec.bass ? [bass, ...notes] : notes
  })
}

/** La progressione come Voice: lo stesso grafo per l'ascolto e per il salvataggio. */
export function progressionVoice(spec: ProgressionSpec): Voice {
  const each = chordDuration(spec)
  const chords = notesOf(spec)
  return {
    duration: each * chords.length,
    channels: 1,
    build(context, out, when) {
      chords.forEach((notes, i) => {
        // Il volume per nota si divide fra le voci, così un accordo pieno non satura.
        const gain = spec.master / Math.sqrt(notes.length)
        for (const midi of notes) {
          buildSynth(noteSpec(spec.sound, midi, each, gain))(context, out, when + i * each)
        }
      })
    },
  }
}
