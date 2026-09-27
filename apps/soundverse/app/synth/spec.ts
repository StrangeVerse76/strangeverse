import type { Envelope } from '~/audio/envelope'
import type { NoiseColor } from '~/audio/noise'
import type { Range } from '~/utils/scale'

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle'
export type FilterType = 'lowpass' | 'highpass' | 'bandpass'

export interface Oscillator {
  waveform: Waveform
  /** Hz. */
  frequency: number
  /** Livello lineare, 0..1. */
  gain: number
  /** Centesimi di semitono. */
  detune: number
}

export interface Noise {
  color: NoiseColor
  gain: number
  seed: number
}

export interface Filter {
  type: FilterType
  /** Hz. */
  cutoff: number
  /** Q del BiquadFilterNode (per lowpass/highpass è espresso in dB, come da specifica Web Audio). */
  resonance: number
}

export type Effect =
  | { type: 'gain'; db: number }
  | { type: 'delay'; time: number; feedback: number; mix: number }
  | { type: 'reverb'; size: number; damping: number; mix: number }
  | { type: 'softclip'; drive: number }
  | { type: 'bitcrush'; bits: number; downsample: number }
  | { type: 'tremolo'; rate: number; depth: number }
  | { type: 'fade'; fadeIn: number; fadeOut: number }

export type EffectType = Effect['type']

export interface SynthSpec {
  /** Secondi: il suono dura esattamente così, release compreso. */
  duration: number
  oscillators: Oscillator[]
  noise: Noise | null
  envelope: Envelope
  filter: Filter | null
  /** Catena ordinata: il primo effetto riceve il segnale per primo. */
  effects: Effect[]
  /** Livello lineare finale, 0..1. */
  master: number
}

export interface ParamDef extends Range {
  label: string
  unit: string
  step: number
  /** Valore del doppio click (reset). */
  default: number
  bipolar?: boolean
}

