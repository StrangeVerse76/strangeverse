/**
 * Registro delle manopole montate, per nome (lo stesso che leggono i lettori di schermo).
 * Più manopole possono avere lo stesso nome (per esempio "Freq" di ogni oscillatore): si tengono
 * tutte, nell'ordine in cui sono montate, e una mappatura MIDI indica nome e posizione.
 * Dopo un ricaricamento la disposizione è la stessa, quindi la posizione ritrova la stessa manopola.
 */
export interface KnobHandle {
  /** Imposta la manopola da una posizione 0..1 (con la sua scala, lineare o logaritmica). */
  setPosition: (position: number) => void
}

/** Riferimento a una manopola: nome e, fra quelle con lo stesso nome, quale. */
export interface KnobRef {
  name: string
  index: number
}

const knobs = new Map<string, KnobHandle[]>()
let lastTouched: KnobRef | null = null

export function registerKnob(name: string, handle: KnobHandle) {
  knobs.set(name, [...(knobs.get(name) ?? []), handle])
  return () => {
    const list = (knobs.get(name) ?? []).filter((h) => h !== handle)
    if (list.length) knobs.set(name, list)
    else knobs.delete(name)
  }
}

export const findKnob = ({ name, index }: KnobRef) =>
  knobs.get(name)?.[index] ?? knobs.get(name)?.[0]

/** L'ultima manopola toccata (per "impara": il prossimo controller mosso va su di lei). */
export function touchKnob(name: string, handle: KnobHandle) {
  const index = Math.max(0, (knobs.get(name) ?? []).indexOf(handle))
  lastTouched = { name, index }
}

export const lastTouchedKnob = () => lastTouched

/** Nome da mostrare per un riferimento ("Freq (2)" se ce n'è più d'una). */
export const knobLabel = ({ name, index }: KnobRef) => (index > 0 ? `${name} (${index + 1})` : name)
