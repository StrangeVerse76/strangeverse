import { velocityGain, type Pad } from './kit'

/** Dissolvenza quando un colpo viene fermato (fine della lunghezza o gruppo di mute): niente click. */
export const STOP_FADE = 0.005

export interface PadHit {
  /** Istante di fine naturale, nel tempo del contesto. */
  endsAt: number
  /** Ferma il colpo a `at` (con una dissolvenza brevissima). */
  stop: (at: number) => void
}

/**
 * Un colpo su un pad: il campione con accordatura (varispeed), attacco, lunghezza e velocity.
 * È lo stesso grafo per suonare dal vivo e per il render del sequencer.
 */
export function playPadHit(
  context: BaseAudioContext,
  out: AudioNode,
  pad: Pad,
  buffer: AudioBuffer,
  velocity: number,
  when: number,
): PadHit {
  const rate = Math.pow(2, pad.tune / 12)
  const natural = buffer.duration / rate
  const duration = pad.length === null ? natural : Math.min(natural, pad.length)
  const level = pad.gain * velocityGain(velocity)

  const source = context.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate
  const gain = context.createGain()
  source.connect(gain).connect(out)

  const attack = Math.min(pad.attack, duration)
  gain.gain.setValueAtTime(attack > 0 ? 0 : level, when)
  if (attack > 0) gain.gain.linearRampToValueAtTime(level, when + attack)
  const end = when + duration
  if (pad.length !== null && duration < natural) {
    // Taglio alla lunghezza del pad, con una dissolvenza brevissima.
    gain.gain.setValueAtTime(level, Math.max(when + attack, end - STOP_FADE))
    gain.gain.linearRampToValueAtTime(0, end)
  }
  source.start(when)
  source.stop(end + STOP_FADE)

  let stopped = false
  return {
    endsAt: end,
    stop(at: number) {
      if (stopped || at >= end) return
      stopped = true
      gain.gain.cancelScheduledValues(at)
      gain.gain.setValueAtTime(gain.gain.value, at)
      gain.gain.linearRampToValueAtTime(0, at + STOP_FADE)
      source.stop(at + STOP_FADE)
    },
  }
}

/**
 * Tiene traccia dei colpi per gruppo di mute: un colpo nuovo in un gruppo ferma quelli
 * ancora in corso nello stesso gruppo (per esempio il charleston chiuso ferma quello aperto).
 */
export class MuteGroups {
  private readonly active = new Map<number, PadHit[]>()

  add(group: number, hit: PadHit, at: number) {
    if (group <= 0) return
    const running = (this.active.get(group) ?? []).filter((h) => h.endsAt > at)
    for (const other of running) other.stop(at)
    this.active.set(group, [hit])
  }
}
