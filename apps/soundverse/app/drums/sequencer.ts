import {
  hitsAt,
  playHit,
  stepDuration,
  swingOffset,
  totalSteps,
  type DrumPattern,
  type Hit,
} from './pattern'

/** Quanto in anticipo si programmano i colpi, e ogni quanto si controlla (lookahead scheduling). */
export const LOOKAHEAD = 0.12
const TICK_MS = 25
const START_DELAY = 0.05

export interface ScheduledStep {
  step: number
  time: number
  hits: Hit[]
}

export interface Cursor {
  /** Prossimo passo da programmare. */
  step: number
  /** Istante (senza swing) del prossimo passo, nel tempo del contesto. */
  time: number
}

/**
 * Parte pura del sequencer: i passi da programmare fra ora e `until`.
 * Legge il pattern a ogni chiamata, quindi BPM, swing e passi cambiati mentre suona valgono subito.
 */
export function stepsUntil(
  pattern: DrumPattern,
  cursor: Cursor,
  until: number,
): { steps: ScheduledStep[]; cursor: Cursor } {
  const steps: ScheduledStep[] = []
  let { step, time } = cursor
  const count = totalSteps(pattern)
  while (time < until) {
    const index = step % count
    steps.push({
      step: index,
      time: time + swingOffset(index, pattern),
      hits: hitsAt(pattern, index),
    })
    time += stepDuration(pattern.bpm)
    step = (index + 1) % count
  }
  return { steps, cursor: { step, time } }
}

/**
 * Suona il pattern in loop sul contesto live. Il timer serve solo a "svegliare" lo scheduler:
 * i tempi dei colpi vengono sempre dal clock dell'AudioContext (ADR 0008).
 */
export class DrumSequencer {
  private timer: ReturnType<typeof setInterval> | undefined
  private cursor: Cursor = { step: 0, time: 0 }
  private out: GainNode | null = null
  private queue: ScheduledStep[] = []
  private lastStep: number | null = null

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    private readonly pattern: () => DrumPattern,
  ) {}

  get playing() {
    return this.timer !== undefined
  }

  start() {
    if (this.playing) return
    this.out = this.context.createGain()
    this.out.connect(this.destination)
    this.cursor = { step: 0, time: this.context.currentTime + START_DELAY }
    this.queue = []
    this.lastStep = null
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    const out = this.out
    this.out = null
    this.queue = []
    if (out) {
      // I colpi già programmati nel futuro passano da `out`: staccandolo tacciono.
      out.gain.setTargetAtTime(0, this.context.currentTime, 0.005)
      setTimeout(() => out.disconnect(), 50)
    }
  }

  /** Il passo che si sta ascoltando ora (per il cursore della griglia), o null. */
  currentStep(): number | null {
    const now = this.context.currentTime
    let current: number | null = null
    while (this.queue.length && (this.queue[0]?.time ?? Infinity) <= now) {
      current = this.queue.shift()?.step ?? current
      this.lastStep = current
    }
    return current ?? this.lastStep
  }

  private tick() {
    const out = this.out
    if (!out) return
    const pattern = this.pattern()
    const { steps, cursor } = stepsUntil(pattern, this.cursor, this.context.currentTime + LOOKAHEAD)
    this.cursor = cursor
    for (const scheduled of steps) {
      for (const hit of scheduled.hits) playHit(this.context, out, hit, scheduled.time)
      this.queue.push(scheduled)
    }
    out.gain.value = pattern.master
  }
}
