import { spectrogram } from './fft'

/**
 * Curva degli attacchi: flusso spettrale semi-rettificato (quanto cresce lo spettro, in scala
 * logaritmica, da una finestra alla successiva). Un valore per finestra, a passo `hop`.
 */
export function onsetCurve(mono: Float32Array, size: number, hop: number): number[] {
  const curve: number[] = []
  let previous: Float64Array | null = null
  spectrogram(mono, size, hop, (magnitudes) => {
    const current = magnitudes.map((m) => Math.log1p(100 * m))
    let flux = 0
    if (previous) {
      for (let k = 0; k < current.length; k++)
        flux += Math.max(0, (current[k] ?? 0) - (previous[k] ?? 0))
    }
    curve.push(flux)
    previous = current
  })
  return curve
}
