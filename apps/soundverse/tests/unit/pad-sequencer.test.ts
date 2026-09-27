import { describe, expect, it } from 'vitest'
import { emptyPad, type Pad } from '../../app/pads/kit'
import {
  addEvent,
  eventsBetween,
  gridBeats,
  newPattern,
  quantize,
  stepsBetween,
  swingDelay,
  type PadPattern,
  type SequencerSettings,
} from '../../app/pads/pattern'
import { padPatternVoice } from '../../app/pads/render'
import { PadSequencer } from '../../app/pads/sequencer'
import { fakeContext } from './fake-audio'

const settings = (partial: Partial<SequencerSettings> = {}): SequencerSettings => ({
  bpm: 120,
  grid: '1/16',
  quantize: true,
  swing: 0,
  ...partial,
})

function pattern(events: [number, number][], bars = 1): PadPattern {
  return {
    ...newPattern(1),
    bars,
    events: events.map(([pad, beat]) => ({ pad, beat, velocity: 1 })),
  }
}

describe('griglia e quantizzazione', () => {
  it('passi in battiti, terzine comprese', () => {
    expect(gridBeats('1/8')).toBe(0.5)
    expect(gridBeats('1/16')).toBe(0.25)
    expect(gridBeats('1/32')).toBe(0.125)
    expect(gridBeats('1/8T')).toBeCloseTo(1 / 3)
    expect(gridBeats('1/16T')).toBeCloseTo(1 / 6)
  })

  it('quantizza al passo più vicino e resta dentro il pattern', () => {
    expect(quantize(0.9, '1/16', 4)).toBe(1)
    expect(quantize(0.12, '1/16', 4)).toBe(0)
    expect(quantize(3.95, '1/16', 4)).toBe(0) // l'ultimo passo arrotonda al giro dopo
    expect(quantize(0.3, '1/8T', 4)).toBeCloseTo(1 / 3, 6)
  })

  it('lo swing ritarda solo i passi dispari della griglia', () => {
    expect(swingDelay(0, '1/16', 1)).toBe(0)
    expect(swingDelay(0.25, '1/16', 1)).toBeCloseTo(0.25 / 3)
    expect(swingDelay(0.5, '1/16', 1)).toBe(0)
    expect(swingDelay(0.3, '1/16', 1)).toBe(0) // fuori griglia: niente swing
  })

  it('un colpo nello stesso punto dello stesso pad sostituisce il precedente', () => {
    const p = pattern([[0, 1]])
    addEvent(p, { pad: 0, beat: 1, velocity: 0.5 })
    addEvent(p, { pad: 1, beat: 1, velocity: 1 })
    expect(p.events).toHaveLength(2)
    expect(p.events.find((e) => e.pad === 0)?.velocity).toBe(0.5)
  })
})

describe('eventsBetween e stepsBetween', () => {
  it('ripete gli eventi a ogni giro', () => {
    const p = pattern([
      [0, 0],
      [1, 2],
    ]) // 4 battiti
    expect(eventsBetween(p, 0, 10).map((e) => e.absolute)).toEqual([0, 2, 4, 6, 8])
    expect(eventsBetween(p, 2, 4).map((e) => e.absolute)).toEqual([2])
    expect(eventsBetween(p, 3, 3)).toEqual([])
  })

  it('i passi della griglia in una finestra', () => {
    expect(stepsBetween(0.25, 0.1, 1)).toEqual([0.25, 0.5, 0.75])
    expect(stepsBetween(1, 0, 3)).toEqual([0, 1, 2])
  })
})

