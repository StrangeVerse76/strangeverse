import { describe, expect, it } from 'vitest'
import { encodeWav, toInt24 } from '../../app/audio/wav'

function ascii(view: DataView, offset: number, length: number) {
  return String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))
}

function readInt24(view: DataView, offset: number) {
  const value =
    view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
  return value & 0x800000 ? value - 0x1000000 : value
}

describe('encodeWav', () => {
  it('scrive un header PCM 24 bit corretto', () => {
    const view = new DataView(encodeWav([new Float32Array(10), new Float32Array(10)], 48_000))

    expect(ascii(view, 0, 4)).toBe('RIFF')
    expect(ascii(view, 8, 4)).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(2) // canali
    expect(view.getUint32(24, true)).toBe(48_000)
    expect(view.getUint32(28, true)).toBe(48_000 * 6) // byte al secondo
    expect(view.getUint16(32, true)).toBe(6) // block align
    expect(view.getUint16(34, true)).toBe(24)
    expect(ascii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(60)
    expect(view.byteLength).toBe(44 + 60)
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8)
  })

  it('alterna i canali e converte i valori', () => {
    const left = new Float32Array([0, 1, -1])
    const right = new Float32Array([0.5, -0.5, 0])
    const view = new DataView(encodeWav([left, right], 48_000))

    const samples = Array.from({ length: 6 }, (_, i) => readInt24(view, 44 + i * 3))
    expect(samples).toEqual([0, 4_194_304, 8_388_607, -4_194_304, -8_388_608, 0])
  })

  it('limita i valori fuori scala invece di riavvolgerli', () => {
    expect(toInt24(2)).toBe(0x7fffff)
    expect(toInt24(-2)).toBe(0x800000)
    expect(toInt24(Number.NaN)).toBe(0)
  })

  it('rifiuta zero canali, più di due o lunghezze diverse', () => {
    expect(() => encodeWav([], 48_000)).toThrow()
    expect(() =>
      encodeWav([new Float32Array(1), new Float32Array(1), new Float32Array(1)], 48_000),
    ).toThrow()
    expect(() => encodeWav([new Float32Array(1), new Float32Array(2)], 48_000)).toThrow()
  })
})
