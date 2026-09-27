import { describe, expect, it } from 'vitest'
import { emptyPad, type Pad } from '../../app/pads/kit'
import { isBlackKey, level, levelText, noteName, pianoKeys, pianoTune } from '../../app/pads/levels'
import { addEvent, newPattern } from '../../app/pads/pattern'
import { padPatternVoice } from '../../app/pads/render'
import { fakeContext } from './fake-audio'

const pad: Pad = { ...emptyPad(), tune: 2 }

describe('16 Levels', () => {
  it('accordatura cromatica: il pad 9 è il tono del pad, dal −8 al +7', () => {
    expect(level(pad, 'tune', 9, 1).overrides.tune).toBe(2)
    expect(level(pad, 'tune', 1, 1).overrides.tune).toBe(-6)
    expect(level(pad, 'tune', 16, 1).overrides.tune).toBe(9)
    expect(level(pad, 'tune', 9, 1).velocity).toBe(1)
  })

  it('velocity da 1/16 a piena; attack e lunghezza crescenti', () => {
    expect(level(pad, 'velocity', 1, 1).velocity).toBeCloseTo(1 / 16)
    expect(level(pad, 'velocity', 16, 1).velocity).toBe(1)
    expect(level(pad, 'attack', 1, 1).overrides.attack).toBe(0)
    expect(level(pad, 'attack', 16, 1).overrides.attack).toBeCloseTo(1.5)
    expect(level(pad, 'length', 8, 2).overrides.length).toBeCloseTo(1)
  })

  it('etichette brevi', () => {
    expect(levelText('tune', level(pad, 'tune', 16, 1))).toBe('+9 st')
    expect(levelText('velocity', level(pad, 'velocity', 16, 1))).toBe('vel 127')
    expect(levelText('attack', level(pad, 'attack', 16, 1))).toBe('1500 ms')
  })
})

describe('tastiera a piano', () => {
  it('due ottave dal Do scelto; il Do4 è il tono originale', () => {
    const keys = pianoKeys(3)
    expect(keys).toHaveLength(25)
    expect(noteName(keys[0] ?? 0)).toBe('Do3')
    expect(noteName(keys[24] ?? 0)).toBe('Do5')
    expect(pianoTune(pad, 60)).toBe(2)
    expect(pianoTune(pad, 67)).toBe(9)
    expect(keys.filter(isBlackKey)).toHaveLength(10)
  })
})

describe('eventi con varianti', () => {
  it('stesso pad e istante con accordature diverse convivono (un accordo); uguali si sostituiscono', () => {
    const p = newPattern(1)
    addEvent(p, { pad: 0, beat: 0, velocity: 1, overrides: { tune: 0 } })
    addEvent(p, { pad: 0, beat: 0, velocity: 1, overrides: { tune: 4 } })
    addEvent(p, { pad: 0, beat: 0, velocity: 0.5, overrides: { tune: 4 } })
    expect(p.events).toHaveLength(2)
    expect(p.events.find((e) => e.overrides?.tune === 4)?.velocity).toBe(0.5)
  })

  it('il render applica le varianti del colpo', () => {
    const pads: Pad[] = [{ ...emptyPad(), clipId: 'a' }]
    const buffers = new Map([['a', { duration: 1 } as AudioBuffer]])
    const p = {
      ...newPattern(1),
      events: [{ pad: 0, beat: 0, velocity: 1, overrides: { tune: 12 } }],
    }
    const { fake, context } = fakeContext()
    padPatternVoice(p, { bpm: 120, grid: '1/16', quantize: true, swing: 0 }, pads, buffers).build(
      context,
      context.destination,
      0,
    )
    const source = fake.created.find((n) => n.kind === 'buffersource') as unknown as {
      playbackRate: { value: number }
    }
    expect(source.playbackRate.value).toBe(2)
  })
})
