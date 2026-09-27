<script setup lang="ts">
import { toPlain } from '~/utils/plain'
import type { WaveRegion } from '~/components/audio/AudioWaveform.vue'
import { PEAK_BUCKETS, SAMPLE_RATE } from '~/audio/constants'
import { unlockAudio } from '~/audio/context'
import { bufferToChannels } from '~/audio/decode'
import { computePeaks, peakLevel } from '~/audio/peaks'
import { BufferPlayer } from '~/audio/player'
import { kindLabels } from '~/library/types'
import { eqGraph, type EqNodes } from '~/eq/graph'
import {
  applyChain,
  defaultOp,
  opLabels,
  opParams,
  rmsLevel,
  type SampleOp,
  type SampleOpType,
} from '~/samples/ops'
import type { ParamDef } from '~/synth/spec'
import { useLibraryStore } from '~/stores/library'
import { useTimelineStore } from '~/stores/timeline'
import { formatDb, formatDuration } from '~/utils/format'

interface Result {
  channels: Float32Array<ArrayBuffer>[]
  peaks: number[]
  peak: number
  rms: number
  duration: number
}

const library = useLibraryStore()
const timeline = useTimelineStore()
const player = new BufferPlayer()

const sourceId = ref<string | null>(null)
const region = ref<WaveRegion | null>(null)
const ops = ref<SampleOp[]>([])
const name = ref('')
const newOp = ref<SampleOpType | ''>('')
const sourceRms = ref<number | null>(null)
const result = shallowRef<Result | null>(null)
const playing = ref<'source' | 'result' | null>(null)
const position = ref(0)
const creating = ref(false)
/** Indice dell'operazione EQ che si sta ascoltando dal vivo, o null. */
const eqPreview = ref<number | null>(null)
let eqSource: AudioBufferSourceNode | null = null
let eqNodes: EqNodes | null = null
let eqOut: AudioNode | null = null
const dragOver = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
let sourceChannels: Float32Array[] | null = null
let frame = 0

const source = computed(() => library.clips.find((c) => c.id === sourceId.value) ?? null)
const clipsForSelect = computed(() => [...library.clips].sort((a, b) => b.createdAt - a.createdAt))
const opTypes = Object.keys(opLabels) as SampleOpType[]
const regionSeconds = computed(() => {
  const clip = source.value
  const r = region.value
  return clip && r ? { start: r.start * clip.duration, end: r.end * clip.duration } : null
})
const progress = computed(() => {
  const clip = source.value
  return clip && playing.value === 'source' ? position.value / clip.duration : null
})

/** Le chiavi dei parametri sono dinamiche: le trattiamo come un record numerico. */
const values = (op: SampleOp) => op as unknown as Record<string, number>
const defsOf = (op: SampleOp) => opParams[op.type] as Record<string, ParamDef>

// Senza una sorgente scelta, si parte dal clip selezionato in libreria.
watch(
  () => library.selectedId,
  (id) => {
    if (!sourceId.value && id) sourceId.value = id
  },
  { immediate: true },
)

// Se la sorgente viene eliminata dalla libreria, il pannello si svuota.
watch(
  () => library.clips.some((c) => c.id === sourceId.value),
  (exists) => {
    if (!exists) sourceId.value = null
  },
)

watch(sourceId, async (id) => {
  stop()
  region.value = null
  ops.value = []
  result.value = null
  sourceChannels = null
  sourceRms.value = null
  if (!id) return
  const buffer = await library.getBuffer(id)
  if (sourceId.value !== id) return
  sourceChannels = bufferToChannels(buffer)
  sourceRms.value = rmsLevel(sourceChannels)
  name.value = `${source.value?.name ?? 'Campione'} (modificato)`
})

// Qualunque modifica alla catena rende vecchio il risultato calcolato.
watch(ops, () => (result.value = null), { deep: true })

onBeforeUnmount(stop)

player.onEnded = () => {
  cancelAnimationFrame(frame)
  playing.value = null
  position.value = 0
}

function tick() {
  position.value = player.position()
  frame = requestAnimationFrame(tick)
}

function stop() {
  stopEq()
  player.stop()
  cancelAnimationFrame(frame)
  playing.value = null
  position.value = 0
}

async function computeResult(): Promise<Result | null> {
  if (!sourceChannels) return null
  if (result.value) return result.value
  const channels = await applyChain(sourceChannels, toPlain(ops.value))
  const length = channels[0]?.length ?? 0
  const computed: Result = {
    channels,
    peaks: computePeaks(channels, PEAK_BUCKETS),
    peak: peakLevel(channels),
    rms: rmsLevel(channels),
    duration: length / SAMPLE_RATE,
  }
  result.value = computed
  return computed
}

