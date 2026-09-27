import type { Voice } from '~/audio/render'
import { buildSynth } from '~/synth/graph'
import type { ParamDef, SynthSpec } from '~/synth/spec'
import { MAX_VOICE_DURATION, voiceSpecs, type DrumVoiceId } from './voices'

export const STEPS_PER_BAR = 16

/** Velocità di un passo: 0 = spento. */
export const VELOCITY_ON = 0.7
export const VELOCITY_ACCENT = 1

export interface DrumTrack {
  voice: DrumVoiceId
  /** Un valore per passo di tutte le battute: 0 spento, altrimenti velocità (0..1). */
  steps: number[]
  /** Livello lineare della traccia, 0..1. */
  gain: number
  /** Semitoni. */
  tune: number
  muted: boolean
}

export interface DrumPattern {
  bpm: number
  bars: number
  /** 0..1: ritarda i passi dispari fino a un terzo di passo (terzina). */
  swing: number
  tracks: DrumTrack[]
  master: number
}

export const drumParams = {
  bpm: { label: 'BPM', unit: '', min: 60, max: 200, step: 1, default: 120 },
  swing: { label: 'Swing', unit: '', min: 0, max: 1, step: 0.01, default: 0 },
  master: { label: 'Master', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  gain: { label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  tune: { label: 'Tono', unit: 'st', min: -12, max: 12, step: 1, default: 0, bipolar: true },
} satisfies Record<string, ParamDef>

export const MAX_BARS = 8

/** Secondi di un sedicesimo. */
export const stepDuration = (bpm: number) => 60 / bpm / 4

export const totalSteps = (pattern: Pick<DrumPattern, 'bars'>) => pattern.bars * STEPS_PER_BAR

/** Durata esatta del pattern: il loop non si allunga con le code dei suoni. */
export const patternLength = (pattern: Pick<DrumPattern, 'bpm' | 'bars'>) =>
  totalSteps(pattern) * stepDuration(pattern.bpm)

/** Ritardo dello swing per un passo: solo i passi dispari, fino a un terzo di passo. */
export const swingOffset = (step: number, pattern: Pick<DrumPattern, 'bpm' | 'swing'>) =>
  step % 2 === 1 ? (pattern.swing * stepDuration(pattern.bpm)) / 3 : 0

/** Istante di un passo dall'inizio del loop, swing compreso. È l'unica fonte dei tempi. */
export const stepTime = (step: number, pattern: Pick<DrumPattern, 'bpm' | 'swing'>) =>
  step * stepDuration(pattern.bpm) + swingOffset(step, pattern)

/** Click su un passo: spento → acceso → accento → spento. */
export function cycleVelocity(velocity: number): number {
  if (velocity <= 0) return VELOCITY_ON
  if (velocity < VELOCITY_ACCENT) return VELOCITY_ACCENT
  return 0
}

export function emptySteps(bars: number) {
  return Array.from<number>({ length: bars * STEPS_PER_BAR }).fill(0)
}

export function newTrack(voice: DrumVoiceId, bars: number): DrumTrack {
  return { voice, steps: emptySteps(bars), gain: drumParams.gain.default, tune: 0, muted: false }
}

/** Accende i passi indicati (per costruire i pattern di esempio). */
function withSteps(track: DrumTrack, on: number[], accents: number[] = []): DrumTrack {
  for (const i of on) track.steps[i] = VELOCITY_ON
  for (const i of accents) track.steps[i] = VELOCITY_ACCENT
  return track
}

export function defaultPattern(): DrumPattern {
  return {
    bpm: drumParams.bpm.default,
    bars: 1,
    swing: 0,
    master: drumParams.master.default,
    tracks: [
      withSteps(newTrack('kick', 1), [], [0, 4, 8, 12]),
      withSteps(newTrack('snare', 1), [4, 12]),
      withSteps(newTrack('hat', 1), [0, 2, 4, 6, 8, 10, 12, 14]),
      newTrack('clap', 1),
    ],
  }
}

/** Cambia il numero di battute: le battute nuove copiano la prima, quelle tolte si scartano. */
export function resizeSteps(steps: number[], bars: number): number[] {
  const length = bars * STEPS_PER_BAR
  const firstBar = steps.slice(0, STEPS_PER_BAR)
  return Array.from({ length }, (_, i) => steps[i] ?? firstBar[i % STEPS_PER_BAR] ?? 0)
}

/** La spec del synth per un colpo: voce, accordatura, volume della traccia e velocità. */
export function hitSpec(track: DrumTrack, velocity: number): SynthSpec {
  const base = voiceSpecs[track.voice]
  const ratio = Math.pow(2, track.tune / 12)
  return {
    ...base,
    oscillators: base.oscillators.map((osc) => ({ ...osc, frequency: osc.frequency * ratio })),
    filter: base.filter && { ...base.filter, cutoff: base.filter.cutoff * ratio },
    master: base.master * track.gain * velocity,
  }
}

export interface Hit {
  track: DrumTrack
  step: number
  velocity: number
}

/** I colpi di un passo, esclusi le tracce mute e i passi spenti. */
export function hitsAt(pattern: DrumPattern, step: number): Hit[] {
  return pattern.tracks.flatMap((track) => {
    const velocity = track.steps[step] ?? 0
    return !track.muted && velocity > 0 ? [{ track, step, velocity }] : []
  })
}

/** Suona un colpo a `when`: usato sia dal sequencer live sia dal render. */
export function playHit(context: BaseAudioContext, out: AudioNode, hit: Hit, when: number) {
  buildSynth(hitSpec(hit.track, hit.velocity))(context, out, when)
}

/**
 * Il pattern come Voice per il render offline: si rende un giro più la coda più lunga,
 * poi `foldTail` riporta la coda sull'inizio (come succede dal vivo quando il loop riparte).
 */
export function patternVoice(pattern: DrumPattern): Voice {
  const length = patternLength(pattern)
  return {
    duration: length + MAX_VOICE_DURATION,
    channels: 1,
    build(context, out, when) {
      const master = context.createGain()
      master.gain.value = pattern.master
      master.connect(out)
      for (let step = 0; step < totalSteps(pattern); step++) {
        for (const hit of hitsAt(pattern, step)) {
          playHit(context, master, hit, when + stepTime(step, pattern))
        }
      }
    },
  }
}

/** Somma la parte oltre `length` all'inizio: il clip dura esattamente il loop e si ripete senza stacchi. */
export function foldTail(channel: Float32Array, length: number): Float32Array<ArrayBuffer> {
  const out = channel.slice(0, length)
  for (let i = length; i < channel.length; i++) {
    const target = (i - length) % length
    out[target] = (out[target] ?? 0) + (channel[i] ?? 0)
  }
  return out
}
