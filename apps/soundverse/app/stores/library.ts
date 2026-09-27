import { defineStore } from 'pinia'
import { MAX_CHANNELS, PEAK_BUCKETS, SAMPLE_RATE } from '~/audio/constants'
import { bufferToChannels, decodeAudio } from '~/audio/decode'
import { computePeaks, peakLevel } from '~/audio/peaks'
import { encodeWav } from '~/audio/wav'
import * as storage from '~/library/db'
import { filterClips, type ClipFilter } from '~/library/filter'
import type { Clip, ClipKind, ClipRecipe } from '~/library/types'

export interface NewClip {
  name: string
  kind: ClipKind
  channels: Float32Array[]
  recipe: ClipRecipe
  tags?: string[]
}

interface DeletedClip {
  clip: Clip
  audio: Blob
}

/** Buffer decodificati, tenuti fuori dallo stato reattivo (sono grandi e non serializzabili). */
const buffers = new Map<string, AudioBuffer>()

export const useLibraryStore = defineStore('library', {
  state: () => ({
    clips: [] as Clip[],
    selectedId: null as string | null,
    filter: { query: '', kind: 'all' } as ClipFilter,
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'unavailable',
    error: null as string | null,
    /** L'ultimo clip eliminato, finché si può annullare. */
    lastDeleted: null as DeletedClip | null,
  }),

  getters: {
    visibleClips: (state) => filterClips(state.clips, state.filter),
    selected: (state) => state.clips.find((clip) => clip.id === state.selectedId) ?? null,
  },

  actions: {
    async load() {
      if (this.status === 'loading' || this.status === 'ready') return
      this.status = 'loading'
      try {
        this.clips = await storage.listClips()
        this.status = 'ready'
      } catch (cause) {
        this.status = 'unavailable'
        this.error = 'La libreria non è disponibile in questo browser (IndexedDB bloccato).'
        console.error(cause)
      }
    },

    /** Crea un clip dai campioni: codifica il WAV, calcola i picchi e salva tutto. */
    async add({ name, kind, channels, recipe, tags = [] }: NewClip): Promise<Clip> {
      const used = channels.slice(0, MAX_CHANNELS)
      const length = used[0]?.length ?? 0
      const clip: Clip = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Senza nome',
        kind,
        tags,
        duration: length / SAMPLE_RATE,
        sampleRate: SAMPLE_RATE,
        channels: used.length,
        peak: peakLevel(used),
        peaks: computePeaks(used, PEAK_BUCKETS),
        createdAt: Date.now(),
        recipe,
      }
      const audio = new Blob([encodeWav(used, SAMPLE_RATE)], { type: 'audio/wav' })
      await storage.saveClip(clip, audio)
      this.clips.push(clip)
      this.selectedId = clip.id
      return clip
    },

    async importFiles(files: Iterable<File>) {
      this.error = null
      for (const file of files) {
        try {
          const buffer = await decodeAudio(await file.arrayBuffer())
          await this.add({
            name: file.name.replace(/\.[^.]+$/, ''),
            kind: 'sample',
            channels: bufferToChannels(buffer),
            recipe: { type: 'import', fileName: file.name },
          })
        } catch (cause) {
          this.error = `Non riesco a leggere «${file.name}»: il formato non è supportato da questo browser.`
          console.error(cause)
        }
      }
    },

    select(id: string | null) {
      this.selectedId = id
    },

    async rename(id: string, name: string) {
      const clip = this.clips.find((c) => c.id === id)
      const trimmed = name.trim()
      if (!clip || !trimmed || trimmed === clip.name) return
      clip.name = trimmed
      await storage.updateClip(plain(clip))
    },

    /** Elimina subito dal database, ma tiene il clip in memoria per poterlo ripristinare. */
    async remove(id: string) {
      const clip = this.clips.find((c) => c.id === id)
      if (!clip) return
      const audio = await storage.getAudio(id)
      await storage.deleteClip(id)
      this.clips = this.clips.filter((c) => c.id !== id)
      if (this.selectedId === id) this.selectedId = null
      buffers.delete(id)
      this.lastDeleted = audio ? { clip: plain(clip), audio } : null
    },

    async undoRemove() {
      const deleted = this.lastDeleted
      if (!deleted) return
      this.lastDeleted = null
      // Dallo stato di Pinia il clip torna come proxy reattivo, che IndexedDB non sa clonare.
      const clip = plain(deleted.clip)
      await storage.saveClip(clip, deleted.audio)
      this.clips.push(clip)
      this.selectedId = clip.id
    },

    dismissUndo() {
      this.lastDeleted = null
    },

    /** L'audio del clip decodificato, pronto da suonare (in cache dopo la prima volta). */
    async getBuffer(id: string): Promise<AudioBuffer> {
      const cached = buffers.get(id)
      if (cached) return cached
      const audio = await storage.getAudio(id)
      if (!audio) throw new Error(`Audio del clip ${id} non trovato`)
      const buffer = await decodeAudio(await audio.arrayBuffer())
      buffers.set(id, buffer)
      return buffer
    },

    async download(id: string) {
      const clip = this.clips.find((c) => c.id === id)
      const audio = await storage.getAudio(id)
      if (!clip || !audio) return
      const url = URL.createObjectURL(audio)
      const link = document.createElement('a')
      link.href = url
      link.download = `${clip.name}.wav`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  },
})

/** Copia senza proxy reattivi, salvabile in IndexedDB. */
function plain(clip: Clip): Clip {
  return structuredClone(toRaw(clip))
}