async function playSource(offset = 0) {
  const clip = source.value
  if (!clip) return
  const { context, master } = unlockAudio()
  const buffer = await library.getBuffer(clip.id)
  player.play(context, master, buffer, offset)
  playing.value = 'source'
  cancelAnimationFrame(frame)
  tick()
}

function toggleSource() {
  if (playing.value === 'source') stop()
  else void playSource()
}

async function toggleResult() {
  if (playing.value === 'result') {
    stop()
    return
  }
  const { context, master } = unlockAudio()
  const computed = await computeResult()
  if (!computed) return
  const buffer = context.createBuffer(
    computed.channels.length,
    computed.channels[0]?.length ?? 1,
    SAMPLE_RATE,
  )
  computed.channels.forEach((channel, i) => buffer.copyToChannel(channel, i))
  player.play(context, master, buffer)
  playing.value = 'result'
  cancelAnimationFrame(frame)
}

function seek(fraction: number) {
  const clip = source.value
  if (clip) void playSource(fraction * clip.duration)
}

function addOp() {
  const type = newOp.value
  newOp.value = ''
  if (!type) return
  if (type === 'trim') {
    const r = regionSeconds.value
    if (!r) return
    // Il taglio usa i tempi della sorgente: sta sempre in testa alla catena, e ce n'è uno solo.
    ops.value = [
      { type: 'trim', start: r.start, end: r.end },
      ...ops.value.filter((op) => op.type !== 'trim'),
    ]
  } else if (type === 'tempo') {
    // Dal BPM stimato della sorgente a quello del progetto aperto nella timeline.
    const fromBpm = source.value?.analysis?.bpm ?? timeline.project.bpm
    ops.value.push({ type: 'tempo', fromBpm, toBpm: timeline.project.bpm })
  } else {
    ops.value.push(defaultOp(type))
  }
}

async function create() {
  const clip = source.value
  const computed = await computeResult()
  if (!clip || !computed) return
  creating.value = true
  try {
    await library.add({
      name: name.value,
      kind: 'sample',
      channels: computed.channels,
      recipe: {
        type: 'sample',
        sourceId: clip.id,
        sourceName: clip.name,
        ops: toPlain(ops.value),
      },
    })
  } finally {
    creating.value = false
  }
}

// --- EQ dal vivo: la sorgente in loop attraverso lo stesso grafo del render ---

function stopEq() {
  eqSource?.stop()
  eqSource?.disconnect()
  eqNodes?.output.disconnect()
  eqSource = null
  eqNodes = null
  eqPreview.value = null
}

/** I filtri IIR non si ricalcolano: a ogni modifica si costruisce un grafo nuovo e si scambia. */
function rebuildEq() {
  const index = eqPreview.value
  const op = index === null ? null : ops.value[index]
  if (!eqSource || !eqOut || op?.type !== 'eq') return
  const next = eqGraph(eqSource.context, toPlain(op.spec))
  next.output.connect(eqOut)
  eqSource.disconnect()
  eqSource.connect(next.input)
  eqNodes?.output.disconnect()
  eqNodes = next
}

async function toggleEq(index: number) {
  if (eqPreview.value === index) {
    stopEq()
    return
  }
  const clip = source.value
  if (!clip) return
  const { context, master } = unlockAudio()
  stop()
  const buffer = await library.getBuffer(clip.id)
  eqSource = context.createBufferSource()
  eqSource.buffer = buffer
  eqSource.loop = true
  eqOut = master
  eqPreview.value = index
  rebuildEq()
  eqSource.start()
}

watch(
  () => (eqPreview.value === null ? null : ops.value[eqPreview.value]),
  () => rebuildEq(),
  { deep: true },
)

async function importFiles(files: FileList | null | undefined) {
  if (!files?.length) return
  const imported = await library.importFiles(Array.from(files))
  const last = imported.at(-1)
  if (last) sourceId.value = last.id
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  await importFiles(input.files)
  input.value = ''
}

async function onDrop(event: DragEvent) {
  dragOver.value = false
  await importFiles(event.dataTransfer?.files)
}
</script>

