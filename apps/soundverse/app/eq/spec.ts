import type { ParamDef } from '~/synth/spec'
import { highpass, highShelf, lowShelf, peaking, type Biquad } from './biquad'

export type EqTarget = 'stereo' | 'mid' | 'side'

interface Section {
  enabled: boolean
  /** In modalità mid/side: dove agisce la sezione. In stereo è ignorato. */
  applyTo: EqTarget
}

export interface EqSpec {
  mode: 'stereo' | 'midSide'
  hpf: Section & { freq: number }
  low: Section & { freq: LowFreq; boost: number; atten: number }
  lowMid: Section & { freq: number; peak: number; bandwidth: number }
  highMid: Section & { freq: number; peak: number; bandwidth: number }
  high: Section & {
    boostFreq: HighBoostFreq
    boost: number
    bandwidth: number
    attenFreq: HighAttenFreq
    atten: number
  }
  /** Saturazione morbida, 0..10 (0 = spenta). */
  warmth: number
  /** Volume finale, dB. */
  volume: number
}

export const lowFreqs = [20, 30, 60, 100] as const
export const highBoostFreqs = [3000, 4000, 5000, 8000, 10000, 12000, 16000] as const
export const highAttenFreqs = [5000, 10000, 20000] as const
type LowFreq = (typeof lowFreqs)[number]
type HighBoostFreq = (typeof highBoostFreqs)[number]
type HighAttenFreq = (typeof highAttenFreqs)[number]

/**
 * Taratura delle sezioni "a programma" (dB a fondo scala, 10) e della campana di attenuazione dei bassi.
 * L'attenuazione dei bassi è una campana larga sopra la frequenza scelta, non un secondo scaffale:
 * è così che boost e atten insieme scavano sopra e pompano sotto (il "trucco Pultec").
 */
export const LOW_BOOST_DB = 13.5
export const LOW_ATTEN_DB = 17.5
export const HIGH_BOOST_DB = 18
export const HIGH_ATTEN_DB = 16
export const ATTEN_SPREAD = 2.5
export const ATTEN_Q = 0.5
export const SHELF_SLOPE = 0.7

/** Da "banda" (0 stretta … 10 larga) al Q della campana. */
export const bandwidthToQ = (bandwidth: number) => 0.3 * Math.pow(4 / 0.3, (10 - bandwidth) / 10)

const knob = (
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  def: number,
  extra: Partial<ParamDef> = {},
): ParamDef => ({
  label,
  unit,
  min,
  max,
  step,
  default: def,
  ...extra,
})

export const eqParams = {
  hpfFreq: knob('HPF', 'Hz', 20, 500, 1, 30, { log: true }),
  boost: knob('Boost', '', 0, 10, 0.1, 0),
  atten: knob('Atten', '', 0, 10, 0.1, 0),
  lowMidFreq: knob('Freq', 'Hz', 60, 2000, 1, 400, { log: true }),
  highMidFreq: knob('Freq', 'Hz', 500, 8000, 1, 2500, { log: true }),
  peak: knob('Picco', 'dB', -10, 10, 0.1, 0, { bipolar: true }),
  bandwidth: knob('Banda', '', 0, 10, 0.1, 5),
  warmth: knob('Calore', '', 0, 10, 0.1, 0),
  volume: knob('Volume', 'dB', -12, 12, 0.1, 0, { bipolar: true }),
} satisfies Record<string, ParamDef>

const section = (enabled = true): Section => ({ enabled, applyTo: 'stereo' })

export function defaultEq(): EqSpec {
  return {
    mode: 'stereo',
    hpf: { ...section(false), freq: 30 },
    low: { ...section(), freq: 60, boost: 0, atten: 0 },
    lowMid: { ...section(), freq: 400, peak: 0, bandwidth: 5 },
    highMid: { ...section(), freq: 2500, peak: 0, bandwidth: 5 },
    high: { ...section(), boostFreq: 10000, boost: 0, bandwidth: 5, attenFreq: 20000, atten: 0 },
    warmth: 0,
    volume: 0,
  }
}

export interface EqPreset {
  name: string
  spec: () => EqSpec
}

