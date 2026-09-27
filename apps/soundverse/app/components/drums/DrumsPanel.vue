<script setup lang="ts">
import { SAMPLE_RATE } from '~/audio/constants'
import { unlockAudio } from '~/audio/context'
import { renderOffline } from '~/audio/render'
import {
  drumParams,
  foldTail,
  MAX_BARS,
  patternLength,
  patternVoice,
  STEPS_PER_BAR,
  VELOCITY_ACCENT,
} from '~/drums/pattern'
import { DrumSequencer } from '~/drums/sequencer'
import { voiceIds, voiceLabels, type DrumVoiceId } from '~/drums/voices'
import { useDrumsStore } from '~/stores/drums'
import { useLibraryStore } from '~/stores/library'

const drums = useDrumsStore()
const library = useLibraryStore()

const playing = ref(false)
const saving = ref(false)
const currentStep = ref<number | null>(null)
const newVoice = ref<DrumVoiceId | ''>('')
let sequencer: DrumSequencer | null = null
let frame = 0

const stepsInBar = Array.from({ length: STEPS_PER_BAR }, (_, i) => i)
const barOptions = Array.from({ length: MAX_BARS }, (_, i) => i + 1)
const availableVoices = computed(() => voiceIds.filter((id) => !drums.usedVoices.has(id)))
/** Il passo in riproduzione, se cade nella battuta mostrata (0..15). */
const playheadInBar = computed(() => {
  const step = currentStep.value
  if (step === null || Math.floor(step / STEPS_PER_BAR) !== drums.bar) return null
  return step % STEPS_PER_BAR
})

function velocityOf(trackIndex: number, step: number) {
  return drums.pattern.tracks[trackIndex]?.steps[drums.bar * STEPS_PER_BAR + step] ?? 0
}

function stepState(velocity: number) {
  if (velocity <= 0) return 'spento'
  return velocity >= VELOCITY_ACCENT ? 'accento' : 'acceso'
}

function follow() {
  currentStep.value = sequencer?.currentStep() ?? null
  frame = requestAnimationFrame(follow)
}

function play() {
  // Sincrono, dentro il gesto (click o barra spaziatrice).
  const { context, master } = unlockAudio()
  sequencer ??= new DrumSequencer(context, master, () => drums.pattern)
  sequencer.start()
  playing.value = true
  cancelAnimationFrame(frame)
  follow()
}

function stop() {
  sequencer?.stop()
  playing.value = false
  cancelAnimationFrame(frame)
  currentStep.value = null
}

function togglePlay() {
  if (playing.value) stop()
  else play()
}

/** Barra spaziatrice = play/stop, tranne quando si sta scrivendo o si usa un menu. */
function onKeydown(event: KeyboardEvent) {
  if (event.code !== 'Space' || event.repeat) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  event.preventDefault()
  togglePlay()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  stop()
})

async function save() {
  saving.value = true
  try {
    const pattern = structuredClone(toRaw(drums.pattern))
    const rendered = await renderOffline(patternVoice(pattern))
    const length = Math.round(patternLength(pattern) * SAMPLE_RATE)
    await library.add({
      name: drums.name,
      kind: 'drums',
      channels: [foldTail(rendered.getChannelData(0), length)],
      recipe: { type: 'drums', pattern },
    })
  } finally {
    saving.value = false
  }
}

function onBars(event: Event) {
  drums.setBars(Number((event.target as HTMLSelectElement).value))
}

function addVoice() {
  if (newVoice.value) drums.addTrack(newVoice.value)
  newVoice.value = ''
}
</script>

