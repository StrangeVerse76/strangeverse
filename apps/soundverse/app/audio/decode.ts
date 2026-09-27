import { MAX_CHANNELS, SAMPLE_RATE } from './constants'

/**
 * Decodifica un file audio alla frequenza di Soundverse.
 * Usa un OfflineAudioContext, quindi non serve un gesto dell'utente e non si tocca il contesto live.
 */
export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  return context.decodeAudioData(data)
}

/** Copia i canali di un AudioBuffer (al massimo stereo: i canali oltre il secondo si scartano). */
export function bufferToChannels(buffer: AudioBuffer): Float32Array[] {
  const count = Math.min(buffer.numberOfChannels, MAX_CHANNELS)
  return Array.from({ length: count }, (_, ch) => buffer.getChannelData(ch).slice())
}
