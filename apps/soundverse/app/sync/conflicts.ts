import type { SyncKind } from '~/library/db'

/** Quello che serve di un progetto o di un kit per decidere un conflitto. */
export interface Versioned {
  id: string
  name: string
  /** Millisecondi dall'epoch: l'ultima modifica. */
  updatedAt: number
}

export interface Decision<T extends Versioned = Versioned> {
  /** Quale versione resta con l'id originale. */
  keep: 'local' | 'remote'
  /** L'altra versione, da salvare come copia con un id nuovo (se va conservata). */
  copy: T | null
}

export const CONFLICT_SUFFIX = ' (conflitto)'

const asCopy = <T extends Versioned>(v: T): T => ({ ...v, name: `${v.name}${CONFLICT_SUFFIX}` })

/**
 * Chi vince un conflitto (`null` = eliminato da quella parte).
 * - Clip: sempre il server. Si modificano solo nome, tag e analisi, e l'audio non cambia mai.
 * - Progetti e kit: la modifica più recente; l'altra resta come copia "(conflitto)".
 *   Contro un'eliminazione vince sempre la versione che esiste, così non si perde lavoro.
 */
export function resolveConflict<T extends Versioned>(
  kind: SyncKind,
  local: T | null,
  remote: T | null,
): Decision<T> {
  if (kind === 'clip') return { keep: 'remote', copy: null }
  if (!local) return { keep: 'remote', copy: null }
  if (!remote) return { keep: 'local', copy: null }
  return local.updatedAt > remote.updatedAt
    ? { keep: 'local', copy: asCopy(remote) }
    : { keep: 'remote', copy: asCopy(local) }
}
