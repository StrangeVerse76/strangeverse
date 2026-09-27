import { defineStore } from 'pinia'
import type { ProgressionSpec } from '~/chords/progression'
import { progressionPresets, randomProgression } from '~/chords/theory'
import type { SynthSpec } from '~/synth/spec'

/** Suono predefinito per gli accordi: un piano elettrico semplice. */
export function chordSound(): SynthSpec {
  return {
    duration: 2,
    oscillators: [
      { waveform: 'triangle', frequency: 220, gain: 0.5, detune: 0 },
      { waveform: 'sine', frequency: 440, gain: 0.2, detune: 3 },
    ],
    noise: null,
    envelope: { attack: 0.005, decay: 0.6, sustain: 0.35, release: 0.4 },
    filter: { type: 'lowpass', cutoff: 3200, resonance: 0.7 },
    effects: [],
    master: 0.8,
  }
}

export const useChordsStore = defineStore('chords', {
  state: () => ({
    spec: {
      tonic: 0,
      mode: 'major',
      degrees: [...(progressionPresets[0]?.degrees ?? [1, 5, 6, 4])],
      sevenths: false,
      bpm: 100,
      beatsPerChord: 4,
      octave: 4,
      bass: true,
      sound: chordSound(),
      master: 0.8,
    } as ProgressionSpec,
    seed: 1,
    name: 'Accordi',
  }),

  actions: {
    usePreset(name: string) {
      const preset = progressionPresets.find((p) => p.name === name)
      if (!preset) return
      this.spec.mode = preset.mode
      this.spec.degrees = [...preset.degrees]
    },

    randomize(seed = Math.floor(Math.random() * 1_000_000)) {
      this.seed = seed
      this.spec.degrees = randomProgression(seed, this.spec.degrees.length || 4)
    },
  },
})
