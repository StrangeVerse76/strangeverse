import { buildEffect } from '~/audio/effects'
import { applyEnvelope, envelopeSchedule } from '~/audio/envelope'
import { generateNoise } from '~/audio/noise'
import type { GraphBuilder, Voice } from '~/audio/render'
import { ensureWorklets } from '~/audio/worklets'
import { normalizeSpec, type SynthSpec } from './spec'

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
      node.detune.value = osc.detune
      const level = context.createGain()
      level.gain.value = osc.gain
      node.connect(level).connect(sources)
      node.start(when)
      node.stop(when + duration)
    }

    if (spec.noise) {
      const length = Math.max(1, Math.ceil(duration * context.sampleRate))
      const buffer = context.createBuffer(1, length, context.sampleRate)
      buffer.copyToChannel(generateNoise(spec.noise.color, length, spec.noise.seed), 0)
      const node = context.createBufferSource()
      node.buffer = buffer
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
