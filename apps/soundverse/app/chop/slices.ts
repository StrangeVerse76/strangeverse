import { SAMPLE_RATE } from '~/audio/constants'
import { onsetCurve } from '~/analysis/onset'

const SIZE = 1024
const HOP = 256
/** Un attacco si arretra di un millisecondo, per non tagliare il fronte del colpo. */
const PRE_ROLL = Math.round(0.001 * SAMPLE_RATE)
/** Sotto questa distanza dall'inizio, un attacco coincide con l'inizio del campione. */
const START_TOLERANCE = Math.round(0.01 * SAMPLE_RATE)

export function mixDown(channels: readonly Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0
  const mono = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / channels.length
  }
  return mono
}

/**
 * Inizi delle fette sui transitori (in campioni, ordinati, il primo è sempre 0).
 * `sensitivity` 0..1: più alta, più attacchi. `minGap`: distanza minima fra due tagli (s).
 *
 * Il flusso spettrale trova *dove* c'è un attacco; poi, nella forma d'onda attorno, si cerca il primo
 * campione che supera il 10% del picco locale: è lì che il colpo comincia davvero.
 */
export function detectTransients(
  mono: Float32Array,
  sensitivity: number,
  minGap: number,
): number[] {
  const curve = onsetCurve(mono, SIZE, HOP)
  const max = Math.max(0, ...curve)
  const starts = [0]
  if (max <= 0) return starts
  const threshold = 0.05 + 0.6 * (1 - Math.min(1, Math.max(0, sensitivity)))
  const gap = Math.round(minGap * SAMPLE_RATE)

  for (let f = 1; f < curve.length; f++) {
    const value = (curve[f] ?? 0) / max
    if (value < threshold) continue
    const isPeak = [-2, -1, 1, 2].every((d) => (curve[f] ?? 0) >= (curve[f + d] ?? 0))
    if (!isPeak) continue
    const onset = refine(mono, f)
    const last = starts.at(-1) ?? 0
    if (onset < START_TOLERANCE && last === 0) continue
    if (onset - last >= gap) starts.push(onset)
  }
  return starts
}

function refine(mono: Float32Array, frame: number): number {
  const from = Math.max(0, (frame - 2) * HOP)
  const to = Math.min(mono.length, frame * HOP + SIZE)
  let peak = 0
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(mono[i] ?? 0))
  const level = peak * 0.1
  for (let i = from; i < to; i++) {
    if (Math.abs(mono[i] ?? 0) > level) return Math.max(0, i - PRE_ROLL)
  }
  return from
}

/** Inizi di `count` fette uguali. */
export function gridSlices(length: number, count: number): number[] {
  const n = Math.max(1, Math.round(count))
  return Array.from({ length: n }, (_, i) => Math.round((i * length) / n))
}

/** Inizi delle fette a tempo: una ogni `beats` battiti al BPM dato. */
export function beatSlices(length: number, bpm: number, beats: number): number[] {
  const step = Math.round((60 / bpm) * beats * SAMPLE_RATE)
  if (step <= 0) return [0]
  const out: number[] = []
  // Se il BPM non è esatto l'ultima fetta può restare di pochi millesimi: sotto il 10% di un passo
  // si unisce alla precedente.
  for (let s = 0; s < length - step * 0.1; s += step) out.push(s)
  return out
}

/** Riordina i marcatori, toglie i doppioni e quelli fuori dal campione; lo 0 c'è sempre. */
export function normalizeMarkers(markers: readonly number[], length: number): number[] {
  const inside = markers.map((m) => Math.round(m)).filter((m) => m > 0 && m < length)
  return [0, ...[...new Set(inside)].sort((a, b) => a - b)]
}

/** Le fette come coppie [inizio, fine) in campioni. */
export function slicesFrom(markers: readonly number[], length: number): [number, number][] {
  const starts = normalizeMarkers(markers, length)
  return starts.map((start, i) => [start, starts[i + 1] ?? length])
}
