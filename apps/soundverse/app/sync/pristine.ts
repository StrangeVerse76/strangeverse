import type { StoredProject } from '~/library/db'
import type { Kit } from '~/pads/kit'

/**
 * Un progetto o un kit "intatto": quello vuoto che ogni browser crea da solo al primo avvio.
 * Finché resta così non si invia, altrimenti ogni dispositivo nuovo aggiungerebbe il suo
 * "Progetto 1" e il suo "Kit 1" vuoti a tutti gli altri.
 */
export function isPristine(kind: 'project' | 'kit', value: unknown): boolean {
  if (kind === 'project') return (value as StoredProject).project.placements.length === 0
  const kit = value as Kit
  return (
    kit.pads.every((p) => !p.clipId) && (kit.patterns ?? []).every((p) => p.events.length === 0)
  )
}
