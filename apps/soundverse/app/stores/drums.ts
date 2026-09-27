import { defineStore } from 'pinia'
import {
  cycleVelocity,
  defaultPattern,
  emptySteps,
  MAX_BARS,
  newTrack,
  resizeSteps,
  STEPS_PER_BAR,
  type DrumPattern,
} from '~/drums/pattern'
import type { DrumVoiceId } from '~/drums/voices'

export const useDrumsStore = defineStore('drums', {
  state: () => ({
    pattern: defaultPattern() as DrumPattern,
    name: 'Batteria',
    /** Battuta mostrata nella griglia (0-based). */
    bar: 0,
  }),

  getters: {
    usedVoices: (state) => new Set(state.pattern.tracks.map((track) => track.voice)),
  },

  actions: {
    /** `step` è il passo nella battuta mostrata (0..15). */
    toggleStep(trackIndex: number, step: number) {
      const track = this.pattern.tracks[trackIndex]
      const index = this.bar * STEPS_PER_BAR + step
      if (track) track.steps[index] = cycleVelocity(track.steps[index] ?? 0)
    },

    setBars(bars: number) {
      const count = Math.min(MAX_BARS, Math.max(1, Math.round(bars)))
      this.pattern.bars = count
      for (const track of this.pattern.tracks) track.steps = resizeSteps(track.steps, count)
      this.bar = Math.min(this.bar, count - 1)
    },

    addTrack(voice: DrumVoiceId) {
      this.pattern.tracks.push(newTrack(voice, this.pattern.bars))
    },

    removeTrack(index: number) {
      this.pattern.tracks.splice(index, 1)
    },

    clearTrack(index: number) {
      const track = this.pattern.tracks[index]
      if (track) track.steps = emptySteps(this.pattern.bars)
    },

    reset() {
      this.pattern = defaultPattern()
      this.bar = 0
    },
  },
})