/** Limiti e unità di ogni parametro: gli stessi per l'interfaccia e per `normalizeSpec`. */
export const params = {
  duration: { label: 'Durata', unit: 's', min: 0.05, max: 30, log: true, step: 0.01, default: 1 },
  master: { label: 'Master', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  frequency: { label: 'Freq', unit: 'Hz', min: 20, max: 8000, log: true, step: 0.1, default: 220 },
  oscGain: { label: 'Livello', unit: '', min: 0, max: 1, step: 0.01, default: 0.5 },
  detune: {
    label: 'Detune',
    unit: 'ct',
    min: -1200,
    max: 1200,
    step: 1,
    default: 0,
    bipolar: true,
  },
  noiseGain: { label: 'Livello', unit: '', min: 0, max: 1, step: 0.01, default: 0.3 },
  attack: { label: 'Attack', unit: 's', min: 0, max: 10, step: 0.001, default: 0.01 },
  decay: { label: 'Decay', unit: 's', min: 0, max: 10, step: 0.001, default: 0.2 },
  sustain: { label: 'Sustain', unit: '', min: 0, max: 1, step: 0.01, default: 0.7 },
  release: { label: 'Release', unit: 's', min: 0, max: 10, step: 0.001, default: 0.3 },
  cutoff: { label: 'Cutoff', unit: 'Hz', min: 20, max: 18000, log: true, step: 1, default: 2000 },
  resonance: { label: 'Risonanza', unit: '', min: 0.1, max: 12, step: 0.1, default: 0.7 },
} satisfies Record<string, ParamDef>

export const effectParams = {
  gain: {
    db: { label: 'Guadagno', unit: 'dB', min: -24, max: 12, step: 0.5, default: 0, bipolar: true },
  },
  delay: {
    time: { label: 'Tempo', unit: 's', min: 0.01, max: 2, log: true, step: 0.01, default: 0.25 },
    feedback: { label: 'Feedback', unit: '', min: 0, max: 0.95, step: 0.01, default: 0.35 },
    mix: { label: 'Mix', unit: '', min: 0, max: 1, step: 0.01, default: 0.3 },
  },
  reverb: {
    size: { label: 'Coda', unit: 's', min: 0.1, max: 6, log: true, step: 0.05, default: 1.5 },
    damping: { label: 'Smorzamento', unit: '', min: 0, max: 1, step: 0.01, default: 0.5 },
    mix: { label: 'Mix', unit: '', min: 0, max: 1, step: 0.01, default: 0.3 },
  },
  softclip: {
    drive: { label: 'Drive', unit: '', min: 1, max: 20, log: true, step: 0.1, default: 3 },
  },
  bitcrush: {
    bits: { label: 'Bit', unit: '', min: 1, max: 16, step: 1, default: 8 },
    downsample: { label: 'Riduzione', unit: '×', min: 1, max: 32, step: 1, default: 4 },
  },
  tremolo: {
    rate: { label: 'Velocità', unit: 'Hz', min: 0.1, max: 30, log: true, step: 0.1, default: 5 },
    depth: { label: 'Profondità', unit: '', min: 0, max: 1, step: 0.01, default: 0.5 },
  },
  fade: {
    fadeIn: { label: 'Fade in', unit: 's', min: 0, max: 10, step: 0.01, default: 0 },
    fadeOut: { label: 'Fade out', unit: 's', min: 0, max: 10, step: 0.01, default: 0.2 },
  },
} satisfies {
  [T in EffectType]: Record<Exclude<keyof Extract<Effect, { type: T }>, 'type'>, ParamDef>
}

export const effectLabels: Record<EffectType, string> = {
  gain: 'Guadagno',
  delay: 'Delay',
  reverb: 'Riverbero',
  softclip: 'Saturazione',
  bitcrush: 'Bitcrush',
  tremolo: 'Tremolo',
  fade: 'Dissolvenza',
}

export const waveformLabels: Record<Waveform, string> = {
  sine: 'Sinusoide',
  square: 'Quadra',
  sawtooth: 'Dente di sega',
  triangle: 'Triangolo',
}

export const filterLabels: Record<FilterType, string> = {
  lowpass: 'Passa-basso',
  highpass: 'Passa-alto',
  bandpass: 'Passa-banda',
}

export const noiseLabels: Record<NoiseColor, string> = {
  white: 'Bianco',
  pink: 'Rosa',
  brown: 'Marrone',
}

export function defaultEffect(type: EffectType): Effect {
  const defs = effectParams[type] as Record<string, ParamDef>
  const values = Object.fromEntries(Object.entries(defs).map(([key, def]) => [key, def.default]))
  return { type, ...values } as Effect
}

export function defaultOscillator(): Oscillator {
  return {
    waveform: 'sine',
    frequency: params.frequency.default,
    gain: params.oscGain.default,
    detune: 0,
  }
}

export function defaultSpec(): SynthSpec {
  return {
    duration: params.duration.default,
    oscillators: [defaultOscillator()],
    noise: null,
    envelope: {
      attack: params.attack.default,
      decay: params.decay.default,
      sustain: params.sustain.default,
      release: params.release.default,
    },
    filter: null,
    effects: [],
    master: params.master.default,
  }
}

const clampTo = (value: number, def: ParamDef) =>
  Math.min(def.max, Math.max(def.min, Number.isFinite(value) ? value : def.default))

/** Riporta ogni valore nei suoi limiti: la spec che arriva al grafo è sempre valida. */
export function normalizeSpec(spec: SynthSpec): SynthSpec {
  return {
    duration: clampTo(spec.duration, params.duration),
    master: clampTo(spec.master, params.master),
    oscillators: spec.oscillators.map((osc) => ({
      waveform: osc.waveform,
      frequency: clampTo(osc.frequency, params.frequency),
      gain: clampTo(osc.gain, params.oscGain),
      detune: clampTo(osc.detune, params.detune),
    })),
    noise: spec.noise && {
      color: spec.noise.color,
      gain: clampTo(spec.noise.gain, params.noiseGain),
      seed: Math.floor(Math.abs(spec.noise.seed)) || 0,
    },
    envelope: {
      attack: clampTo(spec.envelope.attack, params.attack),
      decay: clampTo(spec.envelope.decay, params.decay),
      sustain: clampTo(spec.envelope.sustain, params.sustain),
      release: clampTo(spec.envelope.release, params.release),
    },
    filter: spec.filter && {
      type: spec.filter.type,
      cutoff: clampTo(spec.filter.cutoff, params.cutoff),
      resonance: clampTo(spec.filter.resonance, params.resonance),
    },
    effects: spec.effects.map((effect) => {
      const defs = effectParams[effect.type] as Record<string, ParamDef>
      const values = effect as unknown as Record<string, number>
      const clamped = Object.fromEntries(
        Object.entries(defs).map(([key, def]) => [key, clampTo(values[key] ?? def.default, def)]),
      )
      return { type: effect.type, ...clamped } as Effect
    }),
  }
}

export interface Preset {
  name: string
  spec: () => SynthSpec
}

export const presets: Preset[] = [
  { name: 'Tono puro', spec: defaultSpec },
  {
    name: 'Basso',
    spec: () => ({
      ...defaultSpec(),
      duration: 0.8,
      oscillators: [
        { waveform: 'sawtooth', frequency: 55, gain: 0.6, detune: 0 },
        { waveform: 'square', frequency: 55, gain: 0.3, detune: -1200 },
      ],
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
      filter: { type: 'lowpass', cutoff: 600, resonance: 4 },
      effects: [{ type: 'softclip', drive: 2 }],
    }),
  },
  {
    name: 'Pad',
    spec: () => ({
      ...defaultSpec(),
      duration: 4,
      oscillators: [
        { waveform: 'sawtooth', frequency: 220, gain: 0.35, detune: -8 },
        { waveform: 'sawtooth', frequency: 220, gain: 0.35, detune: 8 },
        { waveform: 'triangle', frequency: 330, gain: 0.25, detune: 0 },
      ],
      envelope: { attack: 1.2, decay: 0.8, sustain: 0.7, release: 1.5 },
      filter: { type: 'lowpass', cutoff: 1800, resonance: 1 },
      effects: [{ type: 'reverb', size: 3, damping: 0.4, mix: 0.45 }],
    }),
  },
  {
    name: 'Colpo di rumore',
    spec: () => ({
      ...defaultSpec(),
      duration: 0.4,
      oscillators: [],
      noise: { color: 'white', gain: 0.8, seed: 1 },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.2 },
      filter: { type: 'highpass', cutoff: 3000, resonance: 0.7 },
      effects: [],
    }),
  },
]
