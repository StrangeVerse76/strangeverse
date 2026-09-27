import { describe, expect, it } from 'vitest'
import { applyLiveGains, emptyRegistry, limitPeak, timelineVoice } from '../../app/timeline/graph'
import {
  blockLength,
  defaultProject,
  fadeEvents,
  fadeGainAt,
  MIN_SEGMENT,
  projectEnd,
  schedulePlays,
  segment,
  snapToBeat,
  type Placement,
  type TimelineProject,
} from '../../app/timeline/model'
import { fakeContext } from './fake-audio'

function placement(partial: Partial<Placement> = {}): Placement {
  return {
    id: 'p1',
    clipId: 'c1',
    trackId: 't1',
    start: 0,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
    repeat: 1,
    ...partial,
  }
}

function project(placements: Placement[]): TimelineProject {
  return {
    bpm: 120,
    master: 0.8,
    tracks: [{ id: 't1', name: 'Traccia 1', gain: 0.5, muted: false }],
    placements,
  }
}

const durations = new Map([
  ['c1', 2],
  ['c2', 1],
])

describe('snap e durate', () => {
  it('aggancia al battito più vicino, mai prima di zero', () => {
    expect(snapToBeat(1.2, 120)).toBe(1)
    expect(snapToBeat(1.3, 120)).toBe(1.5)
    expect(snapToBeat(-3, 120)).toBe(0)
  })

  it('un blocco dura clip × ripetizioni; il progetto finisce con l’ultimo blocco', () => {
    expect(blockLength(placement({ repeat: 3 }), durations)).toBe(6)
    const p = project([
      placement({ start: 1, repeat: 2 }),
      placement({ id: 'p2', clipId: 'c2', start: 7 }),
    ])
    expect(projectEnd(p, durations)).toBe(8)
  })
})

describe('schedulePlays', () => {
  it('dall’inizio suona ogni ripetizione intera', () => {
    const plays = schedulePlays(project([placement({ start: 1, repeat: 3 })]), durations, 0)
    expect(plays.map((p) => [p.at, p.offset, p.duration])).toEqual([
      [1, 0, 2],
      [3, 0, 2],
      [5, 0, 2],
    ])
  })

  it('riprendendo a metà salta le ripetizioni finite ed entra in quella in corso con l’offset giusto', () => {
    const plays = schedulePlays(project([placement({ start: 1, repeat: 3 })]), durations, 3.5)
    expect(plays.map((p) => [p.at, p.offset, p.duration])).toEqual([
      [3.5, 0.5, 1.5],
      [5, 0, 2],
    ])
  })

  it('i blocchi già finiti non suonano, quelli futuri partono al loro inizio', () => {
    const p = project([placement({ start: 0 }), placement({ id: 'p2', clipId: 'c2', start: 10 })])
    const plays = schedulePlays(p, durations, 5)
    expect(plays.map((x) => [x.placementId, x.at, x.offset])).toEqual([['p2', 10, 0]])
  })

  it('ignora i clip senza durata nota', () => {
    expect(schedulePlays(project([placement({ clipId: 'sconosciuto' })]), durations, 0)).toEqual([])
  })
})

describe('dissolvenze', () => {
  const faded = placement({ start: 2, repeat: 2, fadeIn: 1, fadeOut: 1 }) // blocco di 4 s, da 2 a 6

  it('avvolgono l’intero blocco, ripetizioni comprese', () => {
    expect(fadeGainAt(faded, 4, 0)).toBe(0)
    expect(fadeGainAt(faded, 4, 0.5)).toBeCloseTo(0.5)
    expect(fadeGainAt(faded, 4, 2)).toBe(1) // cambio di ripetizione: nessuna dissolvenza
    expect(fadeGainAt(faded, 4, 3.5)).toBeCloseTo(0.5)
    expect(fadeGainAt(faded, 4, 4)).toBe(0)
  })

  it('dall’inizio: da 0 a 1, poi di nuovo a 0 alla fine', () => {
    expect(fadeEvents(faded, 4, 0)).toEqual([
      { kind: 'set', value: 0, time: 2 },
      { kind: 'ramp', value: 1, time: 3 },
      { kind: 'set', value: 1, time: 5 },
      { kind: 'ramp', value: 0, time: 6 },
    ])
  })

  it('riprendendo a metà del fade in si parte dal valore già raggiunto', () => {
    const events = fadeEvents(faded, 4, 2.25)
    expect(events[0]).toEqual({ kind: 'set', value: 0.25, time: 2.25 })
    expect(events[1]).toEqual({ kind: 'ramp', value: 1, time: 3 })
  })

  it('riprendendo a metà del fade out si continua a scendere da lì', () => {
    expect(fadeEvents(faded, 4, 5.5)).toEqual([
      { kind: 'set', value: 0.5, time: 5.5 },
      { kind: 'ramp', value: 0, time: 6 },
    ])
  })

  it('dopo la fine del blocco non c’è niente da programmare', () => {
    expect(fadeEvents(faded, 4, 7)).toEqual([])
  })
})

