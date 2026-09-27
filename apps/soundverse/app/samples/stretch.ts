import { varispeed } from './ops'

/**
 * Time-stretch WSOLA (Waveform Similarity Overlap-Add): cambia la durata senza cambiare l'intonazione.
 *
 * Si prendono finestre dall'ingresso a passo `analysisHop` e si sovrappongono in uscita a passo fisso.
 * Ogni finestra si sposta di poco (±TOLERANCE) per allinearsi alla forma d'onda della precedente:
 * così le fasi combaciano e non si sentono "battimenti". Lo spostamento si decide sul mix mono e vale
 * per tutti i canali, per non rovinare l'immagine stereo.
 */

const FRAME = 2048
const SYNTH_HOP = FRAME / 2
const TOLERANCE = 512
/** Ricerca in due passi: prima grossolana, poi fine attorno al migliore. */
const COARSE_STEP = 8
const COARSE_STRIDE = 4
const FINE_STRIDE = 2

const window = Float32Array.from(
  { length: FRAME },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME),
)

/** `factor` moltiplica la durata: 2 = il doppio, 0,5 = la metà. */
export function timeStretch(
  channels: readonly Float32Array[],
  factor: number,
): Float32Array<ArrayBuffer>[] {
  const length = channels[0]?.length ?? 0
  if (length === 0 || Math.abs(factor - 1) < 1e-6) return channels.map((c) => Float32Array.from(c))

  const outLength = Math.max(1, Math.round(length * factor))
  const analysisHop = SYNTH_HOP / factor
  const mono = mixDown(channels)
  const outputs = channels.map(() => new Float32Array(outLength + FRAME))
  const weight = new Float32Array(outLength + FRAME)

  let previous = 0 // posizione (in ingresso) dell'ultima finestra usata
  for (let k = 0; k * SYNTH_HOP < outLength; k++) {
    const ideal = Math.round(k * analysisHop)
    const position = k === 0 ? 0 : bestOffset(mono, ideal, previous + SYNTH_HOP)
    const outStart = k * SYNTH_HOP
    for (let c = 0; c < channels.length; c++) {
      const input = channels[c]
      const output = outputs[c]
      if (!input || !output) continue
      for (let i = 0; i < FRAME; i++) {
        const sample = input[position + i] ?? 0
        output[outStart + i] = (output[outStart + i] ?? 0) + sample * (window[i] ?? 0)
      }
    }
    for (let i = 0; i < FRAME; i++)
      weight[outStart + i] = (weight[outStart + i] ?? 0) + (window[i] ?? 0)
    previous = position
  }

  return outputs.map((output) => {
    const out = new Float32Array(outLength)
    for (let i = 0; i < outLength; i++) {
      const w = weight[i] ?? 0
      out[i] = w > 1e-3 ? (output[i] ?? 0) / w : (output[i] ?? 0)
    }
    return out
  })
}

/**
 * Pitch shift senza cambiare durata: si allunga di `ratio` e poi si riaccelera di `ratio`
 * (varispeed), che riporta la durata e sposta l'intonazione.
 */
export function pitchShift(
  channels: readonly Float32Array[],
  semitones: number,
): Float32Array<ArrayBuffer>[] {
  if (semitones === 0) return channels.map((c) => Float32Array.from(c))
  const ratio = Math.pow(2, semitones / 12)
  const length = channels[0]?.length ?? 0
  return timeStretch(channels, ratio).map((channel) => {
    const shifted = varispeed(channel, ratio)
    // L'arrotondamento dei due passaggi può lasciare un campione di differenza: si riporta alla durata esatta.
    const out = new Float32Array(length)
    out.set(shifted.subarray(0, length))
    return out
  })
}

/** Il punto (vicino a `ideal`) dove l'ingresso somiglia di più alla continuazione naturale `target`. */
function bestOffset(mono: Float32Array, ideal: number, target: number): number {
  const max = mono.length - 1
  const from = Math.max(0, ideal - TOLERANCE)
  const to = Math.min(max, ideal + TOLERANCE)
  let best = Math.min(Math.max(0, ideal), max)
  let bestScore = -Infinity
  for (let candidate = from; candidate <= to; candidate += COARSE_STEP) {
    const score = similarity(mono, candidate, target, COARSE_STRIDE)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  const coarse = best
  for (
    let candidate = Math.max(from, coarse - COARSE_STEP);
    candidate <= Math.min(to, coarse + COARSE_STEP);
    candidate++
  ) {
    const score = similarity(mono, candidate, target, FINE_STRIDE)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** Correlazione sulla zona di sovrapposizione (mezza finestra), campionata ogni `stride`. */
function similarity(mono: Float32Array, a: number, b: number, stride: number): number {
  let sum = 0
  for (let i = 0; i < SYNTH_HOP; i += stride) sum += (mono[a + i] ?? 0) * (mono[b + i] ?? 0)
  return sum
}

function mixDown(channels: readonly Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0
  if (channels.length === 1) return channels[0] ?? new Float32Array(0)
  const mono = new Float32Array(length)
  for (const channel of channels)
    for (let i = 0; i < length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0)
  return mono
}
