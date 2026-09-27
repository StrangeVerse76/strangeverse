import type { Voice } from '~/audio/render'
import { MuteGroups, playPadHit } from './hit'
import type { Pad } from './kit'
import {
  eventsBetween,
  patternBeats,
  swingDelay,
  type PadPattern,
  type SequencerSettings,
} from './pattern'

/** Coda massima considerata dopo la fine del giro (poi si ripiega sull'inizio). */
const MAX_TAIL = 8

/** Durata di un giro del pattern, in secondi. */
export const patternSeconds = (pattern: PadPattern, settings: SequencerSettings) =>
  (patternBeats(pattern) * 60) / settings.bpm

/**
 * Un giro del pattern come Voice, con lo stesso colpo (`playPadHit`) e gli stessi gruppi di mute
 * del sequencer dal vivo. La coda oltre la fine si ripiega poi sull'inizio (`foldTail`).
 */
export function padPatternVoice(
  pattern: PadPattern,
  settings: SequencerSettings,
  pads: Pad[],
  buffers: ReadonlyMap<string, AudioBuffer>,
): Voice {
  const spb = 60 / settings.bpm
  const used = pattern.events.map((e) => pads[e.pad]?.clipId).filter((id): id is string => !!id)
  const tail = Math.min(MAX_TAIL, Math.max(0, ...used.map((id) => buffers.get(id)?.duration ?? 0)))
  return {
    duration: patternSeconds(pattern, settings) + tail,
    channels: 2,
    build(context, out, when) {
      const mutes = new MuteGroups()
      for (const event of eventsBetween(pattern, 0, patternBeats(pattern))) {
        const pad = pads[event.pad]
        const buffer = pad?.clipId ? buffers.get(pad.clipId) : undefined
        if (!pad || !buffer) continue
        const at = when + (event.beat + swingDelay(event.beat, settings.grid, settings.swing)) * spb
        mutes.add(pad.muteGroup, playPadHit(context, out, pad, buffer, event.velocity, at), at)
      }
    },
  }
}
