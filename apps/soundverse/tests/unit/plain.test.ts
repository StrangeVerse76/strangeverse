import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { toPlain } from '../../app/utils/plain'

describe('toPlain', () => {
  it('clona anche quando array ricostruiti nello stato contengono proxy', () => {
    const state = reactive({ pattern: { events: [{ pad: 0, beat: 0 }] } })
    // Come fa `addEvent`: un array nuovo costruito dagli elementi reattivi.
    state.pattern.events = [...state.pattern.events.filter(() => true), { pad: 1, beat: 1 }]
    expect(() => structuredClone(state.pattern)).toThrow()
    const copy = toPlain(state.pattern)
    expect(copy).toEqual({
      events: [
        { pad: 0, beat: 0 },
        { pad: 1, beat: 1 },
      ],
    })
    const first = copy.events[0]
    if (first) first.pad = 9
    expect(state.pattern.events[0]?.pad).toBe(0)
  })

  it('lascia intatti gli array tipizzati', () => {
    const data = Float32Array.from([1, 2])
    const copy = toPlain(reactive({ data }))
    expect(copy.data).toBeInstanceOf(Float32Array)
    expect(Array.from(copy.data)).toEqual([1, 2])
  })
})
