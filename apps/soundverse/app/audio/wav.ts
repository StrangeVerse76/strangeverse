const HEADER_BYTES = 44
const BYTES_PER_SAMPLE = 3
const MAX_POSITIVE = 0x7fffff
const MAX_NEGATIVE = 0x800000

/**
 * Codifica uno o due canali in un WAV PCM a 24 bit.
 * I campioni fuori da [-1, 1] vengono limitati, non riavvolti.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const first = channels[0]
  if (!first || channels.length > 2) {
    throw new Error(`encodeWav: servono 1 o 2 canali, ricevuti ${channels.length}`)
  }
  const length = first.length
  if (channels.some((channel) => channel.length !== length)) {
    throw new Error('encodeWav: i canali hanno lunghezze diverse')
  }

  const numChannels = channels.length
  const blockAlign = numChannels * BYTES_PER_SAMPLE
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(HEADER_BYTES + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // dimensione del blocco fmt
  view.setUint16(20, 1, true) // PCM intero
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = HEADER_BYTES
  for (let i = 0; i < length; i++) {
    for (const channel of channels) {
      const value = toInt24(channel[i] ?? 0)
      view.setUint8(offset, value & 0xff)
      view.setUint8(offset + 1, (value >> 8) & 0xff)
      view.setUint8(offset + 2, (value >> 16) & 0xff)
      offset += BYTES_PER_SAMPLE
    }
  }
  return buffer
}

/** Converte un campione float in intero a 24 bit (complemento a due su 24 bit). */
export function toInt24(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0))
  const scaled = Math.round(clamped < 0 ? clamped * MAX_NEGATIVE : clamped * MAX_POSITIVE)
  return scaled < 0 ? scaled + 0x1000000 : scaled
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}
