<script setup lang="ts">
import { SAMPLE_RATE } from '~/audio/constants'
import { unlockAudio } from '~/audio/context'
import { bufferToChannels } from '~/audio/decode'
import {
  beatSlices,
  detectTransients,
  gridSlices,
  mixDown,
  normalizeMarkers,
  slicesFrom,
} from '~/chop/slices'
import { BANKS, padIndex, type Bank } from '~/pads/kit'
import { applyOps, type SampleOp } from '~/samples/ops'
import type { ParamDef } from '~/synth/spec'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'
import { formatDuration } from '~/utils/format'

type Mode = 'transients' | 'grid' | 'beats'

const library = useLibraryStore()
const pads = usePadsStore()

const params = {
  sensitivity: { label: 'Sensibilità', unit: '', min: 0, max: 1, step: 0.01, default: 0.6 },
  minGap: { label: 'Distanza', unit: 's', min: 0.01, max: 1, log: true, step: 0.01, default: 0.05 },
  count: { label: 'Fette', unit: '', min: 2, max: 64, step: 1, default: 8 },
  beats: { label: 'Battiti', unit: '', min: 0.25, max: 8, step: 0.25, default: 1 },
  bpm: { label: 'BPM', unit: '', min: 40, max: 240, step: 0.1, default: 120 },
  fade: { label: 'Fade', unit: 's', min: 0, max: 0.05, step: 0.001, default: 0.003 },
} satisfies Record<string, ParamDef>

const sourceId = ref<string | null>(null)
const mode = ref<Mode>('transients')
const sensitivity = ref(params.sensitivity.default)
const minGap = ref(params.minGap.default)
const count = ref(params.count.default)
const beats = ref(params.beats.default)
const bpm = ref(params.bpm.default)
const fade = ref(params.fade.default)
const markers = ref<number[]>([0])
const assign = ref(true)
const bank = ref<Bank>('A')
const creating = ref(false)
const overlay = useTemplateRef<HTMLDivElement>('overlay')
let channels: Float32Array[] | null = null
let mono: Float32Array | null = null
let playing: AudioBufferSourceNode | null = null

const source = computed(() => library.clips.find((c) => c.id === sourceId.value) ?? null)
const clips = computed(() => [...library.clips].sort((a, b) => b.createdAt - a.createdAt))
/** Lunghezza della sorgente in campioni: un ref, perché `channels` non è reattivo. */
const length = ref(0)
const slices = computed(() => slicesFrom(markers.value, length.value))

watch(sourceId, async (id) => {
  channels = null
  mono = null
  length.value = 0
  markers.value = [0]
  if (!id) return
  const buffer = await library.getBuffer(id)
  if (sourceId.value !== id) return
  channels = bufferToChannels(buffer)
  mono = mixDown(channels)
  length.value = mono.length
  bpm.value = source.value?.analysis?.bpm ?? params.bpm.default
  detect()
})

// Cambiando modo o parametri si taglia di nuovo (le modifiche a mano ai marcatori si perdono).
watch([mode, sensitivity, minGap, count, beats, bpm], () => detect())

function detect() {
  if (!mono) return
  if (mode.value === 'transients')
    markers.value = detectTransients(mono, sensitivity.value, minGap.value)
  else if (mode.value === 'grid') markers.value = gridSlices(mono.length, count.value)
  else markers.value = beatSlices(mono.length, bpm.value, beats.value)
}

const fraction = (sample: number) => (length.value ? sample / length.value : 0)

function sampleAt(clientX: number): number {
  const rect = overlay.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return 0
  return Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * length.value)
}

let dragging: number | null = null

function onMarkerDown(event: PointerEvent, index: number) {
  event.stopPropagation()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging = index
}

function onMarkerMove(event: PointerEvent, index: number) {
  if (dragging !== index) return
  const next = [...markers.value]
  next[index] = sampleAt(event.clientX)
  markers.value = next
}

function onMarkerUp() {
  if (dragging === null) return
  dragging = null
  markers.value = normalizeMarkers(markers.value, length.value)
}

/** Da tastiera: frecce ±1 ms (Maiusc ±10 ms), Canc toglie il taglio. */
function onMarkerKey(event: KeyboardEvent, index: number) {
  const step = Math.round((event.shiftKey ? 0.01 : 0.001) * SAMPLE_RATE)
  const next = [...markers.value]
  if (event.key === 'ArrowRight') next[index] = (next[index] ?? 0) + step
  else if (event.key === 'ArrowLeft') next[index] = (next[index] ?? 0) - step
  else if (event.key === 'Delete' || event.key === 'Backspace') next.splice(index, 1)
  else return
  event.preventDefault()
  markers.value = normalizeMarkers(next, length.value)
}

/** Doppio click sulla forma d'onda: un taglio nuovo in quel punto. */
function onOverlayDblClick(event: MouseEvent) {
  markers.value = normalizeMarkers([...markers.value, sampleAt(event.clientX)], length.value)
}

