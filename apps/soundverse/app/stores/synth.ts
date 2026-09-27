import { defineStore } from 'pinia'
import { randomSeed } from '~/audio/random'
import {
  defaultEffect,
  defaultOscillator,
  defaultSpec,
  params,
  type EffectType,
  type FilterType,
  type Preset,
  type SynthSpec,
} from '~/synth/spec'

export const MAX_OSCILLATORS = 4

export const useSynthStore = defineStore('synth', {
  state: () => ({
    spec: defaultSpec() as SynthSpec,
    name: 'Synth',
  }),

  actions: {
    addOscillator() {
      if (this.spec.oscillators.length < MAX_OSCILLATORS) {
        this.spec.oscillators.push(defaultOscillator())
      }
    },

    removeOscillator(index: number) {
      this.spec.oscillators.splice(index, 1)
    },

    setNoise(enabled: boolean) {
      this.spec.noise = enabled
        ? { color: 'white', gain: params.noiseGain.default, seed: randomSeed() }
        : null
    },

    newNoiseSeed() {
      if (this.spec.noise) this.spec.noise.seed = randomSeed()
    },

    setFilter(type: FilterType | 'off') {
      if (type === 'off') {
        this.spec.filter = null
      } else if (this.spec.filter) {
        this.spec.filter.type = type
      } else {
        this.spec.filter = {
          type,
          cutoff: params.cutoff.default,
          resonance: params.resonance.default,
        }
      }
    },

    addEffect(type: EffectType) {
      this.spec.effects.push(defaultEffect(type))
    },

    removeEffect(index: number) {
      this.spec.effects.splice(index, 1)
    },

    moveEffect(index: number, direction: -1 | 1) {
      const target = index + direction
      const effects = this.spec.effects
      if (target < 0 || target >= effects.length) return
      const [effect] = effects.splice(index, 1)
      if (effect) effects.splice(target, 0, effect)
    },

    loadPreset(preset: Preset) {
      this.spec = preset.spec()
      this.name = preset.name
    },
  },
})
