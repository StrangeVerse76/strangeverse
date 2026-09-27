<script setup lang="ts">
import { useFlushOnHide } from '~/utils/flush'
import { toPlain } from '~/utils/plain'
import { unlockAudio } from '~/audio/context'
import { bufferToChannels } from '~/audio/decode'
import { renderOffline } from '~/audio/render'
import { useLibraryStore } from '~/stores/library'
import { useTimelineStore } from '~/stores/timeline'
import { limitPeak, timelineVoice } from '~/timeline/graph'
import type { ParamDef } from '~/synth/spec'
import {
  blockLength,
  MIN_SEGMENT,
  projectEnd,
  segment,
  snapToBeat,
  timelineParams,
  type Placement,
} from '~/timeline/model'
import { TimelineTransport } from '~/timeline/transport'
import { formatDuration } from '~/utils/format'

const DRAG_TYPE = 'application/x-soundverse-clip'
/** Spazio vuoto in fondo, per poter posare clip dopo l'ultimo. */
const TAIL_SECONDS = 10
const MIN_SECONDS = 30

const library = useLibraryStore()
const timeline = useTimelineStore()

const state = ref<'stopped' | 'playing' | 'paused'>('stopped')
const cursor = ref(0)
const position = ref(0)
const rendering = ref(false)
let transport: TimelineTransport | null = null
let frame = 0

const project = computed(() => timeline.project)
const clipsById = computed(() => new Map(library.clips.map((c) => [c.id, c])))
const durations = computed(() => new Map(library.clips.map((c) => [c.id, c.duration])))
const end = computed(() => projectEnd(project.value, durations.value))
const width = computed(() => (Math.max(end.value, MIN_SECONDS) + TAIL_SECONDS) * timeline.zoom)
const shownTime = computed(() => (state.value === 'playing' ? position.value : cursor.value))
const ticks = computed(() => {
  const seconds = Math.ceil(width.value / timeline.zoom)
  const every = timeline.zoom < 25 ? 10 : 5
  return Array.from({ length: seconds + 1 }, (_, s) => ({ s, label: s % every === 0 }))
})
const playLabel = computed(() =>
  state.value === 'playing' ? 'Pausa' : state.value === 'paused' ? 'Riprendi' : 'Play',
)

const isMissing = (p: Placement) => !clipsById.value.has(p.clipId)
const clipName = (p: Placement) => clipsById.value.get(p.clipId)?.name ?? 'Clip mancante'
/** Larghezza di comodo per i blocchi di clip mancanti, che non hanno una durata nota. */
const MISSING_SECONDS = 1
const blockStyle = (p: Placement) => ({
  left: `${p.start * timeline.zoom}px`,
  width: `${Math.max(4, (isMissing(p) ? MISSING_SECONDS : blockLength(p, durations.value)) * timeline.zoom)}px`,
})
// --- Rifilatura ---

const selectedDuration = computed(() => {
  const p = timeline.selected
  return p ? (durations.value.get(p.clipId) ?? 0) : 0
})
const selectedSegment = computed(() =>
  timeline.selected ? segment(timeline.selected, selectedDuration.value) : { offset: 0, length: 0 },
)
const offsetDef = computed<ParamDef>(() => ({
  label: 'Inizio clip',
  unit: 's',
  min: 0,
  max: Math.max(0, selectedDuration.value - MIN_SEGMENT),
  step: 0.01,
  default: 0,
}))
const lengthDef = computed<ParamDef>(() => ({
  label: 'Lunghezza',
  unit: 's',
  min: MIN_SEGMENT,
  max: Math.max(MIN_SEGMENT, selectedDuration.value - selectedSegment.value.offset),
  step: 0.01,
  default: Math.max(MIN_SEGMENT, selectedDuration.value - selectedSegment.value.offset),
}))
const trimOffset = computed({
  get: () => selectedSegment.value.offset,
  set: (value: number) => {
    const p = timeline.selected
    if (!p) return
    p.offset = value
    // La lunghezza non può superare quello che resta del clip.
    if (p.length != null) p.length = Math.min(p.length, selectedDuration.value - value)
  },
})
const trimLength = computed({
  get: () => selectedSegment.value.length,
  set: (value: number) => {
    if (timeline.selected) timeline.selected.length = value
  },
})