describe('PadSequencer', () => {
  function setup(
    patterns: PadPattern[],
    options: { repeat?: Map<number, number>; metronome?: boolean } = {},
  ) {
    const { fake, context } = fakeContext()
    const clock = fake as unknown as { currentTime: number }
    const pads: Pad[] = [
      { ...emptyPad(), clipId: 'a' },
      { ...emptyPad(), clipId: 'b' },
    ]
    const buffers = new Map([
      ['a', { duration: 0.1 } as AudioBuffer],
      ['b', { duration: 0.2 } as AudioBuffer],
    ])
    let current = 0
    let queued: number | null = null
    const seq = new PadSequencer(context as AudioContext, context.destination, {
      pattern: () => patterns[current] ?? newPattern(1),
      settings: () => settings(),
      pads: () => pads,
      buffer: (id) => buffers.get(id),
      repeating: () => options.repeat ?? new Map(),
      noteRepeat: () => !!options.repeat,
      metronome: () => !!options.metronome,
      onLoopEnd: () => {
        if (queued !== null) current = queued
        queued = null
      },
    })
    const run = (until: number) => {
      // Avanza il clock a piccoli passi, come farebbe il timer.
      while (clock.currentTime < until) {
        clock.currentTime = Math.min(until, clock.currentTime + 0.025)
        ;(seq as unknown as { tick: () => void }).tick()
      }
    }
    const starts = (clip: string) =>
      fake.created
        .filter(
          (n) =>
            n.kind === 'buffersource' &&
            (n.buffer as AudioBuffer | undefined) === buffers.get(clip),
        )
        .flatMap((n) => n.started)
        .map((t) => Math.round(t * 1000) / 1000)
    return { seq, run, starts, fake, queue: (i: number) => (queued = i) }
  }

  it('suona ogni evento al suo istante, giro dopo giro (a 120 BPM un battito = 0,5 s)', () => {
    const { seq, run, starts } = setup([
      pattern([
        [0, 0],
        [1, 1],
      ]),
    ])
    seq.start() // parte a 0,06 s
    run(4.2)
    expect(starts('a')).toEqual([0.06, 2.06, 4.06])
    expect(starts('b')).toEqual([0.56, 2.56])
  })

  it('il pattern in coda parte esattamente alla fine del giro', () => {
    const { seq, run, starts, queue } = setup([pattern([[0, 0]]), pattern([[1, 0]])])
    seq.start()
    queue(1)
    run(4.2)
    expect(starts('a')).toEqual([0.06])
    expect(starts('b')).toEqual([2.06, 4.06])
  })

  it('Note Repeat: i pad tenuti suonano a ogni passo della griglia', () => {
    const { seq, run, starts } = setup([pattern([])], { repeat: new Map([[0, 1]]) })
    seq.start()
    run(0.6)
    // 1/16 a 120 BPM = 0,125 s.
    expect(starts('a').slice(0, 4)).toEqual([0.06, 0.185, 0.31, 0.435])
  })

  it('metronomo: un clic per battito', () => {
    const { seq, run, fake } = setup([pattern([])], { metronome: true })
    seq.start()
    run(2)
    const clicks = fake.created.filter((n) => n.kind === 'oscillator').flatMap((n) => n.started)
    expect(clicks.map((t) => Math.round(t * 100) / 100).slice(0, 4)).toEqual([
      0.06, 0.56, 1.06, 1.56,
    ])
  })
})

describe('padPatternVoice', () => {
  it('un giro con lo swing e la coda del campione più lungo', () => {
    const pads: Pad[] = [{ ...emptyPad(), clipId: 'a' }]
    const buffers = new Map([['a', { duration: 0.3 } as AudioBuffer]])
    const p = pattern([
      [0, 0],
      [0, 0.25],
    ])
    const voice = padPatternVoice(p, settings({ swing: 1 }), pads, buffers)
    expect(voice.duration).toBeCloseTo(2 + 0.3)
    const { fake, context } = fakeContext()
    voice.build(context, context.destination, 0)
    const starts = fake.created.filter((n) => n.kind === 'buffersource').flatMap((n) => n.started)
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBeCloseTo((0.25 + 0.25 / 3) * 0.5)
  })
})
