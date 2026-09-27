import { describe, expect, it } from 'vitest'
import { MuteGroups, playPadHit, STOP_FADE, type PadHit } from '../../app/pads/hit'
import {
  emptyPad,
  gridOrder,
  keyForPad,
  newKit,
  padIndex,
  padName,
  padNumberForKey,
  velocityFromPosition,
  velocityGain,
} from '../../app/pads/kit'
import { fakeContext } from './fake-audio'

describe('kit e tastiera', () => {
  it('64 pad vuoti in 4 banchi, con nomi A1…D16', () => {
    const kit = newKit('Prova')
    expect(kit.pads).toHaveLength(64)
    expect(padIndex('A', 1)).toBe(0)
    expect(padIndex('D', 16)).toBe(63)
    expect(padName(0)).toBe('A1')
    expect(padName(63)).toBe('D16')
  })

  it('tastiera come su una MPC: Z è il pad 1, 4 è il 16', () => {
    expect(padNumberForKey('z')).toBe(1)
    expect(padNumberForKey('V')).toBe(4)
    expect(padNumberForKey('a')).toBe(5)
    expect(padNumberForKey('q')).toBe(9)
    expect(padNumberForKey('4')).toBe(16)
    expect(padNumberForKey('p')).toBeNull()
    expect(keyForPad(1)).toBe('Z')
    expect(keyForPad(13)).toBe('1')
  })

  it('la griglia mette il pad 1 in basso a sinistra', () => {
    expect(gridOrder.slice(-4)).toEqual([1, 2, 3, 4])
    expect(gridOrder.slice(0, 4)).toEqual([13, 14, 15, 16])
  })

  it('velocity: in alto forte, in basso piano; curva un po’ esponenziale', () => {
    expect(velocityFromPosition(0, 100)).toBe(1)
    expect(velocityFromPosition(100, 100)).toBe(0.25)
    expect(velocityFromPosition(50, 100)).toBeCloseTo(0.63, 2)
    expect(velocityGain(1)).toBe(1)
    expect(velocityGain(0.5)).toBeCloseTo(0.354, 3)
  })
})

describe('playPadHit', () => {
  const buffer = { duration: 2 } as AudioBuffer

  it('accorda con il playbackRate e dura il campione diviso per il rapporto', () => {
    const { fake, context } = fakeContext()
    const hit = playPadHit(context, context.destination, { ...emptyPad(), tune: 12 }, buffer, 1, 3)
    const source = fake.created.find((n) => n.kind === 'buffersource')
    const rate = (source as unknown as { playbackRate: { value: number } }).playbackRate.value
    expect(rate).toBe(2)
    expect(source?.started).toEqual([3])
    expect(hit.endsAt).toBe(4)
  })

  it('taglia alla lunghezza del pad con una dissolvenza brevissima', () => {
    const { fake, context } = fakeContext()
    const hit = playPadHit(
      context,
      context.destination,
      { ...emptyPad(), length: 0.5 },
      buffer,
      1,
      0,
    )
    expect(hit.endsAt).toBe(0.5)
    const source = fake.created.find((n) => n.kind === 'buffersource')
    expect(source?.stopped).toEqual([0.5 + STOP_FADE])
  })

  it('attacco e velocity sul guadagno', () => {
    const { fake, context } = fakeContext()
    playPadHit(
      context,
      context.destination,
      { ...emptyPad(), gain: 1, attack: 0.1 },
      buffer,
      0.5,
      0,
    )
    const gain = fake.created.find((n) => n.kind === 'gain') as unknown as {
      gain: { events: unknown[][] }
    }
    expect(gain.gain.events[0]).toEqual(['set', 0, 0])
    const [kind, value, time] = gain.gain.events[1] ?? []
    expect(kind).toBe('linear')
    expect(value).toBeCloseTo(velocityGain(0.5))
    expect(time).toBe(0.1)
  })
})

describe('MuteGroups', () => {
  const hit = (endsAt: number) => {
    const stops: number[] = []
    const h: PadHit & { stops: number[] } = { endsAt, stop: (at) => stops.push(at), stops }
    return h
  }

  it('un colpo nuovo ferma quelli in corso dello stesso gruppo, non degli altri', () => {
    const groups = new MuteGroups()
    const open = hit(5)
    const other = hit(5)
    groups.add(1, open, 0)
    groups.add(2, other, 0)
    groups.add(1, hit(5), 1)
    expect(open.stops).toEqual([1])
    expect(other.stops).toEqual([])
  })

  it('senza gruppo non ferma niente, e i colpi già finiti non si fermano', () => {
    const groups = new MuteGroups()
    const finished = hit(0.5)
    groups.add(1, finished, 0)
    groups.add(1, hit(5), 1)
    expect(finished.stops).toEqual([])
    const free = hit(5)
    groups.add(0, free, 0)
    groups.add(0, hit(5), 1)
    expect(free.stops).toEqual([])
  })
})
