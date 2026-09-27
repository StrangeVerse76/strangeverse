/**
 * Pattern del sequencer dei pad. I tempi sono in **battiti** (semiminime), non in secondi:
 * cambiando BPM non si sposta niente.
 */

export type Grid = '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32' | '1/32T'

export const GRIDS: Grid[] = ['1/8', '1/8T', '1/16', '1/16T', '1/32', '1/32T']

/** Durata di un passo della griglia, in battiti. */
export function gridBeats(grid: Grid): number {
  const base = { '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 }[
    grid.replace('T', '') as '1/8' | '1/16' | '1/32'
  ]
  return grid.endsWith('T') ? (base * 2) / 3 : base
}

import type { PadOverrides } from './levels'

export interface PadEvent {
  /** Indice assoluto del pad (0..63). */
  pad: number
  /** Posizione nel pattern, in battiti (0 ≤ beat < battute × 4). */
  beat: number
  velocity: number
  /** Varianti del colpo (16 Levels, tastiera a piano); facoltativo. */
  overrides?: PadOverrides
}

const sameNote = (a: PadEvent, b: PadEvent) =>
  a.pad === b.pad &&
  Math.abs(a.beat - b.beat) < 1e-6 &&
  JSON.stringify(a.overrides ?? {}) === JSON.stringify(b.overrides ?? {})

export interface PadPattern {
  id: string
  name: string
  bars: number
  events: PadEvent[]
}

export interface SequencerSettings {
  bpm: number
  /** Griglia di quantizzazione (e del Note Repeat). */
  grid: Grid
  quantize: boolean
  /** 0..1: ritarda i passi dispari della griglia fino a un terzo di passo. */
  swing: number
}

export const BEATS_PER_BAR = 4

export const patternBeats = (pattern: Pick<PadPattern, 'bars'>) => pattern.bars * BEATS_PER_BAR

export function newPattern(index: number): PadPattern {
  return { id: crypto.randomUUID(), name: `Pattern ${index}`, bars: 1, events: [] }
}

/** Arrotonda al passo più vicino della griglia (e resta dentro il pattern). */
export function quantize(beat: number, grid: Grid, length: number): number {
  const step = gridBeats(grid)
  const snapped = Math.round(beat / step) * step
  const wrapped = ((snapped % length) + length) % length
  // Evita i residui di virgola mobile (es. 0.9999999 invece di 1).
  return Math.round(wrapped * 1e6) / 1e6
}

/** Ritardo dello swing (in battiti) per un evento: solo sui passi dispari della griglia. */
export function swingDelay(beat: number, grid: Grid, swing: number): number {
  const step = gridBeats(grid)
  const index = Math.round(beat / step)
  const onGrid = Math.abs(beat - index * step) < 1e-6
  return onGrid && index % 2 === 1 ? (swing * step) / 3 : 0
}

export interface ScheduledEvent extends PadEvent {
  /** Battito assoluto dall'inizio della riproduzione (con i giri del loop). */
  absolute: number
}

/**
 * Gli eventi del pattern fra i battiti assoluti `from` (compreso) e `to` (escluso),
 * tenendo conto dei giri del loop.
 */
export function eventsBetween(pattern: PadPattern, from: number, to: number): ScheduledEvent[] {
  const length = patternBeats(pattern)
  if (to <= from || length <= 0) return []
  const out: ScheduledEvent[] = []
  const firstLoop = Math.floor(from / length)
  const lastLoop = Math.floor((to - 1e-9) / length)
  for (let loop = firstLoop; loop <= lastLoop; loop++) {
    for (const event of pattern.events) {
      const absolute = loop * length + event.beat
      if (absolute >= from && absolute < to) out.push({ ...event, absolute })
    }
  }
  return out.sort((a, b) => a.absolute - b.absolute)
}

/** I passi della griglia fra `from` (compreso) e `to` (escluso): servono al Note Repeat e al metronomo. */
export function stepsBetween(step: number, from: number, to: number): number[] {
  const out: number[] = []
  const eps = 1e-9
  for (let k = Math.ceil((from - eps) / step); k * step < to - eps; k++) out.push(k * step || 0) // evita -0
  return out
}

/** Aggiunge un evento; se ce n'è già uno uguale (stesso pad, stesso istante) lo sostituisce. */
export function addEvent(pattern: PadPattern, event: PadEvent) {
  pattern.events = [
    // Stesso pad, stesso istante e stesse varianti: è lo stesso colpo. Varianti diverse (un accordo
    // sulla tastiera) convivono.
    ...pattern.events.filter((e) => !sameNote(e, event)),
    event,
  ].sort((a, b) => a.beat - b.beat)
}
