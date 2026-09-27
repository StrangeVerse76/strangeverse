import { Mp3Encoder } from '@breezystack/lamejs'

export const MP3_BITRATES = [128, 192, 320] as const
export type Mp3Bitrate = (typeof MP3_BITRATES)[number]

/** Campioni per frame MP3 (MPEG-1 Layer III): si codifica a blocchi di questa misura. */
const FRAME = 1152

function toInt16(channel: Float32Array, start: number, end: number): Int16Array {
  const out = new Int16Array(end - start)
  for (let i = start; i < end; i++) {
    const s = Math.max(-1, Math.min(1, channel[i] ?? 0))
    out[i - start] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/**
 * Codifica in MP3 (LAME, via @breezystack/lamejs). Sincrona e pesante: nell'app gira in un Worker.
 * `onProgress` riceve la frazione completata (0..1).
 */
export function encodeMp3Chunks(
  channels: readonly Float32Array[],
  sampleRate: number,
  kbps: Mp3Bitrate,
  onProgress?: (fraction: number) => void,
): Uint8Array[] {
  const stereo = channels.length > 1
  const left = channels[0] ?? new Float32Array(0)
  const right = channels[1] ?? left
  const encoder = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps)
  const chunks: Uint8Array[] = []
  const block = FRAME * 64
  for (let start = 0; start < left.length; start += block) {
    const end = Math.min(left.length, start + block)
    const data = stereo
      ? encoder.encodeBuffer(toInt16(left, start, end), toInt16(right, start, end))
      : encoder.encodeBuffer(toInt16(left, start, end))
    if (data.length) chunks.push(new Uint8Array(data))
    onProgress?.(end / left.length)
  }
  const tail = encoder.flush()
  if (tail.length) chunks.push(new Uint8Array(tail))
  return chunks
}
