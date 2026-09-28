import { describe, expect, it } from 'vitest'
import { CONFLICT_SUFFIX, resolveConflict } from '../../app/sync/conflicts'

const v = (name: string, updatedAt: number) => ({ id: 'p', name, updatedAt })

describe('resolveConflict', () => {
  it('per i clip vince sempre il server', () => {
    expect(resolveConflict('clip', v('A', 9), v('B', 1))).toEqual({ keep: 'remote', copy: null })
  })

  it('per progetti e kit vince la modifica più recente, l’altra diventa una copia', () => {
    expect(resolveConflict('project', v('Qui', 5), v('Là', 3))).toEqual({
      keep: 'local',
      copy: v(`Là${CONFLICT_SUFFIX}`, 3),
    })
    expect(resolveConflict('kit', v('Qui', 3), v('Là', 5))).toEqual({
      keep: 'remote',
      copy: v(`Qui${CONFLICT_SUFFIX}`, 3),
    })
  })

  it('contro un’eliminazione vince la versione che esiste', () => {
    expect(resolveConflict('project', null, v('Là', 1))).toEqual({ keep: 'remote', copy: null })
    expect(resolveConflict('project', v('Qui', 1), null)).toEqual({ keep: 'local', copy: null })
  })
})
