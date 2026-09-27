import type { Effect } from '~/synth/spec'
import { dbToGain } from '~/utils/scale'
import { createRandom } from './random'

export interface EffectNodes {
  input: AudioNode
  output: AudioNode
}

/** Seed fisso della risposta all'impulso: il riverbero suona sempre uguale, dal vivo e offline. */
const REVERB_SEED = 0x5eed

/**
 * Costruisce un effetto della catena. `when` e `duration` servono agli effetti che dipendono
 * dal tempo (tremolo, dissolvenze).
 */
export function buildEffect(
  context: BaseAudioContext,
  effect: Effect,
  when: number,
  duration: number,
): EffectNodes {
  switch (effect.type) {
    case 'gain': {
      const node = gain(context, dbToGain(effect.db))
      return { input: node, output: node }
    }

    case 'delay': {
      const input = context.createGain()
      const output = context.createGain()
      const delay = context.createDelay(2.5)
      delay.delayTime.value = effect.time
      const feedback = gain(context, effect.feedback)
      input.connect(gain(context, 1 - effect.mix)).connect(output)
      input.connect(delay).connect(gain(context, effect.mix)).connect(output)
      delay.connect(feedback).connect(delay)
      return { input, output }
    }

    case 'reverb': {
      const input = context.createGain()
      const output = context.createGain()
      const convolver = context.createConvolver()
      convolver.buffer = impulseResponse(context, effect.size, effect.damping)
      input.connect(gain(context, 1 - effect.mix)).connect(output)
      input.connect(convolver).connect(gain(context, effect.mix)).connect(output)
      return { input, output }
    }

    case 'softclip': {
      const shaper = context.createWaveShaper()
      shaper.curve = softclipCurve(effect.drive)
      shaper.oversample = '4x'
      return { input: shaper, output: shaper }
    }

    case 'bitcrush': {
      // Richiede `ensureWorklets(context)` prima della costruzione del grafo.
      const node = new AudioWorkletNode(context, 'sv-bitcrusher', {
        parameterData: { bits: effect.bits, downsample: effect.downsample },
      })
      return { input: node, output: node }
    }

    case 'tremolo': {
      const node = gain(context, 1 - effect.depth / 2)
      const lfo = context.createOscillator()
      lfo.frequency.value = effect.rate
      lfo.connect(gain(context, effect.depth / 2)).connect(node.gain)
      lfo.start(when)
      lfo.stop(when + duration)
      return { input: node, output: node }
    }

    case 'fade': {
      const node = context.createGain()
      const total = effect.fadeIn + effect.fadeOut
      const scale = total > duration && total > 0 ? duration / total : 1
      const fadeIn = effect.fadeIn * scale
      const fadeOut = effect.fadeOut * scale
      node.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, when)
      if (fadeIn > 0) node.gain.linearRampToValueAtTime(1, when + fadeIn)
      if (fadeOut > 0) {
        node.gain.setValueAtTime(1, when + duration - fadeOut)
        node.gain.linearRampToValueAtTime(0, when + duration)
      }
      return { input: node, output: node }
    }
  }
}

function gain(context: BaseAudioContext, value: number): GainNode {
  const node = context.createGain()
  node.gain.value = value
  return node
}

/** Curva di saturazione morbida, normalizzata: il picco resta a 1 qualunque sia il drive. */
export function softclipCurve(drive: number, points = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points)
  const norm = Math.tanh(drive)
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

/**
 * Risposta all'impulso sintetica: rumore con decadimento esponenziale (-60 dB a `size` secondi),
 * scurito da un passa-basso a un polo tanto più chiuso quanto più alto è `damping`.
 */
export function impulseResponse(context: BaseAudioContext, size: number, damping: number) {
  const length = Math.max(1, Math.round(size * context.sampleRate))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = new Float32Array(length)
  const random = createRandom(REVERB_SEED)
  const smoothing = 1 - Math.min(0.95, damping * 0.95)
  let low = 0
  for (let i = 0; i < length; i++) {
    const t = i / context.sampleRate
    low += smoothing * (random() * 2 - 1 - low)
    data[i] = low * Math.exp((-6.9 * t) / size)
  }
  buffer.copyToChannel(data, 0)
  return buffer
}
