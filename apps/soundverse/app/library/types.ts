import type { DrumPattern } from '~/drums/pattern'
import type { SampleOp } from '~/samples/ops'
import type { SynthSpec } from '~/synth/spec'

export type ClipKind = 'synth' | 'drums' | 'sample' | 'mix'

/**
 * Come è nato un clip: la "ricetta" che permette di rifarlo o di ripartire da lì.
 * Ogni pannello aggiunge qui la sua variante (synth, batteria, operazioni sui campioni, mix).
 */
export type ClipRecipe =
  | { type: 'import'; fileName: string }
  | { type: 'synth'; spec: SynthSpec }
  | { type: 'drums'; pattern: DrumPattern }
  | { type: 'sample'; sourceId: string; sourceName: string; ops: SampleOp[] }

/** Metadati di un clip. L'audio (WAV) è salvato a parte, con lo stesso `id`. */
export interface Clip {
  id: string
  name: string
  kind: ClipKind
  tags: string[]
  /** Secondi. */
  duration: number
  sampleRate: number
  channels: number
  /** Picco lineare (0..1). */
  peak: number
  /** Picchi per la waveform, `PEAK_BUCKETS` valori in 0..1. */
  peaks: number[]
  /** Millisecondi dall'epoch. */
  createdAt: number
  recipe: ClipRecipe
}

export const kindLabels: Record<ClipKind, string> = {
  synth: 'Synth',
  drums: 'Batteria',
  sample: 'Campione',
  mix: 'Mix',
}
