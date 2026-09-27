import { applyLiveGains, emptyRegistry, timelineVoice, type GainRegistry } from './graph'
import type { TimelineProject } from './model'

const START_DELAY = 0.05

/**
 * Riproduzione live della timeline. Ogni avvio costruisce il grafo da `from`:
 * pausa e ripresa sono solo "ferma" e "riparti dal punto raggiunto".
 */
export class TimelineTransport {
  private out: GainNode | null = null
  private registry: GainRegistry = emptyRegistry()
  private startedAt = 0
  private from = 0
  private endTimer: ReturnType<typeof setTimeout> | undefined

  /** Chiamato quando si arriva alla fine del progetto. */
  onEnded: (() => void) | null = null

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
  ) {}

  get playing() {
    return this.out !== null
  }

  /**
   * Parte da `from`. I buffer devono essere **già decodificati**: `t0` si fissa solo dopo,
   * altrimenti al primo avvio la decodifica mangia il margine e i clip partono sfasati (Bragi).
   */
  play(project: TimelineProject, buffers: ReadonlyMap<string, AudioBuffer>, from: number) {
    this.stop()
    this.registry = emptyRegistry()
    const voice = timelineVoice(project, buffers, from, this.registry)
    const out = this.context.createGain()
    out.connect(this.destination)
    const when = this.context.currentTime + START_DELAY
    voice.build(this.context, out, when)
    this.out = out
    this.startedAt = when
    this.from = from
    this.endTimer = setTimeout(
      () => {
        this.stop()
        this.onEnded?.()
      },
      (voice.duration + START_DELAY) * 1000 + 30,
    )
  }

  stop() {
    clearTimeout(this.endTimer)
    const out = this.out
    this.out = null
    // Gli oscillatori di modulazione (chorus, flanger) girerebbero per sempre.
    for (const lfo of this.registry.returns?.lfos ?? []) lfo.stop(this.context.currentTime + 0.05)
    if (out) {
      out.gain.setTargetAtTime(0, this.context.currentTime, 0.005)
      setTimeout(() => out.disconnect(), 50)
    }
  }

  /** Posizione attuale nella timeline (secondi). */
  position(): number {
    if (!this.out) return this.from
    return this.from + Math.max(0, this.context.currentTime - this.startedAt)
  }

  updateGains(project: TimelineProject) {
    if (this.out) applyLiveGains(this.registry, project, this.context.currentTime)
  }
}
