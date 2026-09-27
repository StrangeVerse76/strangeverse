import type { ParamDef } from '~/synth/spec'
import { newPattern, type PadPattern, type SequencerSettings } from './pattern'

export const BANKS = ['A', 'B', 'C', 'D'] as const
export type Bank = (typeof BANKS)[number]
export const PADS_PER_BANK = 16
export const MUTE_GROUPS = 4

export interface Pad {
  clipId: string | null
  /** Livello lineare, 0..1. */
  gain: number
  /** Semitoni (varispeed: come una MPC, cambia anche la durata). */
  tune: number
  /** Secondi di attacco. */
  attack: number
  /** Secondi; `null` = tutto il campione. */
  length: number | null
  /** 0 = nessun gruppo; 1..4: un pad zittisce gli altri dello stesso gruppo. */
  muteGroup: number
}

export interface Kit {
  id: string
  name: string
  /** `BANKS.length × PADS_PER_BANK` pad, banco per banco. */
  pads: Pad[]
  updatedAt: number
  /** Pattern del sequencer. Facoltativi: i kit salvati prima non li hanno. */
  patterns?: PadPattern[]
  sequencer?: SequencerSettings
}

export const defaultSequencer = (): SequencerSettings => ({
  bpm: 90,
  grid: '1/16',
  quantize: true,
  swing: 0,
})

export const padParams = {
  gain: { label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  tune: { label: 'Tono', unit: 'st', min: -24, max: 24, step: 1, default: 0, bipolar: true },
  attack: { label: 'Attack', unit: 's', min: 0, max: 2, step: 0.001, default: 0 },
  length: { label: 'Lunghezza', unit: 's', min: 0.01, max: 30, log: true, step: 0.01, default: 30 },
} satisfies Record<string, ParamDef>

export const emptyPad = (): Pad => ({
  clipId: null,
  gain: padParams.gain.default,
  tune: 0,
  attack: 0,
  length: null,
  muteGroup: 0,
})

export function newKit(name: string): Kit {
  return {
    id: crypto.randomUUID(),
    name,
    pads: Array.from({ length: BANKS.length * PADS_PER_BANK }, emptyPad),
    updatedAt: Date.now(),
    patterns: [newPattern(1)],
    sequencer: defaultSequencer(),
  }
}

/** Indice assoluto di un pad (0..63) da banco e numero (1..16). */
export const padIndex = (bank: Bank, number: number) =>
  BANKS.indexOf(bank) * PADS_PER_BANK + (number - 1)

/** Nome breve di un pad: "A1" … "D16". */
export const padName = (index: number) =>
  `${BANKS[Math.floor(index / PADS_PER_BANK)] ?? '?'}${(index % PADS_PER_BANK) + 1}`

/**
 * Tastiera del computer come su una MPC: la fila in basso (Z X C V) è 1–4, poi A S D F 5–8,
 * Q W E R 9–12, e i numeri 1 2 3 4 sono 13–16.
 */
const KEY_ROWS = ['zxcv', 'asdf', 'qwer', '1234']
export function padNumberForKey(key: string): number | null {
  const k = key.toLowerCase()
  for (let row = 0; row < KEY_ROWS.length; row++) {
    const column = KEY_ROWS[row]?.indexOf(k) ?? -1
    if (column >= 0) return row * 4 + column + 1
  }
  return null
}

export const keyForPad = (number: number) =>
  KEY_ROWS[Math.floor((number - 1) / 4)]?.[(number - 1) % 4]?.toUpperCase() ?? ''

/** Ordine di disegno della griglia: come su una MPC, il pad 1 è in basso a sinistra. */
export const gridOrder = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4]

/** Velocity dalla posizione del tocco: in alto forte, in basso piano (mai sotto 0,25). */
export function velocityFromPosition(y: number, height: number): number {
  if (height <= 0) return 1
  const fraction = Math.min(1, Math.max(0, y / height))
  return Math.round((1 - 0.75 * fraction) * 100) / 100
}

/** Curva della velocity: un po' esponenziale, come sugli strumenti veri. */
export const velocityGain = (velocity: number) => Math.pow(Math.min(1, Math.max(0, velocity)), 1.5)
