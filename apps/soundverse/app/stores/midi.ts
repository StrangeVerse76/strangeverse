import { defineStore } from 'pinia'
import { findKnob, lastTouchedKnob, type KnobRef } from '~/midi/knobs'
import { ccPosition, DEFAULT_BASE_NOTE, parseMidi } from '~/midi/messages'

const STORAGE_KEY = 'soundverse-midi'

type NoteListener = (note: number, velocity: number, on: boolean) => void
const noteListeners = new Set<NoteListener>()

/** Chi suona le note MIDI (la griglia dei pad) si registra qui. */
export function onMidiNote(listener: NoteListener) {
  noteListeners.add(listener)
  return () => noteListeners.delete(listener)
}

interface SavedMap {
  baseNote: number
  learnedNotes: Record<number, number>
  ccMap: Record<string, KnobRef>
}

/** Le mappe sono di questo computer e di questo controller: stanno nel browser (con i try/catch). */
function readSaved(): SavedMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedMap) : null
  } catch {
    return null
  }
}

export const useMidiStore = defineStore('midi', {
  state: () => ({
    status: 'idle' as 'idle' | 'connecting' | 'unsupported' | 'denied' | 'ready',
    inputs: [] as { id: string; name: string }[],
    /** Ultimo messaggio per ingresso (ms), per la spia di attività. */
    activity: {} as Record<string, number>,
    baseNote: DEFAULT_BASE_NOTE,
    /** Note imparate: nota → pad (indice assoluto). */
    learnedNotes: {} as Record<number, number>,
    /** Controller mappati: "canale:cc" → manopola (nome e quale, fra quelle con lo stesso nome). */
    ccMap: {} as Record<string, KnobRef>,
    learning: null as 'pad' | 'knob' | null,
    /** Pad a cui dare la prossima nota, in "impara pad". */
    learnPad: 0,
    lastMessage: '',
  }),

  actions: {
    load() {
      const saved = readSaved()
      if (!saved) return
      this.baseNote = saved.baseNote ?? DEFAULT_BASE_NOTE
      this.learnedNotes = saved.learnedNotes ?? {}
      this.ccMap = saved.ccMap ?? {}
    },

    persist() {
      try {
        const map: SavedMap = {
          baseNote: this.baseNote,
          learnedNotes: this.learnedNotes,
          ccMap: this.ccMap,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
      } catch {
        // Storage non disponibile (navigazione privata): le mappe valgono solo per questa visita.
      }
    },

    async connect() {
      if (!('requestMIDIAccess' in navigator)) {
        this.status = 'unsupported'
        return
      }
      this.status = 'connecting'
      try {
        const access = await navigator.requestMIDIAccess({ sysex: false })
        const refresh = () => {
          this.inputs = [...access.inputs.values()].map((i) => ({
            id: i.id,
            name: i.name || 'Ingresso MIDI',
          }))
          for (const input of access.inputs.values()) {
            input.onmidimessage = (event) => this.handle(input.id, event.data ?? new Uint8Array())
          }
        }
        refresh()
        access.onstatechange = refresh
        this.status = 'ready'
      } catch (cause) {
        this.status = 'denied'
        console.error(cause)
      }
    },

    handle(inputId: string, data: ArrayLike<number>) {
      const message = parseMidi(data)
      if (!message) return
      this.activity[inputId] = Date.now()
      if (message.type === 'noteon') {
        this.lastMessage = `Nota ${message.note} · velocity ${message.velocity}`
        if (this.learning === 'pad') {
          this.learnedNotes[message.note] = this.learnPad
          this.learning = null
          this.persist()
          return
        }
        for (const listener of noteListeners) listener(message.note, message.velocity / 127, true)
      } else if (message.type === 'noteoff') {
        for (const listener of noteListeners) listener(message.note, 0, false)
      } else {
        const key = `${message.channel}:${message.controller}`
        this.lastMessage = `CC ${message.controller} · ${message.value}`
        if (this.learning === 'knob') {
          const knob = lastTouchedKnob()
          if (knob) {
            this.ccMap[key] = { ...knob }
            this.learning = null
            this.persist()
          }
          return
        }
        const ref = this.ccMap[key]
        if (ref) findKnob(ref)?.setPosition(ccPosition(message.value))
      }
    },

    forgetNote(note: number) {
      this.learnedNotes = Object.fromEntries(
        Object.entries(this.learnedNotes).filter(([n]) => Number(n) !== note),
      )
      this.persist()
    },

    forgetCc(key: string) {
      this.ccMap = Object.fromEntries(Object.entries(this.ccMap).filter(([k]) => k !== key))
      this.persist()
    },
  },
})
