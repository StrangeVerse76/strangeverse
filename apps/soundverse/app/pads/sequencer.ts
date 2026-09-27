import { MuteGroups, playPadHit } from './hit'
import type { Pad } from './kit'
import type { PadOverrides } from './levels'
import {
  BEATS_PER_BAR,
  eventsBetween,
  gridBeats,
  patternBeats,
  stepsBetween,
  swingDelay,
  type PadPattern,
  type SequencerSettings,
} from './pattern'

const LOOKAHEAD = 0.12
const TICK_MS = 25
const START_DELAY = 0.06

export interface SequencerSource {
  pattern: () => PadPattern
  settings: () => SequencerSettings
  pads: () => Pad[]
  buffer: (clipId: string) => AudioBuffer | undefined
  /** Note tenute premute (o in latch) per il Note Repeat. */
  repeating: () => ReadonlyMap<string, RepeatNote>
  noteRepeat: () => boolean
  metronome: () => boolean
  /** Chiamato quando il Note Repeat produce un colpo (per registrarlo). */
  onRepeatHit?: (note: RepeatNote, beat: number) => void
  /** Chiamato a ogni fine giro: può cambiare pattern (coda dal vivo). */
  onLoopEnd?: () => void
}

export interface RepeatNote {
  pad: number
  velocity: number
  overrides?: PadOverrides
}

/**
 * Il sequencer dei pad: programma in anticipo sul clock dell'AudioContext, come la batteria.
 * La posizione si tiene in battiti assoluti; il BPM può cambiare mentre suona.
 */
export class PadSequencer {
  private timer: ReturnType<typeof setInterval> | undefined
  private out: GainNode | null = null
  private cursorBeat = 0
  private cursorTime = 0
  private readonly mutes = new MuteGroups()

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    private readonly source: SequencerSource,
  ) {}

  get playing() {
    return this.timer !== undefined
  }

  start() {
    if (this.playing) return
    this.out = this.context.createGain()
    this.out.connect(this.destination)
    this.cursorBeat = 0
    this.cursorTime = this.context.currentTime + START_DELAY
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    const out = this.out
    this.out = null
    if (out) {
      out.gain.setTargetAtTime(0, this.context.currentTime, 0.005)
      setTimeout(() => out.disconnect(), 60)
    }
  }

  /** Battito del pattern in ascolto ora (0 ≤ beat < lunghezza), per registrare e per il cursore. */
  currentBeat(): number {
    const spb = 60 / this.source.settings().bpm
    const absolute = this.cursorBeat - (this.cursorTime - this.context.currentTime) / spb
    const length = patternBeats(this.source.pattern())
    return ((absolute % length) + length) % length
  }

  private tick() {
    const out = this.out
    if (!out) return
    const spb = 60 / this.source.settings().bpm
    const until = this.context.currentTime + LOOKAHEAD
    if (until <= this.cursorTime) return
    const fromBeat = this.cursorBeat
    const toBeat = fromBeat + (until - this.cursorTime) / spb
    const timeOf = (beat: number) => this.cursorTime + (beat - fromBeat) * spb

    // La finestra si spezza alla fine del giro: prima il pattern che suona, poi (dopo la coda) il nuovo.
    let segment = fromBeat
    while (segment < toBeat - 1e-9) {
      const length = patternBeats(this.source.pattern())
      const boundary = (Math.floor(segment / length + 1e-9) + 1) * length
      const segmentEnd = Math.min(toBeat, boundary)
      this.schedule(out, segment, segmentEnd, timeOf)
      if (segmentEnd >= boundary - 1e-9) this.source.onLoopEnd?.()
      segment = segmentEnd
    }

    this.cursorBeat = toBeat
    this.cursorTime = until
  }

  private schedule(
    out: AudioNode,
    fromBeat: number,
    toBeat: number,
    timeOf: (beat: number) => number,
  ) {
    const settings = this.source.settings()
    const pattern = this.source.pattern()
    const length = patternBeats(pattern)
    const pads = this.source.pads()

    for (const event of eventsBetween(pattern, fromBeat, toBeat)) {
      const at = timeOf(event.absolute + swingDelay(event.beat, settings.grid, settings.swing))
      this.hit(out, pads, event.pad, event.velocity, at, event.overrides)
    }

    if (this.source.noteRepeat()) {
      const step = gridBeats(settings.grid)
      for (const beat of stepsBetween(step, fromBeat, toBeat)) {
        const inPattern = ((beat % length) + length) % length
        const at = timeOf(beat + swingDelay(inPattern, settings.grid, settings.swing))
        for (const note of this.source.repeating().values()) {
          this.hit(out, pads, note.pad, note.velocity, at, note.overrides)
          this.source.onRepeatHit?.(note, inPattern)
        }
      }
    }

    if (this.source.metronome()) {
      for (const beat of stepsBetween(1, fromBeat, toBeat)) {
        const inPattern = ((beat % length) + length) % length
        this.click(out, timeOf(beat), Math.round(inPattern) % BEATS_PER_BAR === 0)
      }
    }
  }

  private hit(
    out: AudioNode,
    pads: Pad[],
    index: number,
    velocity: number,
    at: number,
    overrides?: PadOverrides,
  ) {
    const pad = pads[index]
    const buffer = pad?.clipId ? this.source.buffer(pad.clipId) : undefined
    if (!pad || !buffer) return
    const played = { ...pad, ...overrides }
    this.mutes.add(pad.muteGroup, playPadHit(this.context, out, played, buffer, velocity, at), at)
  }

  /** Il clic del metronomo: breve, più acuto sul primo battito della battuta. */
  private click(out: AudioNode, at: number, accent: boolean) {
    const osc = this.context.createOscillator()
    osc.frequency.value = accent ? 1760 : 1320
    const gain = this.context.createGain()
    gain.gain.setValueAtTime(0.25, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + 0.06)
  }
}
