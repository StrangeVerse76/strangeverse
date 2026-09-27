/**
 * Manifest delle sotto-app: il portale costruisce il catalogo da questo elenco.
 * Per aggiungere un'app basta una nuova voce (vedi §4.3 del piano).
 */

export type AppStatus = 'live' | 'coming-soon'

export interface AppEntry {
  /** Identificativo stabile, uguale al nome della cartella in `apps/`. */
  id: string
  name: string
  description: string
  /** Emoji mostrata nella scheda. */
  icon: string
  status: AppStatus
  /** URL pubblico dell'app; obbligatorio quando è `live`. */
  url: string | null
}

export const apps: AppEntry[] = [
  {
    id: 'soundverse',
    name: 'Soundverse',
    description:
      'Uno studio audio nel browser: synth, campioni, equalizzatore e una timeline per comporre.',
    icon: '🎛️',
    status: 'coming-soon',
    url: null,
  },
]

export const statusLabels: Record<AppStatus, string> = {
  live: 'Online',
  'coming-soon': 'In arrivo',
}
