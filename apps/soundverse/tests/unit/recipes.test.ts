import { describe, expect, it } from 'vitest'
import { isRenderable, recipeSources } from '../../app/library/recipes'
import type { ClipRecipe } from '../../app/library/types'

describe('recipeSources', () => {
  it('un campione dipende dalla sua sorgente', () => {
    const recipe: ClipRecipe = { type: 'sample', sourceId: 'a', sourceName: 'A', ops: [] }
    expect(recipeSources(recipe)).toEqual(['a'])
  })

  it('un mix dipende dai clip dei blocchi, una volta sola', () => {
    const recipe = {
      type: 'mix',
      project: { placements: [{ clipId: 'a' }, { clipId: 'b' }, { clipId: 'a' }] },
    } as unknown as ClipRecipe
    expect(recipeSources(recipe)).toEqual(['a', 'b'])
  })

  it('un pattern dei pad dipende solo dai pad suonati', () => {
    const recipe = {
      type: 'padPattern',
      pattern: { events: [{ pad: 0 }, { pad: 2 }, { pad: 0 }] },
      pads: [{ clipId: 'x' }, { clipId: 'y' }, { clipId: null }],
    } as unknown as ClipRecipe
    expect(recipeSources(recipe)).toEqual(['x'])
  })

  it('synth, batteria e accordi non dipendono da altri clip', () => {
    expect(recipeSources({ type: 'drums' } as unknown as ClipRecipe)).toEqual([])
  })
})

it('import e registrazione non si rifanno', () => {
  expect(isRenderable({ type: 'import', fileName: 'a.wav' })).toBe(false)
  expect(isRenderable({ type: 'recording', device: 'mic' })).toBe(false)
  expect(isRenderable({ type: 'drums' } as unknown as ClipRecipe)).toBe(true)
})
