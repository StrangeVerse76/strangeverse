import { describe, expect, it } from 'vitest'
import { findKnob, knobLabel, registerKnob, touchKnob, lastTouchedKnob } from '../../app/midi/knobs'
import { ccPosition, padForNote, parseMidi } from '../../app/midi/messages'

describe('parseMidi', () => {
  it('note on, note off e controller, con il canale', () => {
    expect(parseMidi([0x90, 36, 100])).toEqual({
      type: 'noteon',
      channel: 1,
      note: 36,
      velocity: 100,
    })
    expect(parseMidi([0x83, 36, 0])).toEqual({ type: 'noteoff', channel: 4, note: 36 })
    expect(parseMidi([0xb1, 7, 64])).toEqual({ type: 'cc', channel: 2, controller: 7, value: 64 })
  })

  it('un note on con velocity 0 è un note off; il resto si ignora', () => {
    expect(parseMidi([0x90, 40, 0])).toEqual({ type: 'noteoff', channel: 1, note: 40 })
    expect(parseMidi([0xf8])).toBeNull() // clock
  })
})

describe('note → pad', () => {
  it('mappa cromatica da Do1 e note imparate prima di tutto', () => {
    expect(padForNote(36, 36, {})).toBe(0)
    expect(padForNote(51, 36, {})).toBe(15)
    expect(padForNote(52, 36, {})).toBe(16) // B1
    expect(padForNote(35, 36, {})).toBeNull()
    expect(padForNote(100, 36, {})).toBeNull()
    expect(padForNote(60, 36, { 60: 5 })).toBe(5)
  })

  it('il valore del controller diventa una posizione 0..1', () => {
    expect(ccPosition(0)).toBe(0)
    expect(ccPosition(127)).toBe(1)
    expect(ccPosition(64)).toBeCloseTo(0.504, 3)
  })
})

describe('registro delle manopole', () => {
  it('più manopole con lo stesso nome restano distinte per posizione', () => {
    const moved: string[] = []
    const a = { setPosition: () => moved.push('a') }
    const b = { setPosition: () => moved.push('b') }
    const offA = registerKnob('Freq', a)
    registerKnob('Freq', b)
    touchKnob('Freq', b)
    expect(lastTouchedKnob()).toEqual({ name: 'Freq', index: 1 })
    findKnob({ name: 'Freq', index: 1 })?.setPosition(0.5)
    expect(moved).toEqual(['b'])
    expect(knobLabel({ name: 'Freq', index: 1 })).toBe('Freq (2)')
    offA()
    findKnob({ name: 'Freq', index: 0 })?.setPosition(0.5)
    expect(moved).toEqual(['b', 'b'])
  })
})
