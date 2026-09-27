import { SAMPLE_RATE } from '~/audio/constants'
import { spectrogram } from './fft'
import { onsetCurve } from './onset'

/** Sotto questa durata le stime non sono affidabili (lezione di Bragi). */
export const MIN_ANALYSIS_SECONDS = 2
/** Oltre questa durata si analizza solo l'inizio: basta per tempo e tonalità, e resta veloce. */
const MAX_ANALYSIS_SECONDS = 60

export const MIN_BPM = 60
export const MAX_BPM = 200

export interface Analysis {
  bpm: number | null
  /** Es. "La minore". */
  key: string | null
}

const NOTE_NAMES = [
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

/** Tutte le tonalità, nell'ordine dei profili: le 12 maggiori, poi le 12 minori. */
export const keyNames = [
  ...NOTE_NAMES.map((n) => `${n} maggiore`),
  ...NOTE_NAMES.map((n) => `${n} minore`),
]

function mixDown(channels: readonly Float32Array[]): Float32Array {
  const length = Math.min(channels[0]?.length ?? 0, MAX_ANALYSIS_SECONDS * SAMPLE_RATE)
  const mono = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / channels.length
  }
  return mono
}

export function analyze(channels: readonly Float32Array[]): Analysis {
  const mono = mixDown(channels)
  if (mono.length < MIN_ANALYSIS_SECONDS * SAMPLE_RATE) return { bpm: null, key: null }
  return { bpm: estimateBpm(mono), key: estimateKey(mono) }
}

// --- Tempo ---

const ONSET_SIZE = 1024
const ONSET_HOP = 512

/**
 * BPM dall'autocorrelazione della curva degli attacchi (flusso spettrale semi-rettificato).
 * Fra i periodi possibili vince il più forte, pesato da una preferenza morbida per i tempi vicini
 * a 120: evita di scambiare un brano per il doppio o la metà del suo tempo.
 */
export function estimateBpm(mono: Float32Array): number | null {
  const onset = onsetCurve(mono, ONSET_SIZE, ONSET_HOP)
  if (onset.length < 16) return null

  const mean = onset.reduce((a, b) => a + b, 0) / onset.length
  const centered = onset.map((v) => v - mean)
  const framesPerSecond = SAMPLE_RATE / ONSET_HOP
  const lagFor = (bpm: number) => (60 / bpm) * framesPerSecond
  const minLag = Math.floor(lagFor(MAX_BPM))
  const maxLag = Math.ceil(lagFor(MIN_BPM))

  const correlation = (lag: number) => {
    let sum = 0
    for (let i = 0; i + lag < centered.length; i++)
      sum += (centered[i] ?? 0) * (centered[i + lag] ?? 0)
    return sum / (centered.length - lag)
  }
  const scores: number[] = []
  for (let lag = minLag; lag <= maxLag; lag++) scores[lag] = correlation(lag)

  let bestLag = -1
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * framesPerSecond) / lag
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1) ** 2)
    const score = (scores[lag] ?? 0) * prior
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag < 0 || bestScore <= 0) return null

  // Interpolazione parabolica attorno al picco, per una stima più fine del passo intero.
  const y0 = scores[bestLag - 1] ?? scores[bestLag] ?? 0
  const y1 = scores[bestLag] ?? 0
  const y2 = scores[bestLag + 1] ?? scores[bestLag] ?? 0
  const denom = y0 - 2 * y1 + y2
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0
  const bpm = (60 * framesPerSecond) / (bestLag + shift)
  return Math.round(bpm * 10) / 10
}

// --- Tonalità ---

const CHROMA_SIZE = 8192
const CHROMA_HOP = 4096
const MIN_HZ = 55
const MAX_HZ = 5000

/** Profili di Krumhansl-Kessler: quanto ogni grado "appartiene" alla tonalità. */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

/** Cromagramma medio: energia per classe di altezza (Do = 0 … Si = 11). */
export function chroma(mono: Float32Array): number[] {
  const bins = new Array<number>(12).fill(0)
  const binHz = SAMPLE_RATE / CHROMA_SIZE
  const pitchClass: number[] = []
  for (let k = 0; k <= CHROMA_SIZE / 2; k++) {
    const hz = k * binHz
    pitchClass[k] =
      hz < MIN_HZ || hz > MAX_HZ ? -1 : ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12 + 9) % 12
  }
  spectrogram(mono, CHROMA_SIZE, CHROMA_HOP, (magnitudes) => {
    for (let k = 0; k < magnitudes.length; k++) {
      const pc = pitchClass[k] ?? -1
      if (pc >= 0) bins[pc] = (bins[pc] ?? 0) + Math.sqrt(magnitudes[k] ?? 0)
    }
  })
  return bins
}

function pearson(a: readonly number[], b: readonly number[]) {
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] ?? 0) - ma
    const y = (b[i] ?? 0) - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

export function estimateKey(mono: Float32Array): string | null {
  const bins = chroma(mono)
  if (bins.every((v) => v === 0)) return null
  let best = -1
  let bestScore = -Infinity
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = bins.map((_, i) => bins[(i + tonic) % 12] ?? 0)
    const scores = [pearson(rotated, MAJOR), pearson(rotated, MINOR)]
    scores.forEach((score, mode) => {
      if (score > bestScore) {
        bestScore = score
        best = mode * 12 + tonic
      }
    })
  }
  return keyNames[best] ?? null
}
