/**
 * Generatore pseudo-casuale con seed (mulberry32): stesso seed, stessa sequenza.
 * Serve per il rumore e per le risposte all'impulso del riverbero, così un clip si può rifare identico.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Un seed nuovo a caso, per il pulsante "cambia seed". */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
