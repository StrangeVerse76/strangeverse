import { SAMPLE_RATE } from './constants'

/**
 * Costruisce un grafo audio su un contesto qualsiasi.
 *
 * È il cuore della regola "un solo grafo" (ADR 0008): la stessa funzione serve sia per ascoltare
 * (AudioContext, `out` = uscita live) sia per rendere un file (OfflineAudioContext, `out` = destination).
 * `when` è l'istante di partenza nel tempo del contesto.
 */
export type GraphBuilder = (context: BaseAudioContext, out: AudioNode, when: number) => void

/** Un suono completo: quanto dura, quanti canali ha e come si costruisce. */
export interface Voice {
  duration: number
  channels: 1 | 2
  /** Preparazione asincrona del contesto (es. caricare gli AudioWorklet), prima di `build`. */
  prepare?: (context: BaseAudioContext) => Promise<void>
  build: GraphBuilder
}

export async function renderOffline(voice: Voice): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(voice.duration * SAMPLE_RATE))
  const context = new OfflineAudioContext(voice.channels, length, SAMPLE_RATE)
  await voice.prepare?.(context)
  voice.build(context, context.destination, 0)
  return context.startRendering()
}
