import { SAMPLE_RATE } from '~/audio/constants'
import { defaultEq, type EqSpec } from '~/eq/spec'
import type { ParamDef } from '~/synth/spec'
import { dbToGain } from '~/utils/scale'

type Channels = Float32Array<ArrayBuffer>[]

/** Operazioni sui campioni. I tempi (secondi) di `trim` si riferiscono al clip sorgente. */
export type SampleOp =
  | { type: 'trim'; start: number; end: number }
  | { type: 'normalize'; peakDb: number }
  | { type: 'reverse' }
  | { type: 'mono' }
  | { type: 'gain'; db: number }
  | { type: 'fade'; fadeIn: number; fadeOut: number }
  | { type: 'speed'; rate: number }
  | { type: 'eq'; spec: EqSpec }

export type SampleOpType = SampleOp['type']

export const opLabels: Record<SampleOpType, string> = {
  trim: 'Taglia sulla regione',
  normalize: 'Normalizza',
  reverse: 'Inverti',
  mono: 'Mono',
  gain: 'Guadagno',
  fade: 'Dissolvenze',
  speed: 'Velocità',
  eq: 'Equalizzatore',
}

export const opParams = {
  trim: {},
  normalize: {
    peakDb: { label: 'Picco', unit: 'dB', min: -24, max: 0, step: 0.1, default: -0.2 },
  },
  reverse: {},
  mono: {},
  gain: {
    db: { label: 'Guadagno', unit: 'dB', min: -24, max: 24, step: 0.5, default: 0, bipolar: true },
  },
  fade: {
    fadeIn: { label: 'Fade in', unit: 's', min: 0, max: 10, step: 0.01, default: 0.01 },
    fadeOut: { label: 'Fade out', unit: 's', min: 0, max: 10, step: 0.01, default: 0.1 },
  },
  eq: {},
  speed: {
    rate: { label: 'Velocità', unit: '×', min: 0.25, max: 4, log: true, step: 0.01, default: 1 },
  },
} satisfies {
  // Taglio ed EQ non hanno manopole qui: il taglio usa la regione, l'EQ ha il suo editor.
  [T in SampleOpType]: T extends 'trim' | 'eq'
    ? Record<never, ParamDef>
    : Record<Exclude<keyof Extract<SampleOp, { type: T }>, 'type'>, ParamDef>
}

/** Un'operazione con i valori predefiniti (per `trim` servono start/end dalla regione). */
export function defaultOp(type: Exclude<SampleOpType, 'trim'>): SampleOp {
  if (type === 'eq') return { type: 'eq', spec: defaultEq() }
  const defs = opParams[type] as Record<string, ParamDef>
  return {
    type,
    ...Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.default])),
  } as SampleOp
}

/**
 * Applica la catena in ordine. Non modifica i canali in ingresso: il clip sorgente resta intatto.
 * Solo operazioni sincrone: per una catena con l'EQ si usa `applyChain`.
 */
export function applyOps(input: readonly Float32Array[], ops: readonly SampleOp[]): Channels {
  let channels: Channels = input.map((channel) => channel.slice())
  for (const op of ops) channels = applyOp(channels, op)
  return channels
}

function applyOp(channels: Channels, op: SampleOp): Channels {
  switch (op.type) {
    case 'trim': {
      const length = channels[0]?.length ?? 0
      const start = clampIndex(Math.round(op.start * SAMPLE_RATE), length)
      const end = clampIndex(Math.round(op.end * SAMPLE_RATE), length)
      const [from, to] = start <= end ? [start, end] : [end, start]
      return channels.map((channel) => channel.slice(from, Math.max(from + 1, to)))
    }

    case 'normalize': {
      let peak = 0
      for (const channel of channels) for (const s of channel) peak = Math.max(peak, Math.abs(s))
      return peak > 0 ? scale(channels, dbToGain(op.peakDb) / peak) : channels
    }

    case 'reverse':
      return channels.map((channel) => channel.slice().reverse())

    case 'mono': {
      if (channels.length < 2) return channels
      const length = channels[0]?.length ?? 0
      const mono = new Float32Array(length)
      for (const channel of channels) {
        for (let i = 0; i < length; i++)
          mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / channels.length
      }
      return [mono]
    }

    case 'gain':
      return scale(channels, dbToGain(op.db))

    case 'fade': {
      const length = channels[0]?.length ?? 0
      const total = op.fadeIn + op.fadeOut
      const duration = length / SAMPLE_RATE
      const factor = total > duration && total > 0 ? duration / total : 1
      const fadeIn = Math.round(op.fadeIn * factor * SAMPLE_RATE)
      const fadeOut = Math.round(op.fadeOut * factor * SAMPLE_RATE)
      return channels.map((channel) => {
        const out = channel.slice()
        for (let i = 0; i < fadeIn; i++) out[i] = (out[i] ?? 0) * (i / fadeIn)
        for (let i = 0; i < fadeOut; i++) {
          const index = length - 1 - i
          out[index] = (out[index] ?? 0) * (i / fadeOut)
        }
        return out
      })
    }

    case 'speed':
      return channels.map((channel) => varispeed(channel, op.rate))

    case 'eq':
      throw new Error("L'EQ passa da un OfflineAudioContext: usa applyChain")
  }
}

/**
 * Cambio di velocità "da nastro": più veloce = più corto e più acuto.
 * Ricampionamento con interpolazione lineare, deterministico.
 */
export function varispeed(channel: Float32Array, rate: number): Float32Array<ArrayBuffer> {
  const safe = rate > 0 ? rate : 1
  const length = Math.max(1, Math.round(channel.length / safe))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = i * safe
    const index = Math.floor(position)
    const frac = position - index
    const a = channel[index] ?? 0
    const b = channel[index + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

/** RMS lineare su tutti i canali (0 = silenzio). */
export function rmsLevel(channels: readonly Float32Array[]): number {
  let sum = 0
  let count = 0
  for (const channel of channels) {
    for (const s of channel) sum += s * s
    count += channel.length
  }
  return count ? Math.sqrt(sum / count) : 0
}

function scale(channels: Channels, factor: number): Channels {
  return channels.map((channel) => channel.map((s) => s * factor))
}

function clampIndex(index: number, length: number) {
  return Math.min(length, Math.max(0, index))
}

/**
 * Come `applyOps`, ma accetta anche l'EQ: quello si rende con il suo grafo audio
 * (lo stesso dell'ascolto), le altre operazioni restano funzioni pure.
 */
export async function applyChain(input: readonly Float32Array[], ops: readonly SampleOp[]) {
  const { renderEq } = await import('~/eq/graph')
  let channels: Channels = input.map((channel) => channel.slice())
  for (const op of ops) {
    channels =
      op.type === 'eq' ? ((await renderEq(channels, op.spec)) as Channels) : applyOp(channels, op)
  }
  return channels
}
