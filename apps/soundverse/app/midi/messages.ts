export type MidiMessage =
  | { type: 'noteon'; channel: number; note: number; velocity: number }
  | { type: 'noteoff'; channel: number; note: number }
  | { type: 'cc'; channel: number; controller: number; value: number }

/** Interpreta un messaggio MIDI grezzo. Un note on con velocity 0 è un note off (lo usano molti controller). */
export function parseMidi(data: ArrayLike<number>): MidiMessage | null {
  const status = data[0] ?? 0
  const kind = status & 0xf0
  const channel = (status & 0x0f) + 1
  const a = data[1] ?? 0
  const b = data[2] ?? 0
  if (kind === 0x90)
    return b > 0
      ? { type: 'noteon', channel, note: a, velocity: b }
      : { type: 'noteoff', channel, note: a }
  if (kind === 0x80) return { type: 'noteoff', channel, note: a }
  if (kind === 0xb0) return { type: 'cc', channel, controller: a, value: b }
  return null
}

/** Nota di partenza della mappa cromatica: Do1 (MIDI 36) è il pad A1. */
export const DEFAULT_BASE_NOTE = 36

/**
 * Da nota a pad (indice assoluto 0..63): prima le note imparate, poi la mappa cromatica
 * (A1 = nota base, A16 = base + 15, poi i banchi B, C, D).
 */
export function padForNote(
  note: number,
  base: number,
  learned: Readonly<Record<number, number>>,
): number | null {
  const custom = learned[note]
  if (custom !== undefined) return custom
  const index = note - base
  return index >= 0 && index < 64 ? index : null
}

/** Valore di un controller (0..127) come posizione di una manopola (0..1). */
export const ccPosition = (value: number) => Math.min(1, Math.max(0, value / 127))
