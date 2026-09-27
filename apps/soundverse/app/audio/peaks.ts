/**
 * Riduce l'audio a `buckets` valori: per ogni intervallo, il massimo valore assoluto fra tutti i canali (0..1).
 * Serve per disegnare la waveform senza tenere in memoria i campioni.
 */
export function computePeaks(channels: readonly Float32Array[], buckets: number): number[] {
  const length = channels[0]?.length ?? 0
  const peaks = Array.from<number>({ length: buckets }).fill(0)
  if (length === 0 || buckets <= 0) return peaks

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * length) / buckets)
    const end = Math.max(start + 1, Math.floor(((b + 1) * length) / buckets))
    let max = 0
    for (const channel of channels) {
      for (let i = start; i < end && i < length; i++) {
        const value = Math.abs(channel[i] ?? 0)
        if (value > max) max = value
      }
    }
    peaks[b] = Math.min(1, max)
  }
  return peaks
}

/** Valore assoluto massimo dell'audio (0 = silenzio, 1 = fondo scala). */
export function peakLevel(channels: readonly Float32Array[]): number {
  let max = 0
  for (const channel of channels) {
    for (const sample of channel) {
      const value = Math.abs(sample)
      if (value > max) max = value
    }
  }
  return max
}

/** Livello lineare in dBFS; il silenzio è -Infinity. */
export function toDb(level: number): number {
  return level > 0 ? 20 * Math.log10(level) : -Infinity
}
