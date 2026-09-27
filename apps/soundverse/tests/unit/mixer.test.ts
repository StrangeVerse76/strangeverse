import { describe, expect, it } from 'vitest'
import { defaultEq } from '../../app/eq/spec'
import {
  buildReturns,
  buildStrip,
  defaultReturns,
  effectiveGain,
  mixOf,
  updateStrip,
} from '../../app/mixer/mixer'
import { applyLiveGains, emptyRegistry, timelineVoice } from '../../app/timeline/graph'
import type { TimelineProject } from '../../app/timeline/model'
import { fakeContext } from './fake-audio'

describe('solo e valori predefiniti', () => {
  it('muto, o solo altrove, azzera il canale', () => {
    expect(effectiveGain(0.8, false, false, false)).toBe(0.8)
    expect(effectiveGain(0.8, true, true, true)).toBe(0)
    expect(effectiveGain(0.8, false, false, true)).toBe(0)
    expect(effectiveGain(0.8, false, true, true)).toBe(0.8)
  })

  it('riempie i campi mancanti dei dati salvati prima', () => {
    expect(mixOf(undefined)).toEqual({ pan: 0, solo: false, eq: null, sends: [0, 0, 0, 0] })
    expect(mixOf({ pan: 0.5, sends: [1] }).sends).toEqual([1, 0, 0, 0])
  })
})

describe('striscia e ritorni', () => {
  it('quattro ritorni, due modulatori, una mandata per ritorno; l’EQ si inserisce dopo il pan', () => {
    const { fake, context } = fakeContext()
    const returns = buildReturns(context, context.destination, defaultReturns(), 0)
    expect(returns.inputs).toHaveLength(4)
    expect(returns.lfos).toHaveLength(2)

    const input = context.createGain()
    const strip = buildStrip(
      context,
      input,
      context.destination,
      { ...mixOf(undefined), eq: defaultEq() },
      returns,
    )
    expect(strip.sends).toHaveLength(4)
    const panner = strip.panner as unknown as { outputs: string[] }
    expect(panner.outputs[0]).toMatch(/^gain#/) // l'ingresso dell'EQ
    expect(fake.created.some((n) => n.kind === 'convolver')).toBe(true)
  })

  it('pan e mandate cambiano dal vivo', () => {
    const { context } = fakeContext()
    const returns = buildReturns(context, context.destination, defaultReturns(), 0)
    const strip = buildStrip(
      context,
      context.createGain(),
      context.destination,
      mixOf(undefined),
      returns,
    )
    updateStrip(strip, { ...mixOf(undefined), pan: -1, sends: [0.5, 0, 0, 0] }, 0)
    const pan = strip.panner.pan as unknown as { events: unknown[][] }
    const send = strip.sends[0]?.gain as unknown as { events: unknown[][] }
    expect(pan.events.at(-1)?.[1]).toBe(-1)
    expect(send.events.at(-1)?.[1]).toBe(0.5)
  })
})

describe('mixer nella timeline', () => {
  const project = (): TimelineProject => ({
    bpm: 120,
    master: 1,
    tracks: [
      { id: 'a', name: 'A', gain: 0.8, muted: false, mix: { solo: true } },
      { id: 'b', name: 'B', gain: 0.8, muted: false },
    ],
    placements: [],
  })

  it('con un solo, le altre tracce vanno a zero; togliendolo tornano', () => {
    const registry = emptyRegistry()
    const { context } = fakeContext()
    const p = project()
    timelineVoice(p, new Map(), 0, registry).build(context, context.destination, 0)
    expect(registry.tracks.get('a')?.gain.value).toBe(0.8)
    expect(registry.tracks.get('b')?.gain.value).toBe(0)

    p.tracks[0] = { id: 'a', name: 'A', gain: 0.8, muted: false, mix: { solo: false } }
    applyLiveGains(registry, p, 0)
    const b = registry.tracks.get('b')?.gain as unknown as { events: unknown[][] }
    expect(b.events.at(-1)?.[1]).toBe(0.8)
  })
})
