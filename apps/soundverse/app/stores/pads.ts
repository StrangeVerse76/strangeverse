import { defineStore } from 'pinia'
import * as storage from '~/library/db'
import { BANKS, newKit, type Bank, type Kit } from '~/pads/kit'

const SAVE_DELAY = 400
let saveTimer: ReturnType<typeof setTimeout> | undefined

export const usePadsStore = defineStore('pads', {
  state: () => ({
    kit: newKit('Kit 1') as Kit,
    kits: [] as { id: string; name: string; updatedAt: number }[],
    bank: BANKS[0] as Bank,
    /** Pad selezionato (indice assoluto 0..63): quello che si modifica nell'editor. */
    selected: 0,
    /** Se vera, ogni colpo ha velocity piena; altrimenti dipende da dove si tocca il pad. */
    fullVelocity: false,
    status: 'idle' as 'idle' | 'loading' | 'ready',
  }),

  getters: {
    sortedKits: (state) => [...state.kits].sort((a, b) => b.updatedAt - a.updatedAt),
  },

  actions: {
    async load() {
      if (this.status !== 'idle') return
      this.status = 'loading'
      const kits = await storage.listKits()
      this.kits = kits.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      const latest = [...kits].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest) this.kit = latest
      else await this.save()
      this.status = 'ready'
    },

    async save() {
      clearTimeout(saveTimer)
      const kit: Kit = { ...structuredClone(toRaw(this.kit)), updatedAt: Date.now() }
      await storage.saveKit(kit)
      const summary = { id: kit.id, name: kit.name, updatedAt: kit.updatedAt }
      const i = this.kits.findIndex((k) => k.id === kit.id)
      if (i >= 0) this.kits[i] = summary
      else this.kits.push(summary)
    },

    scheduleSave() {
      if (this.status !== 'ready') return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void this.save(), SAVE_DELAY)
    },

    async newKit() {
      await this.save()
      this.kit = newKit(`Kit ${this.kits.length + 1}`)
      this.selected = 0
      this.bank = BANKS[0]
      await this.save()
    },

    async open(id: string) {
      if (id === this.kit.id) return
      await this.save()
      const kit = (await storage.listKits()).find((k) => k.id === id)
      if (kit) this.kit = kit
    },

    /** Toglie un clip da tutti i pad (quando viene eliminato dalla libreria). */
    removeClips(clipIds: ReadonlySet<string>) {
      for (const pad of this.kit.pads) if (pad.clipId && clipIds.has(pad.clipId)) pad.clipId = null
    },
  },
})