<template>
  <div class="drums">
    <div class="transport">
      <button type="button" class="button" :aria-pressed="playing" @click="togglePlay">
        {{ playing ? 'Stop' : 'Play' }}
      </button>
      <ControlKnob v-model="drums.pattern.bpm" :def="drumParams.bpm" />
      <ControlKnob v-model="drums.pattern.swing" :def="drumParams.swing" />
      <ControlKnob v-model="drums.pattern.master" :def="drumParams.master" />
      <label class="bars">
        Battute
        <select class="field" :value="drums.pattern.bars" @change="onBars">
          <option v-for="n in barOptions" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
    </div>

    <div
      v-if="drums.pattern.bars > 1"
      class="bar-switch"
      role="group"
      aria-label="Battuta da modificare"
    >
      <button
        v-for="n in drums.pattern.bars"
        :key="n"
        type="button"
        class="bar-switch__button"
        :aria-pressed="drums.bar === n - 1"
        @click="drums.bar = n - 1"
      >
        {{ n }}
      </button>
    </div>

    <ul class="tracks" aria-label="Tracce">
      <li
        v-for="(track, t) in drums.pattern.tracks"
        :key="track.voice"
        class="track"
        :class="{ 'track--muted': track.muted }"
        :aria-label="voiceLabels[track.voice]"
      >
        <div class="track__head">
          <strong class="track__name">{{ voiceLabels[track.voice] }}</strong>
          <ControlKnob
            v-model="track.gain"
            :def="drumParams.gain"
            :aria-label="`Volume ${voiceLabels[track.voice]}`"
          />
          <ControlKnob
            v-model="track.tune"
            :def="drumParams.tune"
            :aria-label="`Tono ${voiceLabels[track.voice]}`"
          />
          <span class="track__tools">
            <button
              type="button"
              class="chip"
              :aria-pressed="track.muted"
              :aria-label="`Muto ${voiceLabels[track.voice]}`"
              @click="track.muted = !track.muted"
            >
              M
            </button>
            <button
              type="button"
              class="chip"
              :aria-label="`Pulisci ${voiceLabels[track.voice]}`"
              @click="drums.clearTrack(t)"
            >
              ⌫
            </button>
            <button
              type="button"
              class="chip"
              :aria-label="`Rimuovi ${voiceLabels[track.voice]}`"
              @click="drums.removeTrack(t)"
            >
              ×
            </button>
          </span>
        </div>
        <div class="steps">
          <button
            v-for="s in stepsInBar"
            :key="s"
            type="button"
            class="step"
            :class="{
              'step--beat': s % 4 === 0,
              'step--current': playheadInBar === s,
            }"
            :data-velocity="stepState(velocityOf(t, s))"
            :aria-pressed="velocityOf(t, s) > 0"
            :aria-label="`${voiceLabels[track.voice]} passo ${s + 1}: ${stepState(velocityOf(t, s))}`"
            @click="drums.toggleStep(t, s)"
          />
        </div>
      </li>
    </ul>

    <div v-if="availableVoices.length" class="add">
      <select v-model="newVoice" class="field" aria-label="Voce da aggiungere">
        <option value="">Aggiungi voce…</option>
        <option v-for="id in availableVoices" :key="id" :value="id">{{ voiceLabels[id] }}</option>
      </select>
      <button
        type="button"
        class="button button--ghost button--small"
        :disabled="!newVoice"
        @click="addVoice"
      >
        Aggiungi
      </button>
    </div>

    <p class="hint">Barra spaziatrice: play/stop · Click su un passo: acceso → accento → spento</p>

    <div class="actions">
      <input v-model="drums.name" class="field actions__name" aria-label="Nome del pattern" />
      <button type="button" class="button button--ghost" :disabled="saving" @click="save">
        {{ saving ? 'Salvataggio…' : 'Salva in libreria' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.drums {
  display: grid;
  gap: var(--space-3);
}

.transport,
.add,
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.bars {
  display: grid;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.bar-switch {
  display: flex;
  gap: var(--space-1);
}

.bar-switch__button,
.chip {
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-sm);
  cursor: pointer;
}

.bar-switch__button[aria-pressed='true'],
.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}

.tracks {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.track {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.track--muted .steps {
  opacity: 0.4;
}

.track__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.track__name {
  flex: 1 1 6rem;
  font-size: var(--text-sm);
}

.track__tools {
  display: flex;
  gap: var(--space-1);
}

.steps {
  display: grid;
  grid-template-columns: repeat(16, minmax(0, 1fr));
  gap: 3px;
}

.step {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  background: var(--color-bg);
  cursor: pointer;
}

.step--beat {
  border-color: color-mix(in srgb, var(--color-muted) 55%, var(--color-border));
}

.step[data-velocity='acceso'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 55%, var(--color-bg));
}

.step[data-velocity='accento'] {
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.step--current {
  outline: 2px solid var(--color-text);
  outline-offset: 1px;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.actions__name {
  flex: 1 1 8rem;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