let trim: {
  placement: Placement
  edge: 'left' | 'right'
  x: number
  start: number
  offset: number
  length: number
  duration: number
} | null = null

/** Trascinando un bordo si rifila: a sinistra si sposta l'inizio del segmento, a destra la fine. */
function onEdgeDown(event: PointerEvent, placement: Placement, edge: 'left' | 'right') {
  event.stopPropagation()
  timeline.selectedId = placement.id
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  const duration = durations.value.get(placement.clipId) ?? 0
  const seg = segment(placement, duration)
  trim = { placement, edge, x: event.clientX, start: placement.start, ...seg, duration }
}

function onEdgeMove(event: PointerEvent) {
  if (!trim) return
  event.stopPropagation()
  const dt = (event.clientX - trim.x) / timeline.zoom
  const snap = (t: number) => (event.shiftKey ? t : snapToBeat(t, project.value.bpm))
  const p = trim.placement
  if (trim.edge === 'left') {
    const minDelta = -trim.offset
    const maxDelta = trim.length - MIN_SEGMENT
    const delta = Math.min(maxDelta, Math.max(minDelta, snap(trim.start + dt) - trim.start))
    p.start = trim.start + delta
    p.offset = trim.offset + delta
    p.length = trim.length - delta
  } else {
    const repeats = Math.max(1, Math.round(p.repeat))
    const end = snap(trim.start + trim.length * repeats + dt)
    const length = (end - trim.start) / repeats
    p.length = Math.min(trim.duration - trim.offset, Math.max(MIN_SEGMENT, length))
  }
}

function onEdgeUp(event: PointerEvent) {
  event.stopPropagation()
  trim = null
}

const missingCount = computed(() => project.value.placements.filter(isMissing).length)
const confirmingDelete = ref(false)

function removeMissing() {
  timeline.removeClips(new Set(project.value.placements.filter(isMissing).map((p) => p.clipId)))
}

async function deleteProject() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  confirmingDelete.value = false
  stop()
  await timeline.deleteCurrent()
}

async function onOpenProject(event: Event) {
  stop()
  await timeline.open((event.target as HTMLSelectElement).value)
}

onMounted(() => timeline.load())
useFlushOnHide(() => timeline.flush())

// Salvataggio automatico di ogni modifica, con una breve attesa.
watch(
  () => [timeline.project, timeline.projectName],
  () => timeline.scheduleSave(),
  { deep: true },
)

// Cambiando progetto si ferma quello che suona.
watch(
  () => timeline.projectId,
  () => {
    stop()
    confirmingDelete.value = false
  },
)

function follow() {
  position.value = transport?.position() ?? cursor.value
  frame = requestAnimationFrame(follow)
}

/** Decodifica tutti i clip usati, prima di fissare il tempo di partenza. */
async function loadBuffers() {
  const ids = [...new Set(project.value.placements.map((p) => p.clipId))].filter((id) =>
    clipsById.value.has(id),
  )
  const entries = await Promise.all(
    ids.map(async (id) => [id, await library.getBuffer(id)] as const),
  )
  return new Map(entries)
}

async function playFrom(from: number) {
  // Sincrono, dentro il gesto.
  const { context, master } = unlockAudio()
  if (!transport) {
    transport = new TimelineTransport(context, master)
    transport.onEnded = () => {
      cancelAnimationFrame(frame)
      state.value = 'stopped'
      cursor.value = 0
    }
  }
  const buffers = await loadBuffers()
  transport.play(project.value, buffers, from)
  state.value = 'playing'
  cancelAnimationFrame(frame)
  follow()
}

function pause() {
  cursor.value = transport?.position() ?? cursor.value
  transport?.stop()
  cancelAnimationFrame(frame)
  state.value = cursor.value > 0 ? 'paused' : 'stopped'
}

function togglePlay() {
  if (state.value === 'playing') pause()
  else void playFrom(cursor.value)
}

function stop() {
  transport?.stop()
  cancelAnimationFrame(frame)
  state.value = 'stopped'
  cursor.value = 0
}

function toStart() {
  if (state.value === 'playing') void playFrom(0)
  else stop()
}

