import { describe, expect, it } from 'vitest'
import { filterClips } from '../../app/library/filter'
import type { Clip } from '../../app/library/types'

function clip(partial: Partial<Clip> & Pick<Clip, 'id' | 'name'>): Clip {
  return {
    kind: 'sample',
    tags: [],
    duration: 1,
    sampleRate: 48_000,
    channels: 1,
    peak: 1,
    peaks: [],
    createdAt: 0,
    recipe: { type: 'import', fileName: `${partial.name}.wav` },
    ...partial,
  }
}

const clips = [
  clip({ id: 'a', name: 'Pad morbido', tags: ['pads'], createdAt: 1 }),
  clip({ id: 'b', name: 'Kick secco', kind: 'drums', tags: ['pad'], createdAt: 3 }),
  clip({ id: 'c', name: 'Basso Pad', kind: 'synth', createdAt: 2 }),
]

const ids = (result: Clip[]) => result.map((c) => c.id)

describe('filterClips', () => {
  it('senza filtri restituisce tutto, dal più recente', () => {
    expect(ids(filterClips(clips, { query: '', kind: 'all' }))).toEqual(['b', 'c', 'a'])
  })

  it('cerca nel nome senza distinguere maiuscole', () => {
    expect(ids(filterClips(clips, { query: 'KICK', kind: 'all' }))).toEqual(['b'])
  })

  it('i tag devono coincidere: "pad" non trova il tag "pads"', () => {
    // "pad" è nel nome di a e c, ed è il tag esatto di b.
    expect(ids(filterClips(clips, { query: 'pad', kind: 'all' }))).toEqual(['b', 'c', 'a'])
    expect(ids(filterClips(clips, { query: 'pads', kind: 'all' }))).toEqual(['a'])
  })

  it('tutte le parole devono corrispondere', () => {
    expect(ids(filterClips(clips, { query: 'pad basso', kind: 'all' }))).toEqual(['c'])
  })

  it('filtra per tipo', () => {
    expect(ids(filterClips(clips, { query: '', kind: 'synth' }))).toEqual(['c'])
  })
})
