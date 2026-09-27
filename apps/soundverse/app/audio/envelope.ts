export interface Envelope {
  /** Secondi. */
  attack: number
  decay: number
  /** Livello di sustain, 0..1. */
  sustain: number
  release: number
}

export interface EnvelopeSchedule {
  attackEnd: number
  decayEnd: number
  releaseStart: number
  end: number
  sustain: number
}

/**
 * Calcola gli istanti dell'inviluppo dentro una durata fissa: il release finisce esattamente a `duration`.
 * Se attack + decay + release non ci stanno, si riducono in proporzione.
 */
export function envelopeSchedule(env: Envelope, duration: number): EnvelopeSchedule {
  const attack = Math.max(0, env.attack)
  const decay = Math.max(0, env.decay)
  const release = Math.max(0, env.release)
  const total = attack + decay + release
  const scale = total > duration && total > 0 ? duration / total : 1

  const attackEnd = attack * scale
  const decayEnd = attackEnd + decay * scale
  const releaseStart = Math.max(decayEnd, duration - release * scale)
  return {
    attackEnd,
    decayEnd,
    releaseStart,
    end: duration,
    sustain: Math.min(1, Math.max(0, env.sustain)),
  }
}

/** Minimo livello usabile dalle rampe esponenziali, che non possono arrivare a zero. */
const FLOOR = 0.0001

/** Programma l'inviluppo su un AudioParam a partire da `when`. */
export function applyEnvelope(param: AudioParam, schedule: EnvelopeSchedule, when: number) {
  const sustain = Math.max(FLOOR, schedule.sustain)
  param.cancelScheduledValues(when)
  param.setValueAtTime(FLOOR, when)
  if (schedule.attackEnd > 0) param.linearRampToValueAtTime(1, when + schedule.attackEnd)
  else param.setValueAtTime(1, when)
  if (schedule.decayEnd > schedule.attackEnd) {
    param.exponentialRampToValueAtTime(sustain, when + schedule.decayEnd)
  } else {
    param.setValueAtTime(sustain, when + schedule.decayEnd)
  }
  param.setValueAtTime(sustain, when + schedule.releaseStart)
  param.exponentialRampToValueAtTime(FLOOR, when + schedule.end)
}
