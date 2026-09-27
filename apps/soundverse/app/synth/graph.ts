import { buildEffect } from '~/audio/effects'
import { applyEnvelope, envelopeSchedule } from '~/audio/envelope'
import { generateNoise } from '~/audio/noise'
import type { GraphBuilder, Voice } from '~/audio/render'
import { ensureWorklets } from '~/audio/worklets'
import { normalizeSpec, type Noise, type SynthSpec } from './spec'

/**
 * Il grafo del synth:
 * oscillatori + rumore → inviluppo → filtro → effetti (in ordine) → master → out.
 */
export function buildSynth(input: SynthSpec): GraphBuilder {
  const spec = normalizeSpec(input)
  return (context, out, when) => {
    const { duration } = spec
    const sources = context.createGain()

    for (const osc of spec.oscillators) {
      const node = context.createOscillator()
      node.type = osc.waveform
      node.frequency.value = osc.frequency
      if (osc.sweep) {
        node.frequency.setValueAtTime(osc.frequency * osc.sweep.ratio, when)
        node.frequency.exponentialRampToValueAtTime(osc.frequency, when + osc.sweep.time)
      }
      node.detune.value = osc.detune
      const level = context.createGain()
      level.gain.value = osc.gain
      node.connect(level).connect(sources)
      node.start(when)
      node.stop(when + duration)
    }

    if (spec.noise) {
      const node = context.createBufferSource()
      node.buffer = noiseBuffer(context, spec.noise, duration)
      const level = context.createGain()
      level.gain.value = spec.noise.gain
      node.connect(level).connect(sources)
      node.start(when)
    }

    const envelope = context.createGain()
    envelope.gain.value = 0
    applyEnvelope(envelope.gain, envelopeSchedule(spec.envelope, duration), when)
    let chain: AudioNode = sources.connect(envelope)

    if (spec.filter) {
      const filter = context.createBiquadFilter()
      filter.type = spec.filter.type
      filter.frequency.value = spec.filter.cutoff
      filter.Q.value = spec.filter.resonance
      chain = chain.connect(filter)
    }

    for (const effect of spec.effects) {
      const nodes = buildEffect(context, effect, when, duration)
      chain.connect(nodes.input)
      chain = nodes.output
    }

    const master = context.createGain()
    master.gain.value = spec.master
    chain.connect(master).connect(out)
  }
}

const noiseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()

/**
 * Buffer di rumore, riusato fra le note che hanno stesso colore, seed e durata.
 * La batteria suona decine di colpi al secondo: rigenerarlo ogni volta sarebbe uno spreco.
 */
function noiseBuffer(context: BaseAudioContext, noise: Noise, duration: number): AudioBuffer {
  let cache = noiseCache.get(context)
  if (!cache) noiseCache.set(context, (cache = new Map()))
  const length = Math.max(1, Math.ceil(duration * context.sampleRate))
  const key = `${noise.color}:${noise.seed}:${length}`
  let buffer = cache.get(key)
  if (!buffer) {
    buffer = context.createBuffer(1, length, context.sampleRate)
    buffer.copyToChannel(generateNoise(noise.color, length, noise.seed), 0)
    cache.set(key, buffer)
  }
  return buffer
}

/** Il synth come Voice: la stessa per "Ascolta" (playLive) e per "Salva" (renderOffline). */
export function synthVoice(spec: SynthSpec): Voice {
  const needsWorklets = spec.effects.some((effect) => effect.type === 'bitcrush')
  return {
    duration: normalizeSpec(spec).duration,
    channels: 1,
    ...(needsWorklets ? { prepare: ensureWorklets } : {}),
    build: buildSynth(spec),
  }
}