<template>
  <div
    class="samples"
    :class="{ 'samples--drop': dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="bar">
      <label class="bar__source">
        <span>Sorgente</span>
        <select v-model="sourceId" class="field" aria-label="Clip sorgente">
          <option :value="null">Nessuna</option>
          <option v-for="clip in clipsForSelect" :key="clip.id" :value="clip.id">
            {{ clip.name }} · {{ kindLabels[clip.kind] }}
          </option>
        </select>
      </label>
      <button type="button" class="button button--ghost button--small" @click="fileInput?.click()">
        Carica file…
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="audio/*"
        multiple
        hidden
        data-testid="sample-input"
        @change="onFiles"
      />
    </div>

    <p v-if="!source" class="empty">
      Scegli un clip della libreria come sorgente, oppure carica o trascina qui un file audio.
    </p>

    <template v-else>
      <p class="stats" aria-label="Analisi della sorgente">
        {{ formatDuration(source.duration) }} · {{ source.channels === 1 ? 'mono' : 'stereo' }} ·
        picco {{ formatDb(source.peak) }} · RMS
        {{ sourceRms === null ? '…' : formatDb(sourceRms) }}
        <template v-if="source.analysis?.bpm"> · {{ source.analysis.bpm }} BPM</template>
        <template v-if="source.analysis?.key"> · {{ source.analysis.key }}</template>
      </p>

      <AudioWaveform
        :peaks="source.peaks"
        :progress="progress"
        :duration="source.duration"
        :region="region"
        :label="`Forma d'onda della sorgente ${source.name}`"
        @select="region = $event"
        @seek="seek"
      />

      <div class="row">
        <button type="button" class="button button--ghost button--small" @click="toggleSource">
          {{ playing === 'source' ? 'Stop' : 'Ascolta sorgente' }}
        </button>
        <span v-if="regionSeconds" class="region" aria-live="polite">
          Regione {{ formatDuration(regionSeconds.start) }}–{{ formatDuration(regionSeconds.end) }}
          <button type="button" class="link-button" @click="region = null">Cancella</button>
        </span>
        <span v-else class="hint">Trascina sulla forma d'onda per scegliere una regione.</span>
      </div>

      <fieldset class="section">
        <legend>Operazioni</legend>
        <ol v-if="ops.length" class="ops">
          <li
            v-for="(op, i) in ops"
            :key="i"
            class="op"
            :aria-label="`Operazione ${i + 1}: ${opLabels[op.type]}`"
          >
            <div class="op__head">
              <strong>{{ opLabels[op.type] }}</strong>
              <span v-if="op.type === 'trim'" class="hint">
                {{ formatDuration(op.start) }}–{{ formatDuration(op.end) }}
              </span>
              <button
                type="button"
                class="chip"
                :aria-label="`Rimuovi ${opLabels[op.type]}`"
                @click="ops.splice(i, 1)"
              >
                ×
              </button>
            </div>
            <template v-if="op.type === 'eq'">
              <EqEditor v-model="op.spec" :mono="source.channels === 1" />
              <button type="button" class="button button--ghost button--small" @click="toggleEq(i)">
                {{ eqPreview === i ? 'Ferma ascolto EQ' : 'Ascolta con EQ' }}
              </button>
            </template>
            <div v-if="Object.keys(defsOf(op)).length" class="row">
              <ControlKnob
                v-for="(def, key) in defsOf(op)"
                :key="key"
                :model-value="values(op)[key] ?? def.default"
                :def="def"
                @update:model-value="values(op)[key] = $event"
              />
            </div>
          </li>
        </ol>
        <p v-else class="hint">Nessuna operazione: il nuovo clip sarebbe una copia.</p>
        <div class="row">
          <select v-model="newOp" class="field" aria-label="Operazione da aggiungere">
            <option value="">Aggiungi operazione…</option>
            <option
              v-for="type in opTypes"
              :key="type"
              :value="type"
              :disabled="type === 'trim' && !regionSeconds"
            >
              {{ opLabels[type] }}
            </option>
          </select>
          <button
            type="button"
            class="button button--ghost button--small"
            :disabled="!newOp"
            @click="addOp"
          >
            Aggiungi
          </button>
        </div>
      </fieldset>

      <p v-if="result" class="stats" aria-label="Analisi del risultato">
        Risultato: {{ formatDuration(result.duration) }} ·
        {{ result.channels.length === 1 ? 'mono' : 'stereo' }} · picco {{ formatDb(result.peak) }} ·
        RMS {{ formatDb(result.rms) }}
      </p>

      <div class="actions">
        <button type="button" class="button button--ghost" @click="toggleResult">
          {{ playing === 'result' ? 'Stop' : 'Ascolta risultato' }}
        </button>
        <input v-model="name" class="field actions__name" aria-label="Nome del nuovo clip" />
        <button type="button" class="button" :disabled="creating" @click="create">
          {{ creating ? 'Creazione…' : 'Crea nuovo clip' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.samples {
  display: grid;
  gap: var(--space-3);
  border-radius: var(--radius-sm);
  outline: 2px dashed transparent;
  outline-offset: 4px;
}

.samples--drop {
  outline-color: var(--color-accent);
}

.bar,
.row,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.bar__source {
  display: flex;
  flex: 1 1 12rem;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.bar__source select {
  flex: 1;
}

.empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.stats {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.region {
  display: inline-flex;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.link-button {
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
}

.section {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.section legend {
  padding-inline: var(--space-1);
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 700;
}

.ops {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.op {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.op__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.op__head strong {
  flex: 1;
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

.actions__name {
  flex: 1 1 8rem;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
