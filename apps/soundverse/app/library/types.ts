import type { ProgressionSpec } from '~/chords/progression'
import type { DrumPattern } from '~/drums/pattern'
import type { PadMixer } from '~/pads/bus'
import type { Pad } from '~/pads/kit'
import type { PadPattern, SequencerSettings } from '~/pads/pattern'
import type { SampleOp } from '~/samples/ops'
import type { SynthSpec } from '~/synth/spec'
import type { TimelineProject } from '~/timeline/model'

export type ClipKind = 'synth' | 'drums' | 'sample' | 'mix'

/**
 * Come è nato un clip: la "ricetta" che permette di rifarlo o di ripartire da lì.
 * Ogni pannello aggiunge qui la sua variante (synth, batteria, operazioni sui campioni, mix).
 */
export type ClipRecipe =
  | { type: 'import'; fileName: string }
  | { type: 'recording'; device: string }
  | { type: 'synth'; spec: SynthSpec }
  | { type: 'drums'; pattern: DrumPattern }
  | { type: 'sample'; sourceId: string; sourceName: string; ops: SampleOp[] }
  | {
      type: 'mix'
      project: TimelineProject
      /** Uno stem: reso senza limitatore. Facoltativo (i clip più vecchi non l'hanno). */
      stem?: boolean
    }
  | { type: 'chords'; spec: ProgressionSpec }
  | {
      type: 'padPattern'
      pattern: PadPattern
      settings: SequencerSettings
      pads: Pad[]
      /** Il canale "Pad" del mixer al momento del salvataggio. Facoltativo. */
      mixer?: PadMixer
    }

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
  /**
   * BPM e tonalità: stimati (campioni importati), presi dalla ricetta (batteria, mix)
   * o corretti a mano. Facoltativo: i clip salvati prima non ce l'hanno.
   */
  analysis?: ClipAnalysis
}

export interface ClipAnalysis {
  bpm: number | null
  key: string | null
  /** true se l'ha impostata Pietro a mano: una nuova stima non la sovrascrive senza chiedere. */
  manual?: boolean
}

export const kindLabels: Record<ClipKind, string> = {
  synth: 'Synth',
  drums: 'Batteria',
  sample: 'Campione',
  mix: 'Mix',
}
