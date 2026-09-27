import { createRandom } from './random'

export type NoiseColor = 'white' | 'pink' | 'brown'

/** Genera `length` campioni di rumore del colore richiesto, in [-1, 1], determinati dal seed. */
export function generateNoise(
  color: NoiseColor,
  length: number,
  seed: number,
): Float32Array<ArrayBuffer> {
  const random = createRandom(seed)
  const white = () => random() * 2 - 1
  const out = new Float32Array(length)

  if (color === 'white') {
    for (let i = 0; i < length; i++) out[i] = white()
    return out
  }

  if (color === 'pink') {
    // Filtro di Paul Kellet (versione economica): -3 dB per ottava.
    let b0 = 0
    let b1 = 0
    let b2 = 0
    for (let i = 0; i < length; i++) {
      const w = white()
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
    }
    return normalize(out)
  }

  // Marrone: rumore bianco integrato, con una piccola perdita per non andare alla deriva.
  let last = 0
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * white()) / 1.02
    out[i] = last
  }
  return normalize(out)
}

/** Porta il picco a 1 (se c'è segnale), così i colori hanno livelli confrontabili. */
function normalize(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] ?? 0) / peak
  return samples
}
