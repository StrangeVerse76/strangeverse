import type { Usage } from './engine'

export interface SyncStatus {
  state: 'off' | 'syncing' | 'ok' | 'error' | 'offline'
  /** Millisecondi dall'epoch dell'ultimo giro riuscito. */
  lastSync: number | null
  /** Clip ricevuti che aspettano ancora la loro sorgente. */
  waiting: number
  usage: Usage | null
  error: string | null
}

export const useSyncStatus = () =>
  useState<SyncStatus>('sync', () => ({
    state: 'off',
    lastSync: null,
    waiting: 0,
    usage: null,
    error: null,
  }))

/** Chi vuole una sincronizzazione subito (il pulsante nell'header) chiama questa. */
export const useSyncNow = () => useState<(() => void) | null>('sync-now', () => null)
