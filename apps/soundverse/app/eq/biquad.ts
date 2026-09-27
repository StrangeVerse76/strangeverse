/**
 * Coefficienti biquad calcolati a mano (RBJ Audio EQ Cookbook), normalizzati con a0 = 1.
 * Si usano con IIRFilterNode: la curva è esattamente quella calcolata qui, dal vivo e offline,
 * e la stessa formula serve per disegnarla e per testarla.
 */
export interface Biquad {
  b: [number, number, number]
  a: [number, number, number]
}

function normalize(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, a1 / a0, a2 / a0] }
}

const omega = (freq: number, sampleRate: number) =>
  (2 * Math.PI * Math.min(freq, sampleRate * 0.49)) / sampleRate

export function peaking(freq: number, gainDb: number, q: number, sampleRate: number): Biquad {
  const A = Math.pow(10, gainDb / 40)
  const w = omega(freq, sampleRate)
  const alpha = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  return normalize(1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A)
}

/** Scaffale basso. `slope` = S del Cookbook (1 = la pendenza massima senza sovraelongazione). */
export function lowShelf(freq: number, gainDb: number, slope: number, sampleRate: number): Biquad {
  const A = Math.pow(10, gainDb / 40)
  const w = omega(freq, sampleRate)
  const cos = Math.cos(w)
  const alpha = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
  const k = 2 * Math.sqrt(A) * alpha
  return normalize(
    A * (A + 1 - (A - 1) * cos + k),
    2 * A * (A - 1 - (A + 1) * cos),
    A * (A + 1 - (A - 1) * cos - k),
    A + 1 + (A - 1) * cos + k,
    -2 * (A - 1 + (A + 1) * cos),
    A + 1 + (A - 1) * cos - k,
  )
}

export function highShelf(freq: number, gainDb: number, slope: number, sampleRate: number): Biquad {
  const A = Math.pow(10, gainDb / 40)
  const w = omega(freq, sampleRate)
  const cos = Math.cos(w)
  const alpha = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
  const k = 2 * Math.sqrt(A) * alpha
  return normalize(
    A * (A + 1 + (A - 1) * cos + k),
    -2 * A * (A - 1 + (A + 1) * cos),
    A * (A + 1 + (A - 1) * cos - k),
    A + 1 - (A - 1) * cos + k,
    2 * (A - 1 - (A + 1) * cos),
    A + 1 - (A - 1) * cos - k,
  )
}

export function highpass(freq: number, q: number, sampleRate: number): Biquad {
  const w = omega(freq, sampleRate)
  const alpha = Math.sin(w) / (2 * q)
  const cos = Math.cos(w)
  return normalize((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha)
}

/** Guadagno in dB di una catena di biquad alla frequenza `freq`. */
export function responseDb(filters: readonly Biquad[], freq: number, sampleRate: number): number {
  const w = (2 * Math.PI * freq) / sampleRate
  let db = 0
  for (const { b, a } of filters) {
    // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (1 + a1 e^-jw + a2 e^-2jw)
    const re = (c: readonly number[]) =>
      (c[0] ?? 0) + (c[1] ?? 0) * Math.cos(w) + (c[2] ?? 0) * Math.cos(2 * w)
    const im = (c: readonly number[]) =>
      -((c[1] ?? 0) * Math.sin(w) + (c[2] ?? 0) * Math.sin(2 * w))
    const num = Math.hypot(re(b), im(b))
    const den = Math.hypot(re(a), im(a))
    db += 20 * Math.log10(num / den)
  }
  return db
}
