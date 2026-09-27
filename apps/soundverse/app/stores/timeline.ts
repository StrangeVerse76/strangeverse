import { defineStore } from 'pinia'
import {
  defaultProject,
  newTrack,
  timelineParams,
  type Placement,
  type TimelineProject,
} from '~/timeline/model'

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    project: defaultProject() as TimelineProject,
    selectedId: null as string | null,
    /** Pixel per secondo. */
    zoom: timelineParams.zoom.default,
    name: 'Mix',
  }),

  getters: {
    selected: (state) => state.project.placements.find((p) => p.id === state.selectedId) ?? null,
  },

  actions: {
    addTrack() {
      this.project.tracks.push(newTrack(this.project.tracks.length + 1))
    },

    removeTrack(id: string) {
      this.project.tracks = this.project.tracks.filter((t) => t.id !== id)
      this.project.placements = this.project.placements.filter((p) => p.trackId !== id)
      if (!this.selected) this.selectedId = null
    },

    addPlacement(clipId: string, trackId: string, start: number): Placement {
      const placement: Placement = {
        id: crypto.randomUUID(),
        clipId,
        trackId,
        start: Math.max(0, start),
        gain: timelineParams.gain.default,
        fadeIn: 0,
        fadeOut: 0,
        repeat: 1,
      }
      this.project.placements.push(placement)
      this.selectedId = placement.id
      return placement
    },

    removePlacement(id: string) {
      this.project.placements = this.project.placements.filter((p) => p.id !== id)
      if (this.selectedId === id) this.selectedId = null
    },

    /** Toglie i blocchi dei clip che non esistono più in libreria. */
    prune(existingClipIds: ReadonlySet<string>) {
      const kept = this.project.placements.filter((p) => existingClipIds.has(p.clipId))
      if (kept.length !== this.project.placements.length) this.project.placements = kept
      if (!this.selected) this.selectedId = null
    },
  },
})