async function audition(start: number, end: number) {
  const { context, master } = unlockAudio()
  const clip = source.value
  if (!clip) return
  const buffer = await library.getBuffer(clip.id)
  playing?.stop()
  const node = context.createBufferSource()
  node.buffer = buffer
  node.connect(master)
  node.start(0, start / SAMPLE_RATE, (end - start) / SAMPLE_RATE)
  playing = node
}

async function createSlices() {
  const clip = source.value
  if (!clip || !channels) return
  creating.value = true
  try {
    const made: string[] = []
    for (const [i, [start, end]] of slices.value.entries()) {
      const ops: SampleOp[] = [
        { type: 'trim', start: start / SAMPLE_RATE, end: end / SAMPLE_RATE },
        { type: 'fade', fadeIn: fade.value, fadeOut: fade.value },
      ]
      const created = await library.add({
        name: `${clip.name} ${i + 1}`,
        kind: 'sample',
        channels: applyOps(channels, ops),
        recipe: { type: 'sample', sourceId: clip.id, sourceName: clip.name, ops },
      })
      made.push(created.id)
    }
    if (assign.value) {
      made.slice(0, 16).forEach((id, i) => {
        const pad = pads.kit.pads[padIndex(bank.value, i + 1)]
        if (pad) pad.clipId = id
      })
    }
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="chop">
    <select v-model="sourceId" class="field" aria-label="Campione da tagliare">
      <option :value="null">Scegli un campione…</option>
      <option v-for="c in clips" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>

    <template v-if="source">
      <div class="row" role="group" aria-label="Modo di taglio">
        <button
          type="button"
          class="chip"
          :aria-pressed="mode === 'transients'"
          @click="mode = 'transients'"
        >
          Transitori
        </button>
        <button type="button" class="chip" :aria-pressed="mode === 'grid'" @click="mode = 'grid'">
          Griglia
        </button>
        <button type="button" class="chip" :aria-pressed="mode === 'beats'" @click="mode = 'beats'">
          A tempo
        </button>
      </div>

      <div class="row">
        <template v-if="mode === 'transients'">
          <ControlKnob v-model="sensitivity" :def="params.sensitivity" />
          <ControlKnob v-model="minGap" :def="params.minGap" />
        </template>
        <ControlKnob v-else-if="mode === 'grid'" v-model="count" :def="params.count" />
        <template v-else>
          <ControlKnob v-model="bpm" :def="params.bpm" />
          <ControlKnob v-model="beats" :def="params.beats" />
        </template>
        <ControlKnob v-model="fade" :def="params.fade" />
      </div>

      <div class="wave">
        <AudioWaveform :peaks="source.peaks" :label="`Forma d'onda di ${source.name}`" />
        <div ref="overlay" class="markers" data-testid="chop-overlay" @dblclick="onOverlayDblClick">
          <button
            v-for="(m, i) in markers"
            :key="i"
            type="button"
            class="marker"
            :class="{ 'marker--start': m === 0 }"
            role="slider"
            :aria-label="`Taglio ${i + 1}`"
            :aria-valuemin="0"
            :aria-valuemax="length / SAMPLE_RATE"
            :aria-valuenow="Math.round((m / SAMPLE_RATE) * 1000) / 1000"
            :aria-valuetext="formatDuration(m / SAMPLE_RATE)"
            :disabled="m === 0"
            :style="{ left: `${fraction(m) * 100}%` }"
            @pointerdown="onMarkerDown($event, i)"
            @pointermove="onMarkerMove($event, i)"
            @pointerup="onMarkerUp"
            @keydown="onMarkerKey($event, i)"
          />
        </div>
      </div>
      <p class="hint">Trascina i tagli · doppio click per aggiungerne uno · Canc per toglierlo</p>

      <ol class="slices" aria-label="Fette">
        <li v-for="([start, end], i) in slices" :key="start">
          <button type="button" class="slice" @click="audition(start, end)">
            <strong>{{ i + 1 }}</strong>
            {{ formatDuration(start / SAMPLE_RATE) }}–{{ formatDuration(end / SAMPLE_RATE) }}
          </button>
        </li>
      </ol>

      <div class="row">
        <label class="toggle">
          <input v-model="assign" type="checkbox" />
          Assegna ai pad del banco
        </label>
        <select v-model="bank" class="field" aria-label="Banco di destinazione" :disabled="!assign">
          <option v-for="b in BANKS" :key="b" :value="b">{{ b }}</option>
        </select>
        <button type="button" class="button" :disabled="creating" @click="createSlices">
          {{ creating ? 'Creazione…' : `Crea ${slices.length} fette` }}
        </button>
      </div>
    </template>

    <p v-else class="hint">Scegli un campione della libreria per tagliarlo in fette.</p>
  </div>
</template>

<style scoped>
.chop {
  display: grid;
  gap: var(--space-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.chip {
  height: 2rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}

.wave {
  position: relative;
}

.markers {
  position: absolute;
  inset: 0;
}

.marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translateX(-50%);
  cursor: ew-resize;
  touch-action: none;
}

.marker::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--color-accent-2);
  transform: translateX(-50%);
}

.marker--start {
  cursor: default;
}

.marker:focus-visible::after {
  width: 4px;
}

.slices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.slice {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  cursor: pointer;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}
</style>