describe('timelineVoice', () => {
  const buffer = (duration: number) => ({ duration }) as AudioBuffer
  const buffers = new Map([
    ['c1', buffer(2)],
    ['c2', buffer(1)],
  ])

  it('collega sorgenti → dissolvenza → clip → traccia → master e parte al punto giusto', () => {
    const p = project([placement({ start: 1, repeat: 2 })])
    const voice = timelineVoice(p, buffers, 2)
    expect(voice.duration).toBe(3) // fine 5, partenza 2

    const { fake, context } = fakeContext()
    voice.build(context, context.destination, 10)
    const sources = fake.created.filter((n) => n.kind === 'buffersource')
    // Ripetizione 1 (1..3) ripresa a 2 → parte subito (10); ripetizione 2 a 3 → 11.
    expect(sources.flatMap((s) => s.started)).toEqual([10, 11])
    const [master, track, clipGain, fade] = fake.created.filter((n) => n.kind === 'gain')
    expect(master?.outputs).toEqual(['destination#0'])
    expect(track?.outputs).toEqual([master?.id])
    expect(clipGain?.outputs).toEqual([track?.id])
    expect(fade?.outputs).toEqual([clipGain?.id])
    expect(sources.every((s) => s.outputs[0] === fade?.id)).toBe(true)
  })

  it('i nodi di volume sono registrati per id, e i volumi cambiano dal vivo', () => {
    const p = project([placement({ id: 'a' }), placement({ id: 'b', clipId: 'c2', start: 3 })])
    const registry = emptyRegistry()
    const { context } = fakeContext()
    timelineVoice(p, buffers, 0, registry).build(context, context.destination, 0)
    expect([...registry.placements.keys()]).toEqual(['a', 'b'])

    // Togliere "a" non deve spostare il volume di "b" su un altro nodo.
    const next = {
      ...p,
      placements: [{ ...placement({ id: 'b', clipId: 'c2', start: 3 }), gain: 0.3 }],
    }
    applyLiveGains(registry, next, 0)
    const bParam = registry.placements.get('b')?.gain as unknown as { events: unknown[][] }
    const aParam = registry.placements.get('a')?.gain as unknown as { events: unknown[][] }
    expect(bParam.events.at(-1)).toEqual(['target', 0.3, 0, 0.01])
    expect(aParam.events).toEqual([])
  })

  it('una traccia muta ha volume zero', () => {
    const p = project([placement()])
    p.tracks[0] = { id: 't1', name: 'Traccia 1', gain: 0.5, muted: true }
    const registry = emptyRegistry()
    const { context } = fakeContext()
    timelineVoice(p, buffers, 0, registry).build(context, context.destination, 0)
    expect(registry.tracks.get('t1')?.gain.value).toBe(0)
  })
})

describe('limitPeak e progetto predefinito', () => {
  it('scala il mix solo se supera il limite', () => {
    const quiet = [Float32Array.from([0.5, -0.5])]
    expect(limitPeak(quiet)).toBe(quiet)
    const [loud] = limitPeak([Float32Array.from([2, -1])])
    expect(loud?.[0]).toBeCloseTo(0.99)
    expect(loud?.[1]).toBeCloseTo(-0.495)
  })

  it('parte con due tracce e nessun blocco', () => {
    const p = defaultProject()
    expect(p.tracks).toHaveLength(2)
    expect(p.placements).toEqual([])
  })
})

describe('rifilatura', () => {
  const clip = new Map([['c1', 4]])

  it('il segmento resta nei limiti del clip', () => {
    expect(segment(placement(), 4)).toEqual({ offset: 0, length: 4 })
    expect(segment(placement({ offset: 1, length: 2 }), 4)).toEqual({ offset: 1, length: 2 })
    expect(segment(placement({ offset: 3, length: 5 }), 4)).toEqual({ offset: 3, length: 1 })
    expect(segment(placement({ offset: -1, length: 0 }), 4)).toEqual({
      offset: 0,
      length: MIN_SEGMENT,
    })
    expect(segment(placement({ offset: 10 }), 4).offset).toBeCloseTo(4 - MIN_SEGMENT)
  })

  it('le ripetizioni usano il segmento, e ognuna parte dall’inizio del segmento', () => {
    const p = project([placement({ start: 2, offset: 1, length: 1.5, repeat: 2 })])
    expect(blockLength(p.placements[0] as Placement, clip)).toBe(3)
    expect(schedulePlays(p, clip, 0).map((x) => [x.at, x.offset, x.duration])).toEqual([
      [2, 1, 1.5],
      [3.5, 1, 1.5],
    ])
  })

  it('riprendendo dentro un segmento rifilato l’offset tiene conto di entrambi', () => {
    const p = project([placement({ start: 2, offset: 1, length: 1.5, repeat: 2 })])
    expect(schedulePlays(p, clip, 4).map((x) => [x.at, x.offset, x.duration])).toEqual([
      [4, 1.5, 1],
    ])
  })

  it('il grafo passa alla sorgente l’offset e la durata del segmento', () => {
    const buffers = new Map([['c1', { duration: 4 } as AudioBuffer]])
    const p = project([placement({ start: 0, offset: 0.5, length: 1 })])
    const { fake, context } = fakeContext()
    const voice = timelineVoice(p, buffers, 0)
    expect(voice.duration).toBe(1)
    voice.build(context, context.destination, 0)
    expect(fake.created.filter((n) => n.kind === 'buffersource').flatMap((n) => n.started)).toEqual(
      [0],
    )
  })
})
