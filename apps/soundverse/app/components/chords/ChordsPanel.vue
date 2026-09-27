<script setup lang="ts">
import { unlockAudio } from '~/audio/context'
import { bufferToChannels } from '~/audio/decode'
import { playLive, type LiveVoice } from '~/audio/live'
import { renderOffline } from '~/audio/render'
import { chordsOf, keyName, progressionVoice } from '~/chords/progression'
import { chordName, NOTE_NAMES, progressionPresets, roman } from '~/chords/theory'
import type { ParamDef } from '~/synth/spec'
import { presets as synthPresets } from '~/synth/spec'
import { chordSound, useChordsStore } from '~/stores/chords'
import { useLibraryStore } from '~/stores/library'
import { useSynthStore } from '~/stores/synth'

const chords = useChordsStore()
const library = useLibraryStore()
const synth = useSynthStore()

const playing = ref(false)
const saving = ref(false)
const soundChoice = ref('Piano elettrico')
let voice: LiveVoice | null = null

const params = {
  bpm: { label: 'BPM', unit: '', min: 40, max: 200, step: 1, default: 100 },
  beats: { label: 'Battiti', unit: '', min: 1, max: 8, step: 1, default: 4 },
  octave: { label: 'Ottava', unit: '', min: 2, max: 6, step: 1, default: 4 },
  master: { label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 },
  length: { label: 'Accordi', unit: '', min: 2, max: 8, step: 1, default: 4 },
} satisfies Record<string, ParamDef>

const chordList = computed(() => chordsOf(chords.spec))
const length = computed({
  get: () => chords.spec.degrees.length,
  set: (n: number) => {
    const degrees = chords.spec.degrees
    chords.spec.degrees = Array.from(
      { length: n },
      (_, i) => degrees[i] ?? degrees[i % degrees.length] ?? 1,
    )
  },
})

function onSound(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  soundChoice.value = value
  if (value === 'Piano elettrico') chords.spec.sound = chordSound()
  else if (value === 'Synth attuale') chords.spec.sound = structuredClone(toRaw(synth.spec))
  else {
    const preset = synthPresets.find((p) => p.name === value)
    if (preset) chords.spec.sound = preset.spec()
  }
}

function onPreset(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) chords.usePreset(select.value)
  select.value = ''
}

function setDegree(index: number, event: Event) {
  chords.spec.degrees[index] = Number((event.target as HTMLSelectElement).value)
}

onBeforeUnmount(() => voice?.stop())

async function togglePlay() {
  if (playing.value) {
    voice?.stop()
    return
  }
  const live = unlockAudio()
  playing.value = true
  const current = await playLive(progressionVoice(structuredClone(toRaw(chords.spec))), live)
  voice = current
  await current.done
  if (voice === current) {
    voice = null
    playing.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const spec = structuredClone(toRaw(chords.spec))
    const rendered = await renderOffline(progressionVoice(spec))
    await library.add({
      name: chords.name,
      kind: 'synth',
      channels: bufferToChannels(rendered),
      recipe: { type: 'chords', spec },
      analysis: { bpm: spec.bpm, key: keyName(spec) },
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="chords">
    <div class="row">
      <select v-model.number="chords.spec.tonic" class="field" aria-label="Tonica">
        <option v-for="(name, i) in NOTE_NAMES" :key="name" :value="i">{{ name }}</option>
      </select>
      <select v-model="chords.spec.mode" class="field" aria-label="Modo">
        <option value="major">maggiore</option>
        <option value="minor">minore</option>
      </select>
      <select class="field" aria-label="Progressione" @change="onPreset">
        <option value="">Progressione…</option>
        <option v-for="p in progressionPresets" :key="p.name" :value="p.name">{{ p.name }}</option>
      </select>
      <button type="button" class="button button--ghost button--small" @click="chords.randomize()">
        Casuale
      </button>
    </div>

    <ol class="progression" aria-label="Accordi della progressione">
      <li v-for="(chord, i) in chordList" :key="i" class="chord">
        <select
          class="field chord__degree"
          :value="chord.degree"
          :aria-label="`Grado dell'accordo ${i + 1}`"
          @change="setDegree(i, $event)"
        >
          <option v-for="d in 7" :key="d" :value="d">{{ d }}</option>
        </select>
        <strong class="chord__name">{{ chordName(chord) }}</strong>
        <span class="chord__roman">{{ roman(chord) }}</span>
      </li>
    </ol>

    <div class="row">
      <ControlKnob v-model="length" :def="params.length" />
      <ControlKnob v-model="chords.spec.bpm" :def="params.bpm" />
      <ControlKnob v-model="chords.spec.beatsPerChord" :def="params.beats" />
      <ControlKnob v-model="chords.spec.octave" :def="params.octave" />
      <ControlKnob v-model="chords.spec.master" :def="params.master" />
    </div>

    <div class="row">
      <label class="toggle">
        <input v-model="chords.spec.sevenths" type="checkbox" />
        Settime
      </label>
      <label class="toggle">
        <input v-model="chords.spec.bass" type="checkbox" />
        Basso
      </label>
      <select class="field" aria-label="Suono" :value="soundChoice" @change="onSound">
        <option>Piano elettrico</option>
        <option v-for="p in synthPresets" :key="p.name">{{ p.name }}</option>
        <option>Synth attuale</option>
      </select>
    </div>

    <p class="hint">{{ keyName(chords.spec) }} · seed {{ chords.seed }}</p>

    <div class="row">
      <button type="button" class="button" @click="togglePlay">
        {{ playing ? 'Stop' : 'Ascolta' }}
      </button>
      <input v-model="chords.name" class="field name" aria-label="Nome della progressione" />
      <button type="button" class="button button--ghost" :disabled="saving" @click="save">
        {{ saving ? 'Salvataggio…' : 'Salva in libreria' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.chords {
  display: grid;
  gap: var(--space-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.progression {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chord {
  display: grid;
  justify-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.chord__degree {
  width: 3.5rem;
  padding: var(--space-1);
  text-align: center;
}

.chord__name {
  font-size: var(--text-lg);
}

.chord__roman {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.name {
  flex: 1 1 8rem;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
