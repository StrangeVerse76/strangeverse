import { unlockAudio } from '~/audio/context'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'
import type { PadOverrides } from './levels'
import { livePadBus } from './bus'
import { PadSequencer, type RepeatNote } from './sequencer'

/**
 * Stato condiviso del sequencer dei pad, fra la griglia (che lo suona e registra)
 * e i controlli del sequencer. Un solo sequencer per pagina.
 */
const playing = ref(false)
const beat = ref(0)
/**
 * Note in ripetizione (Note Repeat), per chiave: il pad, oppure pad e variante (16 Levels,
 * piano), così due livelli dello stesso pad si ripetono insieme. `latched` serve all'interfaccia.
 */
const repeating = new Map<string, RepeatNote>()
const latched = ref(new Set<number>())
const refreshLatched = () => (latched.value = new Set([...repeating.values()].map((n) => n.pad)))
const buffers = new Map<string, AudioBuffer>()
let sequencer: PadSequencer | null = null
let frame = 0

export function usePadSequencer() {
  const pads = usePadsStore()
  const library = useLibraryStore()

  /** Decodifica i campioni dei pad **prima** di partire (lezione di Bragi sui clip sfasati). */
  async function preload() {
    const ids = new Set(pads.kit.pads.map((p) => p.clipId).filter((id): id is string => !!id))
    for (const id of ids) {
      if (!buffers.has(id) && library.clips.some((c) => c.id === id)) {
        buffers.set(id, await library.getBuffer(id))
      }
    }
  }

  function follow() {
    beat.value = sequencer?.currentBeat() ?? 0
    frame = requestAnimationFrame(follow)
  }

  async function play() {
    const { context, master } = unlockAudio()
    await preload()
    sequencer ??= new PadSequencer(context, livePadBus(context, master, pads.mixer), {
      pattern: () => pads.pattern,
      settings: () => pads.settings,
      pads: () => pads.kit.pads,
      buffer: (id) => buffers.get(id),
      repeating: () => repeating,
      noteRepeat: () => pads.noteRepeat,
      metronome: () => pads.metronome,
      onRepeatHit: (note, at) => {
        if (pads.recording) pads.recordHit(note.pad, at, note.velocity, note.overrides)
      },
      onLoopEnd: () => pads.applyQueue(),
    })
    sequencer.start()
    playing.value = true
    cancelAnimationFrame(frame)
    follow()
  }

  function stop() {
    sequencer?.stop()
    playing.value = false
    cancelAnimationFrame(frame)
    beat.value = 0
    pads.stopRecording()
    repeating.clear()
    latched.value = new Set()
  }

  function togglePlay() {
    if (playing.value) stop()
    else void play()
  }

  /**
   * Un pad premuto. Restituisce true se il chiamante deve suonarlo subito: con il Note Repeat
   * attivo è il sequencer a suonarlo, a tempo con la griglia.
   */
  function padDown(
    index: number,
    velocity: number,
    overrides?: PadOverrides,
    key: string = String(index),
  ): boolean {
    if (pads.noteRepeat && playing.value) {
      if (pads.latch && repeating.has(key)) repeating.delete(key)
      else repeating.set(key, { pad: index, velocity, ...(overrides && { overrides }) })
      refreshLatched()
      return false
    }
    if (pads.recording && playing.value && sequencer) {
      pads.recordHit(index, sequencer.currentBeat(), velocity, overrides)
    }
    return true
  }

  function padUp(key: string | number) {
    if (pads.noteRepeat && !pads.latch && repeating.delete(String(key))) refreshLatched()
  }

  // Un campione assegnato mentre suona va decodificato subito.
  watch(
    () => pads.kit.pads.map((p) => p.clipId),
    () => {
      if (playing.value) void preload()
    },
  )

  return { playing, beat, latched, buffers, preload, togglePlay, stop, padDown, padUp }
}
