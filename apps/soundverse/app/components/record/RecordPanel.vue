<script setup lang="ts">
import { analyze, MIN_ANALYSIS_SECONDS } from '~/analysis/analyze'
import { SAMPLE_RATE } from '~/audio/constants'
import { unlockAudio } from '~/audio/context'
import { ensureWorklets } from '~/audio/worklets'
import {
  collapseMono,
  countInSeconds,
  joinChunks,
  meterLevel,
  peakDb,
  type Chunk,
} from '~/record/take'
import type { ParamDef } from '~/synth/spec'
import { useLibraryStore } from '~/stores/library'
import { formatDuration } from '~/utils/format'

type Status = 'off' | 'starting' | 'ready' | 'countin' | 'recording' | 'saving' | 'denied'

const library = useLibraryStore()
const bpmDef: ParamDef = { label: 'BPM', unit: '', min: 40, max: 240, step: 1, default: 120 }

const status = ref<Status>('off')
const devices = ref<MediaDeviceInfo[]>([])
const deviceId = ref('')
const level = ref(-Infinity)
const elapsed = ref(0)
const countIn = ref(0)
const bpm = ref(120)
const countdown = ref(0)
const name = ref('Registrazione')
const error = ref<string | null>(null)

let stream: MediaStream | null = null
let source: MediaStreamAudioSourceNode | null = null
let recorder: AudioWorkletNode | null = null
let analyser: AnalyserNode | null = null
let sink: GainNode | null = null
let chunks: Chunk[] = []
let frame = 0
let countTimer: ReturnType<typeof setTimeout> | undefined

// Si decide dopo il montaggio: il server non sa niente del microfono, e la prima resa deve
// coincidere con la sua (altrimenti l'idratazione non torna).
/** `null` finché non si sa (sul server e prima del montaggio). */
const supported = ref<boolean | null>(null)
onMounted(() => (supported.value = !!navigator.mediaDevices?.getUserMedia))
const deviceLabel = computed(
  () => devices.value.find((d) => d.deviceId === deviceId.value)?.label || 'Ingresso predefinito',
)

onBeforeUnmount(() => close())

/** Attiva l'ingresso scelto. Il contesto si sblocca nel click, poi si chiede il permesso. */
async function open() {
  const { context, master } = unlockAudio()
  close()
  status.value = 'starting'
  error.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId.value && { deviceId: { exact: deviceId.value } }),
        // Per la musica serve il segnale grezzo: niente elaborazioni pensate per le telefonate.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
    })
  } catch (cause) {
    status.value = 'denied'
    error.value = 'Il browser non ha dato accesso al microfono. Controlla i permessi del sito.'
    console.error(cause)
    return
  }
  await ensureWorklets(context)
  devices.value = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'audioinput',
  )
  deviceId.value ||= stream.getAudioTracks()[0]?.getSettings().deviceId ?? ''

  source = context.createMediaStreamSource(stream)
  analyser = context.createAnalyser()
  analyser.fftSize = 2048
  recorder = new AudioWorkletNode(context, 'sv-recorder', {
    channelCount: 2,
    channelCountMode: 'explicit',
  })
  recorder.port.onmessage = (event: MessageEvent<Chunk>) => {
    chunks.push(event.data)
    elapsed.value += (event.data[0]?.length ?? 0) / SAMPLE_RATE
  }
  // Registratore e misuratore devono arrivare all'uscita per essere eseguiti: vanno a un guadagno zero
  // (niente ascolto diretto, eviterebbe l'effetto Larsen con gli altoparlanti).
  sink = context.createGain()
  sink.gain.value = 0
  source.connect(analyser).connect(sink)
  source.connect(recorder).connect(sink)
  sink.connect(master)
  status.value = 'ready'
  meter()
}

let lastFrame = 0

function meter(now = performance.now()) {
  const node = analyser
  if (!node) return
  const data = new Float32Array(node.fftSize)
  node.getFloatTimeDomainData(data)
  const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0
  lastFrame = now
  level.value = meterLevel(level.value, peakDb(data), elapsed)
  frame = requestAnimationFrame(meter)
}

function close() {
  cancelAnimationFrame(frame)
  clearTimeout(countTimer)
  stream?.getTracks().forEach((t) => t.stop())
  source?.disconnect()
  recorder?.disconnect()
  sink?.disconnect()
  stream = null
  source = null
  recorder = null
  sink = null
  analyser = null
  level.value = -Infinity
  if (status.value !== 'denied') status.value = 'off'
}

function start() {
  if (!recorder) return
  chunks = []
  elapsed.value = 0
  const seconds = countInSeconds(countIn.value, bpm.value)
  if (seconds > 0) {
    status.value = 'countin'
    clickCountIn(seconds)
    countdown.value = Math.ceil(seconds)
    const tick = setInterval(() => (countdown.value = Math.max(0, countdown.value - 1)), 1000)
    countTimer = setTimeout(() => {
      clearInterval(tick)
      beginRecording()
    }, seconds * 1000)
  } else {
    beginRecording()
  }
}