function seekTo(time: number) {
  const t = Math.max(0, time)
  if (state.value === 'playing') {
    void playFrom(t)
  } else {
    cursor.value = t
    state.value = t > 0 ? 'paused' : 'stopped'
  }
}

function onRuler(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  seekTo((event.clientX - rect.left) / timeline.zoom)
}

// Volumi "vivi": cambiano mentre suona, senza ripartire.
watch(
  () => [
    project.value.master,
    project.value.tracks.map((t) => [t.gain, t.muted]),
    project.value.placements.map((p) => p.gain),
  ],
  () => transport?.updateGains(project.value),
  { deep: true },
)

// Modifiche alla struttura mentre suona: si riparte dal punto raggiunto.
watch(
  () =>
    JSON.stringify([
      project.value.tracks.map((t) => t.id),
      project.value.placements.map((p) => [
        p.id,
        p.clipId,
        p.trackId,
        p.start,
        p.repeat,
        p.fadeIn,
        p.fadeOut,
      ]),
    ]),
  () => {
    if (state.value === 'playing' && transport) void playFrom(transport.position())
  },
)

onBeforeUnmount(() => {
  transport?.stop()
  cancelAnimationFrame(frame)
})

// --- Posare e spostare i blocchi ---

function onDrop(event: DragEvent, trackId: string) {
  const clipId = event.dataTransfer?.getData(DRAG_TYPE)
  if (!clipId || !clipsById.value.has(clipId)) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const time = (event.clientX - rect.left) / timeline.zoom
  timeline.addPlacement(
    clipId,
    trackId,
    event.shiftKey ? time : snapToBeat(time, project.value.bpm),
  )
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes(DRAG_TYPE)) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
}

let drag: { placement: Placement; x: number; start: number; moved: boolean } | null = null

function onBlockDown(event: PointerEvent, placement: Placement) {
  timeline.selectedId = placement.id
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  drag = { placement, x: event.clientX, start: placement.start, moved: false }
}

function onBlockMove(event: PointerEvent) {
  if (!drag) return
  const dx = event.clientX - drag.x
  if (!drag.moved && Math.abs(dx) < 3) return
  drag.moved = true
  const time = drag.start + dx / timeline.zoom
  drag.placement.start = event.shiftKey ? Math.max(0, time) : snapToBeat(time, project.value.bpm)
}

function onBlockUp() {
  drag = null
}

/** Frecce sul blocco selezionato: un battito (Maiusc: un decimo di secondo). */
function onBlockKey(event: KeyboardEvent, placement: Placement) {
  const step = event.shiftKey ? 0.1 : 60 / project.value.bpm
  if (event.key === 'ArrowRight') placement.start += step
  else if (event.key === 'ArrowLeft') placement.start = Math.max(0, placement.start - step)
  else if (event.key === 'Delete' || event.key === 'Backspace')
    timeline.removePlacement(placement.id)
  else return
  event.preventDefault()
}

async function render() {
  if (!project.value.placements.length) return
  rendering.value = true
  try {
    const snapshot = toPlain(project.value)
    const buffers = await loadBuffers()
    const rendered = await renderOffline(timelineVoice(snapshot, buffers, 0))
    await library.add({
      name: timeline.name,
      kind: 'mix',
      channels: limitPeak(bufferToChannels(rendered) as Float32Array<ArrayBuffer>[]),
      recipe: { type: 'mix', project: snapshot },
    })
  } finally {
    rendering.value = false
  }
}
</script>

