import { toPlain } from '~/utils/plain'
import { defineStore } from 'pinia'
import * as storage from '~/library/db'
import { BANKS, defaultSequencer, newKit, type Bank, type Kit } from '~/pads/kit'
import {
  addEvent,
  newPattern,
  patternBeats,
  quantize,
  type PadEvent,
  type PadPattern,
} from '~/pads/pattern'

/** I kit salvati prima del sequencer non hanno pattern: si aggiungono qui. */
function withSequencer(kit: Kit): Kit {
  if (!kit.patterns?.length) kit.patterns = [newPattern(1)]
  if (!kit.sequencer) kit.sequencer = defaultSequencer()
  return kit
}

const SAVE_DELAY = 400
let saveTimer: ReturnType<typeof setTimeout> | undefined
/** C'è un salvataggio automatico in attesa. */
let pending = false

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
    /** Pattern in uso e, mentre suona, quello in coda per il prossimo giro. */
    patternIndex: 0,
    queuedIndex: null as number | null,
    recording: false,
    metronome: true,
    noteRepeat: false,
    latch: false,
    /** Stato degli eventi prima dell'ultima registrazione, per "Annulla". */
    undo: null as PadEvent[] | null,
  }),

  getters: {
    sortedKits: (state) => [...state.kits].sort((a, b) => b.updatedAt - a.updatedAt),
    patterns: (state): PadPattern[] => state.kit.patterns ?? [],
    pattern(): PadPattern {
      return this.patterns[this.patternIndex] ?? this.patterns[0] ?? newPattern(1)
    },
    settings: (state) => state.kit.sequencer ?? defaultSequencer(),
  },

  actions: {
    async load() {
      if (this.status !== 'idle') return
      this.status = 'loading'
      const kits = await storage.listKits()
      this.kits = kits.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      const latest = [...kits].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest) this.kit = withSequencer(latest)
      else await this.save()
      this.status = 'ready'
    },

    async save() {
      clearTimeout(saveTimer)
      pending = false
      const kit: Kit = { ...toPlain(this.kit), updatedAt: Date.now() }
      await storage.saveKit(kit)
      const summary = { id: kit.id, name: kit.name, updatedAt: kit.updatedAt }
      const i = this.kits.findIndex((k) => k.id === kit.id)
      if (i >= 0) this.kits[i] = summary
      else this.kits.push(summary)
    },

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
      if (kit) {
        this.kit = withSequencer(kit)
        this.patternIndex = 0
        this.queuedIndex = null
      }
    },

    addPattern() {
      const patterns = withSequencer(this.kit).patterns ?? []
      patterns.push(newPattern(patterns.length + 1))
      return patterns.length - 1
    },

    /** Mentre suona il cambio va in coda (parte a fine giro); da fermo è immediato. */
    choosePattern(index: number, playing: boolean) {
      if (playing && index !== this.patternIndex) this.queuedIndex = index
      else {
        this.patternIndex = index
        this.queuedIndex = null
      }
    },

    applyQueue() {
      if (this.queuedIndex === null) return
      this.patternIndex = this.queuedIndex
      this.queuedIndex = null
    },

    startRecording() {
      this.undo = toPlain(this.pattern.events)
      this.recording = true
    },

    stopRecording() {
      this.recording = false
    },

    /** Registra un colpo alla posizione `beat`, quantizzata se la quantizzazione è attiva. */
    recordHit(pad: number, beat: number, velocity: number) {
      const pattern = this.pattern
      const length = patternBeats(pattern)
      const position = this.settings.quantize
        ? quantize(beat, this.settings.grid, length)
        : ((beat % length) + length) % length
      addEvent(pattern, { pad, beat: position, velocity })
    },

    undoRecording() {
      if (this.undo === null) return
      this.pattern.events = this.undo
      this.undo = null
    },

    clearPattern() {
      this.undo = toPlain(this.pattern.events)
      this.pattern.events = []
    },

    removeEvent(event: PadEvent) {
      this.pattern.events = this.pattern.events.filter((e) => e !== event)
    },

    setBars(bars: number) {
      const pattern = this.pattern
      pattern.bars = bars
      // Gli eventi oltre la nuova lunghezza si tolgono.
      pattern.events = pattern.events.filter((e) => e.beat < patternBeats(pattern))
    },

    /** Toglie un clip da tutti i pad (quando viene eliminato dalla libreria). */
    removeClips(clipIds: ReadonlySet<string>) {
      for (const pad of this.kit.pads) if (pad.clipId && clipIds.has(pad.clipId)) pad.clipId = null
    },
  },
})
