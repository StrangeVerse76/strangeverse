import { createRandom } from '~/audio/random'

export type Mode = 'major' | 'minor'

/** Nomi italiani delle note (Do = 0). */
export const NOTE_NAMES = [
  'Do',
  'Do#',
  'Re',
  'Mib',
  'Mi',
  'Fa',
  'Fa#',
  'Sol',
  'Lab',
  'La',
  'Sib',
  'Si',
] as const

const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  // Minore naturale; il V diventa maggiore (sensibile alzata) con `raisedSeventh`.
  minor: [0, 2, 3, 5, 7, 8, 10],
}

export interface Chord {
  /** Grado 1..7. */
  degree: number
  /** Classe della fondamentale (0..11). */
  root: number
  /** Intervalli sopra la fondamentale, in semitoni (es. [0, 4, 7]). */
  intervals: number[]
}

/**
 * L'accordo diatonico di un grado: terze sovrapposte sulla scala.
 * In minore, con `raisedSeventh`, il V usa la sensibile e diventa maggiore (dominante della minore
 * armonica). Il VII resta naturale (Sol in La minore), come nell'uso moderno (i–VI–III–VII).
 */
export function diatonicChord(
  tonic: number,
  mode: Mode,
  degree: number,
  sevenths: boolean,
  raisedSeventh = true,
): Chord {
  const scale = [...SCALES[mode]]
  if (mode === 'minor' && raisedSeventh && degree === 5) scale[6] = 11
  const index = (((degree - 1) % 7) + 7) % 7
  const steps = sevenths ? [0, 2, 4, 6] : [0, 2, 4]
  const base = scale[index] ?? 0
  const intervals = steps.map((s) => {
    const raw = index + s
    const pitch = (scale[raw % 7] ?? 0) + 12 * Math.floor(raw / 7)
    return pitch - base
  })
  return { degree, root: (tonic + base) % 12, intervals }
}

/** Nome dell'accordo: "Do", "Lam", "Sol7", "Si°", "Fa maj7". */
export function chordName({ root, intervals }: Chord): string {
  const name = NOTE_NAMES[root] ?? '?'
  const third = intervals[1] ?? 4
  const fifth = intervals[2] ?? 7
  const seventh = intervals[3]
  const quality = fifth === 6 ? '°' : third === 3 ? 'm' : ''
  if (seventh === undefined) return `${name}${quality}`
  if (fifth === 6) return `${name}ø7`
  if (quality === 'm') return `${name}m7`
  return seventh === 11 ? `${name} maj7` : `${name}7`
}

/** Numerale romano del grado, minuscolo per gli accordi minori o diminuiti. */
export function roman(chord: Chord): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const n = numerals[(chord.degree - 1) % 7] ?? '?'
  const minor = (chord.intervals[1] ?? 4) === 3
  const diminished = (chord.intervals[2] ?? 7) === 6
  return (minor ? n.toLowerCase() : n) + (diminished ? '°' : '')
}

export interface ProgressionPreset {
  name: string
  mode: Mode
  degrees: number[]
}

export const progressionPresets: ProgressionPreset[] = [
  { name: 'Pop (I–V–vi–IV)', mode: 'major', degrees: [1, 5, 6, 4] },
  { name: 'Anni ’50 (I–vi–IV–V)', mode: 'major', degrees: [1, 6, 4, 5] },
  { name: 'Malinconica (vi–IV–I–V)', mode: 'major', degrees: [6, 4, 1, 5] },
  { name: 'Jazz (ii–V–I)', mode: 'major', degrees: [2, 5, 1, 1] },
  { name: 'Epica (i–VI–III–VII)', mode: 'minor', degrees: [1, 6, 3, 7] },
  { name: 'Classica minore (i–iv–V–i)', mode: 'minor', degrees: [1, 4, 5, 1] },
]

/** Funzioni armoniche: tonica, sottodominante, dominante. */
const FUNCTIONS = {
  tonic: [1, 6, 3],
  subdominant: [4, 2],
  dominant: [5, 7],
}

/**
 * Una progressione casuale ma sensata, deterministica dal seed: parte e finisce sulla tonica
 * e segue il giro tonica → sottodominante → dominante → tonica.
 */
export function randomProgression(seed: number, length = 4): number[] {
  const random = createRandom(seed)
  const pick = (options: number[]) => options[Math.floor(random() * options.length)] ?? 1
  const order: (keyof typeof FUNCTIONS)[] = ['tonic', 'subdominant', 'dominant']
  const degrees = [1]
  for (let i = 1; i < length - 1; i++) {
    degrees.push(pick(FUNCTIONS[order[i % 3] ?? 'tonic']))
  }
  if (length > 1) degrees.push(pick([1, 1, 6]))
  return degrees
}

/** Nota MIDI da frequenza e viceversa. */
export const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12)

/**
 * Posiziona gli accordi (note MIDI) con una condotta delle voci morbida: ogni accordo sceglie
 * il rivolto più vicino al precedente, così le voci si muovono poco, come le suonerebbe un pianista.
 */
export function voiceChords(chords: Chord[], octave: number): number[][] {
  const center = 12 * (octave + 1) + 4 // attorno al Mi dell'ottava scelta
  let previous: number[] | null = null
  return chords.map((chord) => {
    const base = 12 * (octave + 1) + chord.root
    const candidates: number[][] = []
    for (let inversion = 0; inversion < chord.intervals.length; inversion++) {
      const notes = chord.intervals.map((iv, i) => base + iv + (i < inversion ? 12 : 0))
      for (const shift of [-12, 0, 12]) candidates.push(notes.map((n) => n + shift))
    }
    const mean = (notes: number[]) => notes.reduce((a, b) => a + b, 0) / notes.length
    const target = previous ? mean(previous) : center
    const best = candidates.reduce((a, b) =>
      Math.abs(mean(b) - target) < Math.abs(mean(a) - target) ? b : a,
    )
    const sorted = [...best].sort((a, b) => a - b)
    previous = sorted
    return sorted
  })
}
