import { toPlain } from '~/utils/plain'
import { defineStore } from 'pinia'
import * as storage from '~/library/db'
import { isPristine } from '~/sync/pristine'
import type { StoredProject } from '~/library/db'
import {
  defaultProject,
  newTrack,
  timelineParams,
  type Placement,
  type TimelineProject,
} from '~/timeline/model'

/** Attesa dopo l'ultima modifica prima di salvare (ms). */
const SAVE_DELAY = 400
let saveTimer: ReturnType<typeof setTimeout> | undefined
/** C'è un salvataggio automatico in attesa. */
let pending = false

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    project: defaultProject() as TimelineProject,
    projectId: crypto.randomUUID() as string,
    projectName: 'Progetto 1',
    /** Tutti i progetti salvati (senza il contenuto aggiornato di quello aperto). */
    projects: [] as Omit<StoredProject, 'project'>[],
    status: 'idle' as 'idle' | 'loading' | 'ready',
    selectedId: null as string | null,
    /** Pixel per secondo. */
    zoom: timelineParams.zoom.default,
    /** Nome del clip mix che si crea con il render. */
    name: 'Mix',
  }),

  getters: {
    selected: (state) => state.project.placements.find((p) => p.id === state.selectedId) ?? null,
    sortedProjects: (state) => [...state.projects].sort((a, b) => b.updatedAt - a.updatedAt),
  },

  actions: {
    /** Carica i progetti e apre il più recente (o ne crea uno nuovo). */
    async load() {
      if (this.status !== 'idle') return
      this.status = 'loading'
      const stored = await storage.listProjects()
      this.projects = stored.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      const latest = [...stored].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest) this.show(latest)
      else await this.newProject()
      this.status = 'ready'
    },

    /** Salva subito il progetto aperto. */
    async save() {
      clearTimeout(saveTimer)
      pending = false
      const entry: StoredProject = {
        id: this.projectId,
        name: this.projectName.trim() || 'Senza nome',
        project: toPlain(this.project),
        updatedAt: Date.now(),
      }
      await storage.saveProject(entry)
      const index = this.projects.findIndex((p) => p.id === entry.id)
      const summary = { id: entry.id, name: entry.name, updatedAt: entry.updatedAt }
      if (index >= 0) this.projects[index] = summary
      else this.projects.push(summary)
    },

    /** Salvataggio automatico: dopo una pausa nelle modifiche. */
    scheduleSave() {
      if (this.status !== 'ready') return
      clearTimeout(saveTimer)
      pending = true
      saveTimer = setTimeout(() => void this.save(), SAVE_DELAY)
    },

    /** Salva subito se c'è un salvataggio in attesa (pagina nascosta o chiusa). */
    flush() {
      if (pending) void this.save()
    },

    /** Un progetto nuovo e davvero vuoto: tracce, BPM e master predefiniti, nessun blocco. */
    async newProject() {
      // Prima si mette al sicuro il progetto aperto: il salvataggio automatico potrebbe non essere ancora partito.
      if (this.status === 'ready') await this.save()
      this.show({
        id: crypto.randomUUID(),
        name: `Progetto ${this.projects.length + 1}`,
        project: defaultProject(),
        updatedAt: Date.now(),
      })
      await this.save()
    },

    async duplicate() {
      await this.save()
      this.projectId = crypto.randomUUID()
      this.projectName = `${this.projectName} (copia)`
      await this.save()
    },

    async open(id: string) {
      if (id === this.projectId) return
      await this.save()
      const stored = (await storage.listProjects()).find((p) => p.id === id)
      if (stored) this.show(stored)
    },

    /** Riapre come progetto nuovo la disposizione salvata nella ricetta di un clip mix. */
    async openFromMix(project: TimelineProject, name: string) {
      await this.save()
      this.show({
        id: crypto.randomUUID(),
        name,
        project: toPlain(project),
        updatedAt: Date.now(),
      })
      await this.save()
    },

    async deleteCurrent() {
      clearTimeout(saveTimer)
      await storage.deleteProject(this.projectId)
      this.projects = this.projects.filter((p) => p.id !== this.projectId)
      const next = this.sortedProjects[0]
      if (next) {
        const stored = (await storage.listProjects()).find((p) => p.id === next.id)
        if (stored) {
          this.show(stored)
          return
        }
      }
      await this.newProject()
    },

    /**
     * Dopo una sincronizzazione: rilegge l'elenco e, se il progetto aperto è cambiato altrove e
     * qui non ci sono modifiche in attesa, mostra la nuova versione.
     */
    async refresh(changed: ReadonlySet<string>) {
      if (this.status !== 'ready') return
      const stored = await storage.listProjects()
      this.projects = stored.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      // Il progetto vuoto creato al primo avvio non serve più se ne sono arrivati altri.
      const own = stored.find((p) => p.id === this.projectId)
      const entry = await storage.getEntry('project', this.projectId)
      if (
        own &&
        // Solo se ne sono appena arrivati dal server: un progetto vuoto creato qui a mano resta.
        stored.some((p) => p.id !== this.projectId && changed.has(p.id)) &&
        entry?.seq == null &&
        !pending &&
        isPristine('project', own)
      ) {
        await this.deleteCurrent()
        return
      }
      if (!changed.has(this.projectId) || pending) return
      const open = stored.find((p) => p.id === this.projectId)
      const latest = [...stored].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (open) this.show(open)
      else if (latest) this.show(latest)
      else await this.newProject()
    },

    show(stored: StoredProject) {
      this.projectId = stored.id
      this.projectName = stored.name
      this.project = structuredClone(stored.project)
      this.selectedId = null
      this.name = stored.name
    },

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

    /** Toglie dal progetto aperto i blocchi dei clip indicati (appena eliminati dalla libreria). */
    removeClips(clipIds: ReadonlySet<string>) {
      const kept = this.project.placements.filter((p) => !clipIds.has(p.clipId))
      if (kept.length !== this.project.placements.length) this.project.placements = kept
      if (!this.selected) this.selectedId = null
    },
  },
})
