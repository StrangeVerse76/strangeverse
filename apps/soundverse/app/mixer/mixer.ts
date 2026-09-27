import { impulseResponse } from '~/audio/effects'
import { eqGraph } from '~/eq/graph'
import type { EqSpec } from '~/eq/spec'
import type { ParamDef } from '~/synth/spec'

/** Le quattro mandate, nell'ordine dei livelli `sends`. */
export const SENDS = ['Riverbero', 'Delay', 'Chorus', 'Flanger'] as const
export const SEND_COUNT = SENDS.length

/** Pan, solo, EQ e mandate di un canale (il volume e il muto restano dove erano). */
export interface ChannelMix {
  /** −1 (sinistra) … 1 (destra). */
  pan: number
  solo: boolean
  eq: EqSpec | null
  /** Livello di ogni mandata, 0..1, post-fader. */
  sends: number[]
}

export interface Returns {
  /** Livello di ritorno di ogni effetto, 0..1. */
  levels: number[]
  reverbSize: number
  delayTime: number
  delayFeedback: number
}

export const mixParams = {
  pan: { label: 'Pan', unit: '', min: -1, max: 1, step: 0.01, default: 0, bipolar: true },
  send: { label: 'Mandata', unit: '', min: 0, max: 1, step: 0.01, default: 0 },
  level: { label: 'Ritorno', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  reverbSize: { label: 'Coda', unit: 's', min: 0.2, max: 6, log: true, step: 0.05, default: 2 },
  delayTime: {
    label: 'Tempo',
    unit: 's',
    min: 0.02,
    max: 1.5,
    log: true,
    step: 0.01,
    default: 0.375,
  },
  delayFeedback: { label: 'Feedback', unit: '', min: 0, max: 0.9, step: 0.01, default: 0.35 },
} satisfies Record<string, ParamDef>

export const defaultMix = (): ChannelMix => ({ pan: 0, solo: false, eq: null, sends: [0, 0, 0, 0] })

export const defaultReturns = (): Returns => ({
  levels: [0.8, 0.8, 0.8, 0.8],
  reverbSize: mixParams.reverbSize.default,
  delayTime: mixParams.delayTime.default,
  delayFeedback: mixParams.delayFeedback.default,
})

/** Il mix di un canale con i valori mancanti riempiti (i dati salvati prima non li hanno). */
export const mixOf = (partial: Partial<ChannelMix> | undefined): ChannelMix => ({
  ...defaultMix(),
  ...partial,
  sends: Array.from({ length: SEND_COUNT }, (_, i) => partial?.sends?.[i] ?? 0),
})

/** Guadagno effettivo di un canale: zero se muto, o se c'è un solo altrove e questo non lo è. */
export function effectiveGain(gain: number, muted: boolean, solo: boolean, anySolo: boolean) {
  return muted || (anySolo && !solo) ? 0 : gain
}

export interface ReturnNodes {
  /** Ingressi delle mandate, in ordine. */
  inputs: AudioNode[]
  levels: GainNode[]
  delay: DelayNode
  delayFeedback: GainNode
  /** Oscillatori di modulazione (chorus, flanger): vanno fermati a fine sessione. */
  lfos: OscillatorNode[]
}

function gain(context: BaseAudioContext, value: number) {
  const node = context.createGain()
  node.gain.value = value
  return node
}

/** Una linea di ritardo modulata (chorus e flanger). */
function modulated(
  context: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  base: number,
  depth: number,
  rate: number,
  feedback: number,
  when: number,
  lfos: OscillatorNode[],
) {
  const delay = context.createDelay(0.1)
  delay.delayTime.value = base
  const lfo = context.createOscillator()
  lfo.frequency.value = rate
  lfo.connect(gain(context, depth)).connect(delay.delayTime)
  lfo.start(when)
  lfos.push(lfo)
  input.connect(delay).connect(output)
  if (feedback > 0) delay.connect(gain(context, feedback)).connect(delay)
}

/** I quattro ritorni effetti, collegati a `out`. Suonano solo il segnale "bagnato". */
export function buildReturns(
  context: BaseAudioContext,
  out: AudioNode,
  returns: Returns,
  when: number,
): ReturnNodes {
  const lfos: OscillatorNode[] = []
  const inputs = SENDS.map(() => context.createGain())
  const levels = SENDS.map((_, i) => gain(context, returns.levels[i] ?? 0.8))
  levels.forEach((level) => level.connect(out))
  const [reverbIn, delayIn, chorusIn, flangerIn] = inputs as [
    GainNode,
    GainNode,
    GainNode,
    GainNode,
  ]
  const [reverbOut, delayOut, chorusOut, flangerOut] = levels as [
    GainNode,
    GainNode,
    GainNode,
    GainNode,
  ]

  const convolver = context.createConvolver()
  convolver.buffer = impulseResponse(context, returns.reverbSize, 0.4)
  reverbIn.connect(convolver).connect(reverbOut)

  const delay = context.createDelay(2)
  delay.delayTime.value = returns.delayTime
  const delayFeedback = gain(context, returns.delayFeedback)
  delayIn.connect(delay).connect(delayOut)
  delay.connect(delayFeedback).connect(delay)

  modulated(context, chorusIn, chorusOut, 0.025, 0.004, 0.8, 0, when, lfos)
  modulated(context, flangerIn, flangerOut, 0.003, 0.0025, 0.25, 0.5, when, lfos)

  return { inputs, levels, delay, delayFeedback, lfos }
}

export interface StripNodes {
  panner: StereoPannerNode
  sends: GainNode[]
}

/**
 * La striscia di un canale: ingresso → pan → EQ (se c'è) → uscita, e dopo il pan/EQ le mandate
 * (post-fader: il volume del canale sta prima, nell'ingresso).
 */
export function buildStrip(
  context: BaseAudioContext,
  input: AudioNode,
  out: AudioNode,
  mix: ChannelMix,
  returns: ReturnNodes,
): StripNodes {
  const panner = context.createStereoPanner()
  panner.pan.value = mix.pan
  input.connect(panner)
  let tail: AudioNode = panner
  if (mix.eq) {
    const eq = eqGraph(context, mix.eq)
    panner.connect(eq.input)
    tail = eq.output
  }
  tail.connect(out)
  const sends = returns.inputs.map((target, i) => {
    const send = gain(context, mix.sends[i] ?? 0)
    tail.connect(send).connect(target)
    return send
  })
  return { panner, sends }
}

/** Aggiorna dal vivo pan e mandate di una striscia (l'EQ richiede di ricostruire il grafo). */
export function updateStrip(strip: StripNodes, mix: ChannelMix, now: number) {
  strip.panner.pan.setTargetAtTime(mix.pan, now, 0.01)
  strip.sends.forEach((send, i) => send.gain.setTargetAtTime(mix.sends[i] ?? 0, now, 0.01))
}

export function updateReturns(nodes: ReturnNodes, returns: Returns, now: number) {
  nodes.levels.forEach((level, i) => level.gain.setTargetAtTime(returns.levels[i] ?? 0, now, 0.01))
  nodes.delay.delayTime.setTargetAtTime(returns.delayTime, now, 0.05)
  nodes.delayFeedback.gain.setTargetAtTime(returns.delayFeedback, now, 0.01)
}
