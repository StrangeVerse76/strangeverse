import { SAMPLE_RATE } from './constants'

/**
 * L'AudioContext live di Soundverse, uno solo per tutta l'app.
 *
 * Regola imparata con Bragi: il contesto si crea (o si riprende) **solo dentro un gesto dell'utente**.
 * Un contesto creato al caricamento nasce `suspended` e resta muto. Per questo non esiste un getter che
 * lo crea: chi vuole suonare chiama `unlockAudio()` nel gestore del click, in modo sincrono.
 */

interface LiveAudio {
  context: AudioContext
  /** Uscita comune: tutto ciò che suona passa di qui. */
  master: GainNode
}

let live: LiveAudio | null = null

export function unlockAudio(): LiveAudio {
  if (!live) {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    const master = context.createGain()
    master.connect(context.destination)
    live = { context, master }
  }
  if (live.context.state === 'suspended') {
    void live.context.resume()
  }
  return live
}

/** Il contesto live se è già stato sbloccato, altrimenti `null`. Non lo crea mai. */
export function getLiveAudio(): LiveAudio | null {
  return live
}
