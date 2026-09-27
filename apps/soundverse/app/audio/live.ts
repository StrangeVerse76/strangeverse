import type { Voice } from './render'

/** Margine prima della partenza: lascia al contesto il tempo di ricevere tutto il grafo. */
const START_DELAY = 0.03
const STOP_FADE = 0.015

export interface LiveVoice {
  /** Istante di fine, nel tempo del contesto. */
  endsAt: number
  /** Si risolve quando il suono è finito o è stato fermato. */
  done: Promise<void>
  stop: () => void
}

/**
 * Suona una Voice sul contesto live, con lo stesso `build` usato da `renderOffline`.
 * Il contesto va sbloccato dal chiamante con `unlockAudio()`, dentro il gesto dell'utente.
 */
export async function playLive(
  voice: Voice,
  live: { context: AudioContext; master: AudioNode },
): Promise<LiveVoice> {
  const { context, master } = live
  await voice.prepare?.(context)

  const out = context.createGain()
  out.connect(master)
  const when = context.currentTime + START_DELAY
  voice.build(context, out, when)
  const endsAt = when + voice.duration

  let finish: () => void = () => {}
  const done = new Promise<void>((resolve) => (finish = resolve))
  let stopped = false
  const release = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    setTimeout(() => out.disconnect(), STOP_FADE * 1000 + 20)
    finish()
  }
  const timer = setTimeout(release, (endsAt - context.currentTime) * 1000 + 50)

  return {
    endsAt,
    done,
    stop() {
      out.gain.setTargetAtTime(0, context.currentTime, STOP_FADE / 3)
      release()
    },
  }
}
