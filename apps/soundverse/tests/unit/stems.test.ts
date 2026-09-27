import { describe, expect, it } from 'vitest'
import { stemProject, stemTracks } from '../../app/export/stems'
import { crc32, safeFileName, zip } from '../../app/export/zip'
import type { TimelineProject } from '../../app/timeline/model'

describe('zip', () => {
  it('CRC-32 di riferimento', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('intestazioni locali, directory centrale e dati leggibili', () => {
    const a = new TextEncoder().encode('ciao')
    const b = new Uint8Array([1, 2, 3])
    const bytes = zip([
      { name: 'uno.txt', data: a },
      { name: 'è due.bin', data: b },
    ])
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    const end = bytes.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    expect(view.getUint16(end + 10, true)).toBe(2)
    // Primo file: nome e contenuto subito dopo l'intestazione di 30 byte.
    const nameLength = view.getUint16(26, true)
    expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('uno.txt')
    expect(new TextDecoder().decode(bytes.slice(30 + nameLength, 30 + nameLength + 4))).toBe('ciao')
    expect(view.getUint32(14, true)).toBe(crc32(a))
  })

  it('nomi di file sicuri', () => {
    expect(safeFileName('Mix: A/B?')).toBe('Mix- A-B-')
    expect(safeFileName('   ')).toBe('senza-nome')
  })
})

describe('stem', () => {
  const project: TimelineProject = {
    bpm: 120,
    master: 1,
    tracks: [
      { id: 'a', name: 'A', gain: 1, muted: false, mix: { solo: true } },
      { id: 'b', name: 'B', gain: 1, muted: false },
      { id: 'c', name: 'C', gain: 1, muted: false },
    ],
    placements: [
      { id: '1', clipId: 'x', trackId: 'a', start: 0, gain: 1, fadeIn: 0, fadeOut: 0, repeat: 1 },
      { id: '2', clipId: 'x', trackId: 'b', start: 2, gain: 1, fadeIn: 0, fadeOut: 0, repeat: 1 },
    ],
  }

  it('solo le tracce con blocchi danno uno stem', () => {
    expect(stemTracks(project).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('lo stem di una traccia zittisce le altre e ignora i solo', () => {
    const stem = stemProject(project, 'b')
    expect(stem.tracks.map((t) => t.muted)).toEqual([true, false, true])
    expect(stem.tracks.every((t) => t.mix?.solo === false)).toBe(true)
    expect(stem.placements).toBe(project.placements) // stessa durata del mix
  })
})
