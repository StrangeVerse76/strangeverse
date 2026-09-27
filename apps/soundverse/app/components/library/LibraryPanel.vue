<script setup lang="ts">
import { unlockAudio } from '~/audio/context'
import { BufferPlayer } from '~/audio/player'
import { kindLabels, type Clip } from '~/library/types'
import { MP3_BITRATES, type Mp3Bitrate } from '~/audio/mp3-core'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'
import { useTimelineStore } from '~/stores/timeline'
import { blockLength } from '~/timeline/model'
import { formatDuration } from '~/utils/format'

const UNDO_SECONDS = 10

const library = useLibraryStore()
const mp3Bitrate = ref<Mp3Bitrate>(192)
const mp3Progress = ref<number | null>(null)

async function downloadMp3(clip: Clip) {
  mp3Progress.value = 0
  try {
    await library.downloadMp3(clip.id, mp3Bitrate.value, (f) => (mp3Progress.value = f))
  } finally {
    mp3Progress.value = null
  }
}
const timeline = useTimelineStore()
const pads = usePadsStore()

/** Tipo MIME del trascinamento verso la timeline. */
const DRAG_TYPE = 'application/x-soundverse-clip'

function onDragStart(event: DragEvent, clip: Clip) {
  event.dataTransfer?.setData(DRAG_TYPE, clip.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

/** Alternativa da tastiera al trascinamento: in coda alla prima traccia. */
function addToTimeline(clip: Clip) {
  if (!timeline.project.tracks.length) timeline.addTrack()
  const target = timeline.project.tracks[0]
  if (!target) return
  const durations = new Map(library.clips.map((c) => [c.id, c.duration]))
  const end = timeline.project.placements
    .filter((p) => p.trackId === target.id)
    .reduce((max, p) => Math.max(max, p.start + blockLength(p, durations)), 0)
  timeline.addPlacement(clip.id, target.id, end)
}

// Se un clip viene eliminato, spariscono anche i suoi blocchi nel progetto aperto.
// Solo quelli appena eliminati: un progetto aperto può citare clip mancanti da tempo, e li mostra.
watch(
  () => library.clips.map((c) => c.id),
  (ids, previous) => {
    if (library.status !== 'ready' || !previous) return
    const current = new Set(ids)
    const removed = new Set(previous.filter((id) => !current.has(id)))
    if (removed.size) {
      timeline.removeClips(removed)
      pads.removeClips(removed)
    }
  },
)

function openAsProject(clip: Clip) {
  if (clip.recipe.type === 'mix') void timeline.openFromMix(clip.recipe.project, clip.name)
}
const player = new BufferPlayer()
const playingId = ref<string | null>(null)
const position = ref(0)
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const dragOver = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const renameInput = useTemplateRef<HTMLInputElement[]>('renameInput')
let frame = 0
let undoTimer: ReturnType<typeof setTimeout> | undefined

const isPlayingSelected = computed(
  () => playingId.value !== null && playingId.value === library.selectedId,
)
const progress = computed(() => {
  const clip = library.selected
  return clip && isPlayingSelected.value ? position.value / clip.duration : null
})

onMounted(() => library.load())
onBeforeUnmount(() => {
  stop()
  clearTimeout(undoTimer)
})

// Cambiando clip si ferma quello che suona: il cursore resterebbe su una waveform diversa.
watch(
  () => library.selectedId,
  (id) => {
    if (id !== playingId.value) stop()
  },
)

player.onEnded = () => {
  cancelAnimationFrame(frame)
  playingId.value = null
  position.value = 0
}

function tick() {
  position.value = player.position()
  frame = requestAnimationFrame(tick)
}

async function play(id: string, offset = 0) {
  // Sincrono, dentro il gesto dell'utente: solo così il contesto parte davvero.
  const { context, master } = unlockAudio()
  const buffer = await library.getBuffer(id)
  player.play(context, master, buffer, offset)
  playingId.value = id
  cancelAnimationFrame(frame)
  tick()
}

function stop() {
  player.stop()
  cancelAnimationFrame(frame)
  playingId.value = null
  position.value = 0
}

function togglePlay() {
  const clip = library.selected
  if (!clip) return
  if (isPlayingSelected.value) stop()
  else void play(clip.id)
}

function seek(fraction: number) {
  const clip = library.selected
  if (clip) void play(clip.id, fraction * clip.duration)
}

async function startRename(clip: Clip) {
  renamingId.value = clip.id
  renameValue.value = clip.name
  await nextTick()
  renameInput.value?.[0]?.select()
}

async function commitRename() {
  const id = renamingId.value
  if (!id) return
  renamingId.value = null
  await library.rename(id, renameValue.value)
}

async function remove(clip: Clip) {
  if (playingId.value === clip.id) stop()
  await library.remove(clip.id)
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => library.dismissUndo(), UNDO_SECONDS * 1000)
}

async function undo() {
  clearTimeout(undoTimer)
  await library.undoRemove()
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) await library.importFiles(Array.from(input.files))
  input.value = ''
}

async function onDrop(event: DragEvent) {
  dragOver.value = false
  const files = event.dataTransfer?.files
  if (files?.length) await library.importFiles(Array.from(files))
}
</script>

