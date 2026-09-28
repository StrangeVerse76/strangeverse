import { describe, expect, it } from 'vitest'
import {
  audioPath,
  isSameWrite,
  MAX_PUSH_ITEMS,
  parsePush,
  parseSince,
  sameJson,
  type RemoteRecord,
} from '../../server/sync/rules'

const item = (extra: object = {}) => ({ kind: 'clip', id: 'abc-1', data: { name: 'A' }, ...extra })

describe('parsePush', () => {
  it('normalizza i campi facoltativi', () => {
    expect(parsePush({ items: [item()] })).toEqual([
      {
        kind: 'clip',
        id: 'abc-1',
        data: { name: 'A' },
        deleted: false,
        base: null,
        audioBytes: null,
      },
    ])
  })

  it('rifiuta tipi, id e dati non validi', () => {
    expect(() => parsePush({ items: [item({ kind: 'utente' })] })).toThrow('tipo non valido')
    expect(() => parsePush({ items: [item({ id: '../x' })] })).toThrow('id non valido')
    expect(() => parsePush({ items: [item({ data: [1] })] })).toThrow('data deve essere un oggetto')
    expect(() => parsePush({ items: [item({ base: 1.5 })] })).toThrow('base non valida')
    expect(() => parsePush({})).toThrow('manca items')
  })

  it('solo i clip hanno audio, e di una dimensione sensata', () => {
    expect(() => parsePush({ items: [item({ kind: 'kit', audioBytes: 10 })] })).toThrow(
      'solo i clip',
    )
    expect(() => parsePush({ items: [item({ audioBytes: 0 })] })).toThrow('dimensione')
    expect(parsePush({ items: [item({ audioBytes: 1000 })] })[0]?.audioBytes).toBe(1000)
  })

  it('limita il numero di record per invio', () => {
    const items = Array.from({ length: MAX_PUSH_ITEMS + 1 }, (_, i) => item({ id: `c${i}` }))
    expect(() => parsePush({ items })).toThrow('al massimo')
  })
})

describe('audioPath', () => {
  it('lo decide il server, con il prefisso dell’ambiente', () => {
    expect(audioPath('production', 'abc-1')).toBe('production/audio/abc-1.wav')
    expect(() => audioPath('production', '../../altro')).toThrow()
  })
})

describe('conflitti', () => {
  const current: RemoteRecord = {
    kind: 'project',
    id: 'p',
    data: { name: 'Demo', tracks: [1, 2] },
    hasAudio: false,
    audioBytes: null,
    seq: 7,
    deleted: false,
  }
  const push = (data: object, deleted = false) => ({
    kind: 'project' as const,
    id: 'p',
    data: data as Record<string, unknown>,
    deleted,
    base: 3,
    audioBytes: null,
  })

  it('un invio ripetuto con gli stessi dati non è un conflitto', () => {
    expect(isSameWrite(push({ tracks: [1, 2], name: 'Demo' }), current)).toBe(true)
  })

  it('dati diversi, o un’eliminazione, sì', () => {
    expect(isSameWrite(push({ name: 'Altro', tracks: [1, 2] }), current)).toBe(false)
    expect(isSameWrite(push({}, true), current)).toBe(false)
  })

  it('sameJson ignora l’ordine delle chiavi ma non quello degli array', () => {
    expect(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
    expect(sameJson([1, 2], [2, 1])).toBe(false)
    expect(sameJson({ a: undefined }, {})).toBe(false)
  })
})

it('parseSince accetta solo interi non negativi', () => {
  expect(parseSince(undefined)).toBe(0)
  expect(parseSince('42')).toBe(42)
  expect(() => parseSince('-1')).toThrow()
  expect(() => parseSince('abc')).toThrow()
})
