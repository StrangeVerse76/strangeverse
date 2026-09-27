import { SAMPLE_RATE } from './constants'

/**
 * Costruisce un grafo audio su un contesto qualsiasi.
 *
 * È il cuore della regola "un solo grafo" (ADR 0008): la stessa funzione serve sia per ascoltare
 * (AudioContext, `out` = master) sia per rendere un file (OfflineAudioContext, `out` = destination).
 * `when` è l'istante di partenza nel tempo del contesto.
 */
export type GraphBuilder = (context: BaseAudioContext, out: AudioNode, when: number) => void

export interface RenderOptions {
  duration: number
  channels: 1 | 2
  build: GraphBuilder
}

export async function renderOffline({ duration, channels, build }: RenderOptions) {
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE))
  const context = new OfflineAudioContext(channels, length, SAMPLE_RATE)
  build(context, context.destination, 0)
  return context.startRendering()
}