function beginRecording() {
  recorder?.port.postMessage({ recording: true })
  status.value = 'recording'
}

/** Il metronomo del conteggio: un clic per battito, più acuto sul primo di ogni battuta. */
function clickCountIn(seconds: number) {
  const { context, master } = unlockAudio()
  const beat = 60 / bpm.value
  const start = context.currentTime + 0.05
  for (let i = 0; i * beat < seconds - 1e-6; i++) {
    const at = start + i * beat
    const osc = context.createOscillator()
    osc.frequency.value = i % 4 === 0 ? 1760 : 1320
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.3, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + 0.06)
  }
}

async function stop() {
  clearTimeout(countTimer)
  if (status.value === 'countin') {
    status.value = 'ready'
    return
  }
  recorder?.port.postMessage({ recording: false })
  status.value = 'saving'
  // Gli ultimi blocchi possono essere ancora in viaggio dal worklet.
  await new Promise((resolve) => setTimeout(resolve, 60))
  const channels = collapseMono(joinChunks(chunks))
  chunks = []
  const duration = (channels[0]?.length ?? 0) / SAMPLE_RATE
  if (duration > 0) {
    await library.add({
      name: name.value,
      kind: 'sample',
      channels,
      recipe: { type: 'recording', device: deviceLabel.value },
      ...(duration >= MIN_ANALYSIS_SECONDS && { analysis: analyze(channels) }),
    })
  }
  status.value = 'ready'
}

async function onDevice() {
  if (status.value !== 'off' && status.value !== 'denied') await open()
}

const meterWidth = computed(() => `${Math.max(0, Math.min(1, (level.value + 60) / 60)) * 100}%`)
const levelText = computed(() =>
  Number.isFinite(level.value) ? `${level.value.toFixed(1)} dBFS` : '−∞',
)
</script>

<template>
  <div class="record">
    <p v-if="supported === false" class="hint">
      Questo browser non permette di registrare dal microfono.
    </p>

    <template v-else-if="supported">
      <div class="row">
        <button
          v-if="status === 'off' || status === 'denied'"
          type="button"
          class="button"
          @click="open"
        >
          Attiva ingresso
        </button>
        <button v-else type="button" class="button button--ghost button--small" @click="close">
          Disattiva
        </button>
        <select
          v-if="devices.length"
          v-model="deviceId"
          class="field"
          aria-label="Ingresso audio"
          @change="onDevice"
        >
          <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || 'Ingresso senza nome' }}
          </option>
        </select>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <template v-if="status !== 'off' && status !== 'denied'">
        <div
          class="meter"
          role="meter"
          aria-label="Livello d'ingresso"
          :aria-valuetext="levelText"
          aria-valuemin="-60"
          aria-valuemax="0"
          :aria-valuenow="Number.isFinite(level) ? Math.round(level) : -60"
        >
          <div
            class="meter__bar"
            :class="{ 'meter__bar--hot': level > -1 }"
            :style="{ width: meterWidth }"
          />
        </div>
        <p class="hint">{{ levelText }}</p>

        <div class="row">
          <label class="field-label">
            Conteggio
            <select v-model.number="countIn" class="field" aria-label="Battute di conteggio">
              <option :value="0">nessuno</option>
              <option :value="1">1 battuta</option>
              <option :value="2">2 battute</option>
            </select>
          </label>
          <ControlKnob v-if="countIn > 0" v-model="bpm" :def="bpmDef" />
          <input v-model="name" class="field name" aria-label="Nome della registrazione" />
        </div>

        <div class="row">
          <button v-if="status === 'ready'" type="button" class="button rec" @click="start">
            ● Registra
          </button>
          <button
            v-else-if="status === 'countin' || status === 'recording'"
            type="button"
            class="button"
            @click="stop"
          >
            ■ Stop
          </button>
          <span class="status" aria-live="polite">
            <template v-if="status === 'countin'">Conteggio… {{ countdown }}</template>
            <template v-else-if="status === 'recording'"
              >In registrazione · {{ formatDuration(elapsed) }}</template
            >
            <template v-else-if="status === 'saving'">Salvataggio…</template>
            <template v-else-if="status === 'starting'">Attivazione…</template>
          </span>
        </div>
        <p class="hint">Senza ascolto diretto: usa le cuffie se vuoi sentirti mentre suoni.</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.record {
  display: grid;
  gap: var(--space-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.meter {
  height: 0.75rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-2);
}

.meter__bar {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #eab308 75%, #ef4444);
  transition: width 60ms linear;
}

.meter__bar--hot {
  background: var(--color-danger);
}

.field-label {
  display: grid;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.name {
  flex: 1 1 8rem;
}

.rec {
  background: var(--color-danger);
  color: #fff;
}

.status {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
