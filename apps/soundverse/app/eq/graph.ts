import { SAMPLE_RATE } from '~/audio/constants'
import { bufferToChannels } from '~/audio/decode'
import { dbToGain } from '~/utils/scale'
import type { Biquad } from './biquad'
import { eqFilters, type EqSpec, type EqTarget } from './spec'

export interface EqNodes {
  input: AudioNode
  output: AudioNode
}

/** Un nodo mono "vero": niente upmix o downmix automatici (servono somme e differenze esatte per il M/S). */
function mono<T extends AudioNode>(node: T): T {
  node.channelCount = 1
  node.channelCountMode = 'explicit'
  node.channelInterpretation = 'discrete'
  return node
}

function gain(context: BaseAudioContext, value: number, isMono = false) {
  const node = context.createGain()
  node.gain.value = value
  return isMono ? mono(node) : node
}

function iir(context: BaseAudioContext, { b, a }: Biquad) {
  return context.createIIRFilter(b, a)
}

/** Collega in serie i filtri indicati; restituisce l'ultimo nodo. */
function chain(context: BaseAudioContext, from: AudioNode, filters: Biquad[]): AudioNode {
  let node = from
  for (const filter of filters) node = node.connect(iir(context, filter))
  return node
}

/**
 * Curva del "calore": saturazione morbida leggermente asimmetrica (armoniche pari),
 * normalizzata sulla pendenza nell'origine. Così il guadagno per i segnali deboli resta 1:
 * normalizzare per tanh(drive), come in Bragi, alzava il volume di quasi 12 dB.
 */
export function warmthCurve(warmth: number, points = 2048): Float32Array<ArrayBuffer> {
  const drive = 1 + warmth * 0.4
  const bias = (0.05 * warmth) / 10
  const slope = drive * (1 - Math.tanh(drive * bias) ** 2)
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1
    curve[i] = (Math.tanh(drive * (x + bias)) - Math.tanh(drive * bias)) / slope
  }
  return curve
}

/**
 * Il grafo dell'EQ, uguale per l'ascolto e per il render.
 * Stereo: i filtri agiscono su entrambi i canali. Mid/side: si codifica in M = (L+R)/2 e S = (L−R)/2,
 * ogni sezione agisce dove è assegnata, poi si torna a L = M+S, R = M−S.
 */
export function eqGraph(context: BaseAudioContext, spec: EqSpec): EqNodes {
  const placed = eqFilters(spec, context.sampleRate)
  const on = (targets: EqTarget[]) =>
    placed.filter((p) => targets.includes(p.target)).map((p) => p.filter)

  // Ingresso sempre stereo: un clip mono diventa L = R (e il Side resta vuoto).
  const input = context.createGain()
  input.channelCount = 2
  input.channelCountMode = 'explicit'
  input.channelInterpretation = 'speakers'

  let processed: AudioNode
  if (spec.mode === 'stereo') {
    processed = chain(context, input, on(['stereo']))
  } else {
    const split = context.createChannelSplitter(2)
    input.connect(split)
    const mid = gain(context, 1, true)
    const side = gain(context, 1, true)
    split.connect(gain(context, 0.5, true), 0).connect(mid)
    split.connect(gain(context, 0.5, true), 1).connect(mid)
    split.connect(gain(context, 0.5, true), 0).connect(side)
    split.connect(gain(context, -0.5, true), 1).connect(side)

    const midOut = chain(context, mid, on(['stereo', 'mid']))
    const sideOut = chain(context, side, on(['stereo', 'side']))

    const left = gain(context, 1, true)
    const right = gain(context, 1, true)
    midOut.connect(left)
    sideOut.connect(left)
    midOut.connect(right)
    sideOut.connect(gain(context, -1, true)).connect(right)
    const merge = context.createChannelMerger(2)
    left.connect(merge, 0, 0)
    right.connect(merge, 0, 1)
    processed = merge
  }

  if (spec.warmth > 0) {
    const shaper = context.createWaveShaper()
    shaper.curve = warmthCurve(spec.warmth)
    // Niente oversampling: aggiungerebbe latenza (vedi CLAUDE.md).
    shaper.oversample = 'none'
    processed = processed.connect(shaper)
  }

  const output = gain(context, dbToGain(spec.volume))
  processed.connect(output)
  return { input, output }
}

/** Applica l'EQ a dei campioni, con lo stesso grafo dell'ascolto. Il risultato è stereo. */
export async function renderEq(channels: readonly Float32Array[], spec: EqSpec) {
  const length = channels[0]?.length ?? 0
  const context = new OfflineAudioContext(2, Math.max(1, length), SAMPLE_RATE)
  const buffer = context.createBuffer(channels.length, Math.max(1, length), SAMPLE_RATE)
  channels.forEach((channel, i) => buffer.copyToChannel(Float32Array.from(channel), i))
  const source = context.createBufferSource()
  source.buffer = buffer
  const eq = eqGraph(context, spec)
  source.connect(eq.input)
  eq.output.connect(context.destination)
  source.start(0)
  const rendered = bufferToChannels(await context.startRendering())
  // In stereo un clip mono resta mono (i due canali sono identici); in mid/side diventa stereo.
  return channels.length === 1 && spec.mode === 'stereo' ? rendered.slice(0, 1) : rendered
}