<template>
  <div class="timeline">
    <div class="projects" role="group" aria-label="Progetto">
      <select
        class="field"
        aria-label="Apri progetto"
        :value="timeline.projectId"
        @change="onOpenProject"
      >
        <option v-for="p in timeline.sortedProjects" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
      <input
        v-model="timeline.projectName"
        class="field projects__name"
        aria-label="Nome del progetto"
      />
      <button
        type="button"
        class="button button--ghost button--small"
        @click="timeline.newProject()"
      >
        Nuovo
      </button>
      <button
        type="button"
        class="button button--ghost button--small"
        @click="timeline.duplicate()"
      >
        Duplica
      </button>
      <button
        type="button"
        class="button button--ghost button--danger button--small"
        @click="deleteProject"
      >
        {{ confirmingDelete ? 'Conferma eliminazione' : 'Elimina progetto' }}
      </button>
    </div>

    <p v-if="missingCount" class="missing" role="alert">
      {{ missingCount === 1 ? '1 blocco usa' : `${missingCount} blocchi usano` }} clip non più in
      libreria: non suonano.
      <button type="button" class="link-button" @click="removeMissing">Rimuovili</button>
    </p>

    <div class="toolbar">
      <div class="transport" role="group" aria-label="Trasporto">
        <button type="button" class="chip" aria-label="Torna all'inizio" @click="toStart">⏮</button>
        <button type="button" class="button" @click="togglePlay">{{ playLabel }}</button>
        <button type="button" class="button button--ghost" @click="stop">Stop</button>
        <output class="clock" aria-label="Posizione">
          {{ formatDuration(shownTime) }} / {{ formatDuration(end) }}
        </output>
      </div>
      <ControlKnob v-model="timeline.project.bpm" :def="timelineParams.bpm" />
      <ControlKnob v-model="timeline.zoom" :def="timelineParams.zoom" />
      <ControlKnob v-model="timeline.project.master" :def="timelineParams.master" />
      <button type="button" class="button button--ghost button--small" @click="timeline.addTrack()">
        + Traccia
      </button>
    </div>

    <div class="body">
      <div class="heads">
        <div class="ruler-spacer" />
        <div
          v-for="(track, i) in timeline.project.tracks"
          :key="track.id"
          class="head"
          role="group"
          :aria-label="`Traccia ${i + 1}`"
        >
          <input
            v-model="track.name"
            class="field head__name"
            :aria-label="`Nome traccia ${i + 1}`"
          />
          <ControlKnob
            v-model="track.gain"
            :def="timelineParams.trackGain"
            :aria-label="`Volume ${track.name}`"
            compact
          />
          <div class="head__tools">
            <button
              type="button"
              class="chip"
              :aria-pressed="track.muted"
              :aria-label="`Muto ${track.name}`"
              @click="track.muted = !track.muted"
            >
              M
            </button>
            <button
              type="button"
              class="chip"
              :aria-label="`Rimuovi ${track.name}`"
              @click="timeline.removeTrack(track.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <div class="scroller">
        <div class="canvas" :style="{ width: `${width}px` }">
          <div class="ruler" data-testid="ruler" @pointerdown="onRuler">
            <span
              v-for="tick in ticks"
              :key="tick.s"
              class="tick"
              :class="{ 'tick--label': tick.label }"
              :style="{ left: `${tick.s * timeline.zoom}px` }"
            >
              <template v-if="tick.label">{{ tick.s }}s</template>
            </span>
          </div>
          <div
            v-for="track in timeline.project.tracks"
            :key="track.id"
            class="lane"
            :class="{ 'lane--muted': track.muted }"
            :aria-label="`Corsia ${track.name}`"
            role="list"
            @dragover="onDragOver"
            @drop.prevent="onDrop($event, track.id)"
          >
            <button
              v-for="p in timeline.project.placements.filter((x) => x.trackId === track.id)"
              :key="p.id"
              type="button"
              role="listitem"
              class="block"
              :class="{ 'block--missing': isMissing(p) }"
              :style="blockStyle(p)"
              :aria-pressed="timeline.selectedId === p.id"
              :aria-label="`${clipName(p)} a ${formatDuration(p.start)}`"
              @pointerdown="onBlockDown($event, p)"
              @pointermove="onBlockMove"
              @pointerup="onBlockUp"
              @pointercancel="onBlockUp"
              @keydown="onBlockKey($event, p)"
            >
              <span
                class="block__edge block__edge--left"
                data-testid="trim-left"
                @pointerdown="onEdgeDown($event, p, 'left')"
                @pointermove="onEdgeMove"
                @pointerup="onEdgeUp"
              />
              <span class="block__name">{{ clipName(p) }}</span>
              <span v-if="p.repeat > 1" class="block__repeat">×{{ p.repeat }}</span>
              <span
                class="block__edge block__edge--right"
                data-testid="trim-right"
                @pointerdown="onEdgeDown($event, p, 'right')"
                @pointermove="onEdgeMove"
                @pointerup="onEdgeUp"
              />
            </button>
          </div>
          <div class="playhead" :style="{ left: `${shownTime * timeline.zoom}px` }" />
        </div>
      </div>
    </div>

    <p v-if="!timeline.project.placements.length" class="hint">
      Trascina un clip dalla libreria su una traccia, oppure usa «Aggiungi alla timeline».
    </p>

    <section v-if="timeline.selected" class="inspector" aria-label="Blocco selezionato">
      <strong class="inspector__title">
        {{ clipName(timeline.selected) }}
        <span class="hint">da {{ formatDuration(timeline.selected.start) }}</span>
      </strong>
      <ControlKnob v-model="timeline.selected.gain" :def="timelineParams.gain" />
      <ControlKnob v-model="timeline.selected.fadeIn" :def="timelineParams.fadeIn" />
      <ControlKnob v-model="timeline.selected.fadeOut" :def="timelineParams.fadeOut" />
      <ControlKnob v-model="timeline.selected.repeat" :def="timelineParams.repeat" />
      <template v-if="selectedDuration > 0">
        <ControlKnob v-model="trimOffset" :def="offsetDef" />
        <ControlKnob v-model="trimLength" :def="lengthDef" />
      </template>
      <label class="inspector__track">
        Traccia
        <select v-model="timeline.selected.trackId" class="field">
          <option v-for="track in timeline.project.tracks" :key="track.id" :value="track.id">
            {{ track.name }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="button button--ghost button--danger button--small"
        @click="timeline.removePlacement(timeline.selected.id)"
      >
        Rimuovi dalla timeline
      </button>
    </section>

    <div class="actions">
      <input v-model="timeline.name" class="field actions__name" aria-label="Nome del mix" />
      <button
        type="button"
        class="button button--ghost"
        :disabled="rendering || !timeline.project.placements.length"
        @click="render"
      >
        {{ rendering ? 'Rendering…' : 'Renderizza in libreria' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  --row: 5.5rem;
  --ruler: 1.5rem;

  display: grid;
  gap: var(--space-3);
}

.projects,
.toolbar,
.transport,
.actions,
.inspector {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.toolbar {
  gap: var(--space-3);
}

.projects__name {
  flex: 1 1 10rem;
  max-width: 18rem;
}

.missing {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.link-button {
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.clock {
  min-width: 8rem;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.body {
  display: grid;
  grid-template-columns: 11rem minmax(0, 1fr);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.ruler-spacer {
  height: var(--ruler);
  border-bottom: 1px solid var(--color-border);
}

.head {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  height: var(--row);
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.head__name {
  grid-column: 1 / -1;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
}

.head__tools {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
}

@media (max-width: 48rem) {
  .body {
    grid-template-columns: 8rem minmax(0, 1fr);
  }
}

.scroller {
  overflow-x: auto;
}

.canvas {
  position: relative;
}

.ruler {
  position: relative;
  height: var(--ruler);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  height: 25%;
  background: var(--color-border);
}

.tick--label {
  height: 50%;
  background: var(--color-muted);
}

.tick--label {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  line-height: 1;
  text-indent: 3px;
  white-space: nowrap;
}

.lane {
  position: relative;
  height: var(--row);
  border-bottom: 1px solid var(--color-border);
}

.lane--muted .block {
  opacity: 0.4;
}

.block {
  position: absolute;
  top: var(--space-2);
  bottom: var(--space-2);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-1) var(--space-2);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-accent) 60%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface));
  color: var(--color-text);
  font-size: 0.75rem;
  text-align: left;
  cursor: grab;
  touch-action: none;
}

.block[aria-pressed='true'] {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}

.block--missing {
  border-style: dashed;
  border-color: var(--color-danger);
  background: transparent;
  color: var(--color-danger);
}

.block__edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}

.block__edge--left {
  left: 0;
}

.block__edge--right {
  right: 0;
}

.block__edge:hover {
  background: color-mix(in srgb, var(--color-accent) 45%, transparent);
}

.block__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block__repeat {
  color: var(--color-accent);
  font-weight: 700;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-text);
  pointer-events: none;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 400;
}

.inspector {
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.inspector__title {
  display: grid;
  flex: 1 1 10rem;
}

.inspector__track {
  display: grid;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chip {
  min-width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.actions__name {
  flex: 1 1 10rem;
  max-width: 20rem;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
