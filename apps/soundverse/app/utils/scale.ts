export interface Range {
  min: number
  max: number
  /** Scala logaritmica (frequenze, tempi): richiede min > 0. */
  log?: boolean
}

/** Da valore a posizione del controllo, 0..1. */
export function toNormalized(value: number, { min, max, log }: Range): number {
  const v = clamp(value, min, max)
  if (max === min) return 0
  if (log) return Math.log(v / min) / Math.log(max / min)
  return (v - min) / (max - min)
}

/** Da posizione del controllo (0..1) a valore. */
export function fromNormalized(position: number, { min, max, log }: Range): number {
  const p = clamp(position, 0, 1)
  if (log) return min * Math.pow(max / min, p)
  return min + p * (max - min)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

/** Arrotonda a un passo (es. 0.01), evitando gli errori tipo 0.30000000000000004. */
export function roundTo(value: number, step: number): number {
  if (step <= 0) return value
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

export const dbToGain = (db: number) => Math.pow(10, db / 20)
