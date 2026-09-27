/** Blocchi di campioni arrivati dal registratore (uno per canale per blocco). */
export type Chunk = Float32Array[]

/** Unisce i blocchi in canali continui (al massimo stereo). */
export function joinChunks(chunks: readonly Chunk[]): Float32Array<ArrayBuffer>[] {
  const channels = Math.min(2, Math.max(0, ...chunks.map((c) => c.length)))
  const length = chunks.reduce((sum, c) => sum + (c[0]?.length ?? 0), 0)
  const out = Array.from({ length: channels }, () => new Float32Array(length))
  let offset = 0
  for (const chunk of chunks) {
    const size = chunk[0]?.length ?? 0
    out.forEach((channel, c) => channel.set(chunk[c] ?? chunk[0] ?? new Float32Array(size), offset))
    offset += size
  }
  return out
}

/** Se i due canali sono identici (un microfono mono), ne basta uno. */
export function collapseMono(channels: Float32Array<ArrayBuffer>[]): Float32Array<ArrayBuffer>[] {
  const [left, right] = channels
  if (!left || !right) return channels
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return channels
  return [left]
}

/** Durata del conteggio iniziale (s): `bars` battute da 4 battiti al BPM dato. */
export const countInSeconds = (bars: number, bpm: number) => (bars * 4 * 60) / bpm

/** Discesa del misuratore dopo un picco (dB al secondo), come sui misuratori veri. */
export const METER_FALL_DB_PER_SECOND = 20

/**
 * Livello mostrato: sale subito al picco nuovo, poi scende piano. Senza, i colpi brevi
 * (e i suoni di prova) sparirebbero prima che l'occhio li veda.
 */
export function meterLevel(previous: number, current: number, elapsedSeconds: number): number {
  const fallen = Number.isFinite(previous)
    ? previous - METER_FALL_DB_PER_SECOND * elapsedSeconds
    : -Infinity
  return Math.max(current, fallen < -60 ? -Infinity : fallen)
}

/** Livello di picco in dBFS di un blocco, per il misuratore. */
export function peakDb(samples: Float32Array): number {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}
