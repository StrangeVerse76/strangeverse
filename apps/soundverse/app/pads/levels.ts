import type { Pad } from './kit'

/** Le varianti di un colpo rispetto al pad (16 Levels, tastiera a piano). */
export type PadOverrides = Partial<Pick<Pad, 'tune' | 'attack' | 'length'>>

export type LevelParam = 'velocity' | 'tune' | 'attack' | 'length'

export const levelLabels: Record<LevelParam, string> = {
  velocity: 'Velocity',
  tune: 'Accordatura',
  attack: 'Attack',
  length: 'Lunghezza',
}

/** Il pad 9 suona al tono originale: dal pad 1 (−8 semitoni) al pad 16 (+7). */
export const LEVEL_ROOT = 9
const MAX_ATTACK = 1.5

export interface Level {
  velocity: number
  overrides: PadOverrides
}

/**
 * Il livello `n` (1..16) di un pad per un parametro. Gli altri parametri restano quelli del pad;
 * la velocity è piena, tranne quando è lei a variare.
 */
export function level(base: Pad, param: LevelParam, n: number, sampleSeconds: number): Level {
  const step = Math.min(16, Math.max(1, Math.round(n)))
  switch (param) {
    case 'velocity':
      return { velocity: step / 16, overrides: {} }
    case 'tune':
      return { velocity: 1, overrides: { tune: base.tune + (step - LEVEL_ROOT) } }
    case 'attack':
      return { velocity: 1, overrides: { attack: ((step - 1) / 15) * MAX_ATTACK } }
    case 'length':
      return { velocity: 1, overrides: { length: Math.max(0.01, (step / 16) * sampleSeconds) } }
  }
}

/** Etichetta breve di un livello, da mostrare sul pad. */
export function levelText(param: LevelParam, value: Level): string {
  if (param === 'velocity') return `vel ${Math.round(value.velocity * 127)}`
  if (param === 'tune') {
    const tune = value.overrides.tune ?? 0
    return `${tune > 0 ? '+' : ''}${tune} st`
  }
  if (param === 'attack') return `${Math.round((value.overrides.attack ?? 0) * 1000)} ms`
  return `${(value.overrides.length ?? 0).toFixed(2)} s`
}

/** Tastiera a piano: il Do centrale (MIDI 60) è il tono originale del campione. */
export const PIANO_ROOT = 60

export const pianoTune = (base: Pad, midi: number) => base.tune + (midi - PIANO_ROOT)

const NAMES = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si']
export const noteName = (midi: number) => `${NAMES[midi % 12] ?? '?'}${Math.floor(midi / 12) - 1}`
export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12)

/** Le note di due ottave a partire dal Do dell'ottava `octave` (4 = Do centrale). */
export const pianoKeys = (octave: number) =>
  Array.from({ length: 25 }, (_, i) => 12 * (octave + 1) + i)