<template>
  <div
    class="library"
    :class="{ 'library--drop': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="library__toolbar">
      <input
        v-model="library.filter.query"
        type="search"
        class="field library__search"
        placeholder="Cerca per nome o tag"
        aria-label="Cerca nella libreria"
      />
      <select v-model="library.filter.kind" class="field" aria-label="Tipo di clip">
        <option value="all">Tutti</option>
        <option v-for="(label, kind) in kindLabels" :key="kind" :value="kind">{{ label }}</option>
      </select>
      <button type="button" class="button button--ghost" @click="fileInput?.click()">
        Importa…
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="audio/*"
        multiple
        hidden
        data-testid="import-input"
        @change="onFiles"
      />
    </div>

    <p v-if="library.error" class="library__error" role="alert">{{ library.error }}</p>

    <p v-if="library.status === 'ready' && library.clips.length === 0" class="library__empty">
      La libreria è vuota. Importa un file audio o trascinalo qui.
    </p>
    <p
      v-else-if="library.status === 'ready' && library.visibleClips.length === 0"
      class="library__empty"
    >
      Nessun clip corrisponde alla ricerca.
    </p>

    <ul v-if="library.visibleClips.length" class="library__list" aria-label="Clip">
      <li v-for="clip in library.visibleClips" :key="clip.id">
        <input
          v-if="renamingId === clip.id"
          ref="renameInput"
          v-model="renameValue"
          class="field clip__rename"
          aria-label="Nuovo nome del clip"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renamingId = null"
          @blur="commitRename"
        />
        <button
          v-else
          type="button"
          class="clip"
          draggable="true"
          :aria-pressed="clip.id === library.selectedId"
          @click="library.select(clip.id)"
          @dragstart="onDragStart($event, clip)"
          @dblclick="startRename(clip)"
          @keydown.f2.prevent="startRename(clip)"
        >
          <span class="clip__name">{{ clip.name }}</span>
          <span class="clip__meta">
            {{ kindLabels[clip.kind] }} · {{ formatDuration(clip.duration) }} ·
            {{ clip.channels === 1 ? 'mono' : 'stereo' }}
            <template v-if="clip.analysis?.bpm"> · {{ clip.analysis.bpm }} BPM</template>
            <template v-if="clip.analysis?.key"> · {{ clip.analysis.key }}</template>
          </span>
        </button>
      </li>
    </ul>

    <section v-if="library.selected" class="detail" aria-label="Clip selezionato">
      <AudioWaveform
        :peaks="library.selected.peaks"
        :progress="progress"
        :label="`Forma d'onda di ${library.selected.name}`"
        @seek="seek"
      />
      <LibraryAnalysis :clip="library.selected" />
      <div class="detail__actions">
        <button type="button" class="button" @click="togglePlay">
          {{ isPlayingSelected ? 'Stop' : 'Ascolta' }}
        </button>
        <button type="button" class="button button--ghost" @click="startRename(library.selected)">
          Rinomina
        </button>
        <button
          type="button"
          class="button button--ghost"
          @click="library.download(library.selected.id)"
        >
          Scarica WAV
        </button>
        <span class="mp3">
          <select v-model="mp3Bitrate" class="field" aria-label="Qualità MP3">
            <option v-for="kbps in MP3_BITRATES" :key="kbps" :value="kbps">{{ kbps }} kbps</option>
          </select>
          <button
            type="button"
            class="button button--ghost"
            :disabled="mp3Progress !== null"
            @click="downloadMp3(library.selected)"
          >
            {{ mp3Progress === null ? 'Scarica MP3' : `MP3… ${Math.round(mp3Progress * 100)}%` }}
          </button>
        </span>
        <button type="button" class="button button--ghost" @click="addToTimeline(library.selected)">
          Aggiungi alla timeline
        </button>
        <button
          v-if="library.selected.recipe.type === 'mix'"
          type="button"
          class="button button--ghost"
          @click="openAsProject(library.selected)"
        >
          Apri come progetto
        </button>
        <button
          type="button"
          class="button button--ghost button--danger"
          @click="remove(library.selected)"
        >
          Elimina
        </button>
      </div>
    </section>

    <div v-if="library.lastDeleted" class="toast" role="status">
      <span>«{{ library.lastDeleted.clip.name }}» eliminato.</span>
      <button type="button" class="toast__action" @click="undo">Annulla</button>
    </div>
  </div>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  border-radius: var(--radius-sm);
  outline: 2px dashed transparent;
  outline-offset: 4px;
}

.library--drop {
  outline-color: var(--color-accent);
}

.library__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.library__search {
  flex: 1 1 10rem;
}

.library__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.library__empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.library__list {
  display: grid;
  gap: var(--space-1);
  max-height: 18rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.clip {
  display: grid;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.clip:hover {
  background: var(--color-surface-2);
}

.clip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}

.clip__name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clip__meta {
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.clip__rename {
  width: 100%;
}

.detail {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.mp3 {
  display: inline-flex;
  gap: var(--space-1);
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-size: var(--text-sm);
}

.toast__action {
  border: 0;
  background: none;
  color: var(--color-accent);
  font-weight: 700;
  cursor: pointer;
}
</style>
