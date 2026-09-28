import { describe, expect, it } from 'vitest'
import { formatDuration, formatBytes } from '../../app/utils/format'

describe('formatDuration', () => {
  it('mostra minuti, secondi e decimi', () => {
    expect(formatDuration(3.24)).toBe('0:03.2')
    expect(formatDuration(65)).toBe('1:05.0')
    expect(formatDuration(0)).toBe('0:00.0')
  })

  it('tratta i valori non validi come zero', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00.0')
    expect(formatDuration(-1)).toBe('0:00.0')
  })
})

describe('formatBytes', () => {
  it('sceglie l’unità e usa la virgola', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(13 * 1024 * 1024)).toBe('13 MB')
    expect(formatBytes(1024 ** 3)).toBe('1 GB')
  })
})
