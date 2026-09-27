import { describe, expect, it } from 'vitest'
import {
  cycleVelocity,
  defaultPattern,
  foldTail,
  hitSpec,
  hitsAt,
  newTrack,
  patternLength,
  patternVoice,
  resizeSteps,
  stepDuration,
  stepTime,
  VELOCITY_ACCENT,
  VELOCITY_ON,
  type DrumPattern,
} from '../../app/drums/pattern'
import { stepsUntil } from '../../app/drums/sequencer'
import { voiceSpecs } from '../../app/drums/voices'
import { fakeContext } from './fake-audio'

function pattern(partial: Partial<DrumPattern> = {}): DrumPattern {
  return { ...defaultPattern(), ...partial }
}

describe('tempi del pattern', () => {
  it('a 120 BPM un sedicesimo dura 125 ms e una battuta 2 s', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125)
    expect(patternLength({ bpm: 120, bars: 1 })).toBeCloseTo(2)
    expect(patternLength({ bpm: 60, bars: 2 })).toBeCloseTo(8)
  })

  it('lo swing ritarda solo i passi dispari, fino a un terzo di passo', () => {
    const p = { bpm: 120, swing: 1 }
    expect(stepTime(0, p)).toBeCloseTo(0)
    expect(stepTime(1, p)).toBeCloseTo(0.125 + 0.125 / 3)
    expect(stepTime(2, p)).toBeCloseTo(0.25)
    expect(stepTime(3, { bpm: 120, swing: 0.5 })).toBeCloseTo(0.375 + 0.125 / 6)
  })
})

describe('passi e tracce', () => {
  it('il click cicla spento → acceso → accento → spento', () => {
    expect(cycleVelocity(0)).toBe(VELOCITY_ON)
    expect(cycleVelocity(VELOCITY_ON)).toBe(VELOCITY_ACCENT)
    expect(cycleVelocity(VELOCITY_ACCENT)).toBe(0)
  })

  it('aggiungendo battute si copia la prima, togliendole si tagliano', () => {
    const steps = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0))
    const two = resizeSteps(steps, 2)
    expect(two).toHaveLength(32)
    expect(two.slice(16)).toEqual(steps)
    expect(resizeSteps(two, 1)).toEqual(steps)
  })

  it('le tracce mute e i passi spenti non suonano', () => {
    const kick = newTrack('kick', 1)
    const snare = newTrack('snare', 1)
    kick.steps[0] = 1
    snare.steps[0] = 1
    snare.muted = true
    const hits = hitsAt(pattern({ tracks: [kick, snare] }), 0)
    expect(hits.map((h) => h.track.voice)).toEqual(['kick'])
    expect(hitsAt(pattern({ tracks: [kick, snare] }), 1)).toEqual([])
  })

  it("l'accordatura sposta oscillatori e filtro, volume e velocità scalano il master", () => {
    const track = { ...newTrack('snare', 1), tune: 12, gain: 0.5 }
    const spec = hitSpec(track, 0.5)
    const base = voiceSpecs.snare
    expect(spec.oscillators[0]?.frequency).toBeCloseTo((base.oscillators[0]?.frequency ?? 0) * 2)
    expect(spec.filter?.cutoff).toBeCloseTo((base.filter?.cutoff ?? 0) * 2)
    expect(spec.master).toBeCloseTo(base.master * 0.25)
  })
})

describe('foldTail', () => {
  it('riporta la coda sull’inizio e taglia alla lunghezza del loop', () => {
    const channel = Float32Array.from([1, 2, 3, 4, 10, 20])
    expect(Array.from(foldTail(channel, 4))).toEqual([11, 22, 3, 4])
  })

  it('una coda più lunga del loop si somma più volte', () => {
    expect(Array.from(foldTail(Float32Array.from([1, 1, 1, 1, 1]), 2))).toEqual([3, 2])
  })
})

describe('stepsUntil (sequencer)', () => {
  const kickOnly = () => {
    const kick = newTrack('kick', 1)
    kick.steps[0] = 1
    return pattern({ bpm: 120, tracks: [kick] })
  }

  it('programma i passi fino a `until`, uno ogni sedicesimo', () => {
    const { steps, cursor } = stepsUntil(kickOnly(), { step: 0, time: 10 }, 10.3)
    expect(steps.map((s) => s.step)).toEqual([0, 1, 2])
    expect(steps.map((s) => s.time)).toEqual([10, 10.125, 10.25])
    expect(cursor).toEqual({ step: 3, time: 10.375 })
    expect(steps[0]?.hits).toHaveLength(1)
    expect(steps[1]?.hits).toHaveLength(0)
  })

  it('chiamate successive sono continue e il loop ricomincia da 0', () => {
    const p = kickOnly()
    let cursor = { step: 0, time: 0 }
    const all: number[] = []
    for (const until of [0.5, 1.2, 2.3]) {
      const result = stepsUntil(p, cursor, until)
      all.push(...result.steps.map((s) => s.step))
      cursor = result.cursor
    }
    expect(all).toEqual([...Array.from({ length: 16 }, (_, i) => i), 0, 1, 2])
  })

  it('un cambio di BPM vale dal passo successivo, senza salti', () => {
    const p = kickOnly()
    const first = stepsUntil(p, { step: 0, time: 0 }, 0.2)
    p.bpm = 60
    const second = stepsUntil(p, first.cursor, 1)
    expect(first.steps.map((s) => s.time)).toEqual([0, 0.125])
    expect(second.steps.map((s) => s.time)).toEqual([0.25, 0.5, 0.75])
  })
})

describe('patternVoice (render)', () => {
  it('suona ogni colpo al suo tempo, swing compreso, su un grafo unico', () => {
    const kick = newTrack('kick', 1)
    kick.steps[0] = 1
    kick.steps[5] = 1
    const p = pattern({ bpm: 120, swing: 0.6, tracks: [kick] })
    const voice = patternVoice(p)
    expect(voice.duration).toBeCloseTo(
      2 + Math.max(...Object.values(voiceSpecs).map((s) => s.duration)),
    )

    const { fake, context } = fakeContext()
    voice.build(context, context.destination, 0)
    const starts = fake.created.filter((n) => n.kind === 'oscillator').flatMap((n) => n.started)
    expect(starts).toEqual([0, stepTime(5, p)])
  })
})