export const eqPresets: EqPreset[] = [
  { name: 'Neutro', spec: defaultEq },
  {
    name: 'Corpo e aria',
    spec: () => {
      const eq = defaultEq()
      eq.low = { ...eq.low, freq: 60, boost: 5, atten: 3 }
      eq.high = { ...eq.high, boostFreq: 12000, boost: 3, bandwidth: 7 }
      return eq
    },
  },
  {
    name: 'Alleggerisci',
    spec: () => {
      const eq = defaultEq()
      eq.hpf = { ...eq.hpf, enabled: true, freq: 80 }
      eq.lowMid = { ...eq.lowMid, freq: 300, peak: -4, bandwidth: 6 }
      return eq
    },
  },
  {
    name: 'Voce avanti',
    spec: () => {
      const eq = defaultEq()
      eq.hpf = { ...eq.hpf, enabled: true, freq: 100 }
      eq.lowMid = { ...eq.lowMid, freq: 350, peak: -3, bandwidth: 5 }
      eq.highMid = { ...eq.highMid, freq: 3000, peak: 3, bandwidth: 4 }
      eq.high = { ...eq.high, boostFreq: 10000, boost: 2 }
      return eq
    },
  },
  {
    name: 'Allarga',
    spec: () => {
      const eq = defaultEq()
      eq.mode = 'midSide'
      eq.high = { ...eq.high, applyTo: 'side', boostFreq: 8000, boost: 4, bandwidth: 8 }
      eq.lowMid = { ...eq.lowMid, applyTo: 'side', freq: 250, peak: -4 }
      return eq
    },
  },
]

export interface PlacedFilter {
  /** Dove agisce: sui due canali (stereo o L/R), solo sul mid o solo sul side. */
  target: EqTarget
  filter: Biquad
}

/**
 * La catena di filtri di una spec, in ordine: HPF, bassi, medio-bassi, medio-alti, alti.
 * Pura: la usano il grafo audio, il disegno della curva e i test.
 */
export function eqFilters(spec: EqSpec, sampleRate: number): PlacedFilter[] {
  const out: PlacedFilter[] = []
  const place = (s: Section, filter: Biquad) =>
    out.push({ target: spec.mode === 'midSide' ? s.applyTo : 'stereo', filter })

  if (spec.hpf.enabled) place(spec.hpf, highpass(spec.hpf.freq, Math.SQRT1_2, sampleRate))
  if (spec.low.enabled) {
    if (spec.low.boost > 0) {
      place(
        spec.low,
        lowShelf(spec.low.freq, (LOW_BOOST_DB * spec.low.boost) / 10, SHELF_SLOPE, sampleRate),
      )
    }
    if (spec.low.atten > 0) {
      place(
        spec.low,
        peaking(
          spec.low.freq * ATTEN_SPREAD,
          (-LOW_ATTEN_DB * spec.low.atten) / 10,
          ATTEN_Q,
          sampleRate,
        ),
      )
    }
  }
  for (const bell of [spec.lowMid, spec.highMid]) {
    if (bell.enabled && bell.peak !== 0) {
      place(bell, peaking(bell.freq, bell.peak, bandwidthToQ(bell.bandwidth), sampleRate))
    }
  }
  if (spec.high.enabled) {
    if (spec.high.boost > 0) {
      const gain = (HIGH_BOOST_DB * spec.high.boost) / 10
      place(
        spec.high,
        peaking(spec.high.boostFreq, gain, bandwidthToQ(spec.high.bandwidth), sampleRate),
      )
    }
    if (spec.high.atten > 0) {
      const gain = (-HIGH_ATTEN_DB * spec.high.atten) / 10
      place(spec.high, highShelf(spec.high.attenFreq, gain, SHELF_SLOPE, sampleRate))
    }
  }
  return out
}

/** True se la spec agisce sul canale Side: su un clip mono il Side è vuoto e non fa niente. */
export const usesSide = (spec: EqSpec) =>
  spec.mode === 'midSide' &&
  [spec.hpf, spec.low, spec.lowMid, spec.highMid, spec.high].some(
    (s) => s.enabled && s.applyTo === 'side',
  )
