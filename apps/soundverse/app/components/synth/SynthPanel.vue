<script setup lang="ts">
import { unlockAudio } from '~/audio/context'
import { bufferToChannels } from '~/audio/decode'
import { playLive, type LiveVoice } from '~/audio/live'
import { renderOffline } from '~/audio/render'
import { synthVoice } from '~/synth/graph'
import {
  effectLabels,
  effectParams,
  filterLabels,
  noiseLabels,
  normalizeSpec,
  params,
  presets,
  waveformLabels,
  type Effect,
  type EffectType,
  type FilterType,
  type ParamDef,
} from '~/synth/spec'
import { useLibraryStore } from '~/stores/library'
import { MAX_OSCILLATORS, useSynthStore } from '~/stores/synth'

const synth = useSynthStore()
const library = useLibraryStore()

const playing = ref(false)
const saving = ref(false)
const newEffect = ref<EffectType | ''>('')
let voice: LiveVoice | null = null

const effectTypes = Object.keys(effectLabels) as EffectType[]
const filterValue = computed(() => synth.spec.filter?.type ?? 'off')

/** Le chiavi dei parametri di un effetto sono dinamiche: qui le trattiamo come un record numerico. */
const values = (effect: Effect) => effect as unknown as Record<string, number>
const defsOf = (effect: Effect) => effectParams[effect.type] as Record<string, ParamDef>

onBeforeUnmount(() => voice?.stop())

async function togglePlay() {
  if (playing.value) {
    voice?.stop()
    return
  }
  // Sincrono, dentro il click: poi si può attendere.
  const live = unlockAudio()
  playing.value = true
  const current = await playLive(synthVoice(synth.spec), live)
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
    const spec = normalizeSpec(synth.spec)
    const buffer = await renderOffline(synthVoice(spec))
    await library.add({
      name: synth.name,
      kind: 'synth',
      channels: bufferToChannels(buffer),
      recipe: { type: 'synth', spec },
    })
  } finally {
    saving.value = false
  }
}

function onFilterChange(event: Event) {
  synth.setFilter((event.target as HTMLSelectElement).value as FilterType | 'off')
}

function addEffect() {
  if (newEffect.value) synth.addEffect(newEffect.value)
  newEffect.value = ''
}

function onPreset(event: Event) {
  const select = event.target as HTMLSelectElement
  const preset = presets.find((p) => p.name === select.value)
  if (preset) synth.loadPreset(preset)
  select.value = ''
}
</script>

<template>
  <div class="synth">
    <div class="synth__bar">
      <select class="field" aria-label="Carica un preset" @change="onPreset">
        <option value="">Preset…</option>
        <option v-for="preset in presets" :key="preset.name" :value="preset.name">
          {{ preset.name }}
        </option>
      </select>
    </div>

    <fieldset class="section">
      <legend>Oscillatori</legend>
      <p v-if="synth.spec.oscillators.length === 0" class="section__empty">Nessun oscillatore.</p>
      <div
        v-for="(osc, i) in synth.spec.oscillators"
        :key="i"
        class="item"
        role="group"
        :aria-label="`Oscillatore ${i + 1}`"
      >
        <div class="item__head">
          <select v-model="osc.waveform" class="field row__select" aria-label="Forma d'onda">
            <option v-for="(label, value) in waveformLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <button
            type="button"
            class="icon-button"
            :aria-label="`Rimuovi oscillatore ${i + 1}`"
            @click="synth.removeOscillator(i)"
          >
            ×
          </button>
        </div>
        <div class="row">
          <ControlKnob v-model="osc.frequency" :def="params.frequency" />
          <ControlKnob v-model="osc.gain" :def="params.oscGain" />
          <ControlKnob v-model="osc.detune" :def="params.detune" />
        </div>
      </div>
      <button
        type="button"
        class="button button--ghost button--small"
        :disabled="synth.spec.oscillators.length >= MAX_OSCILLATORS"
        @click="synth.addOscillator()"
      >
        + Oscillatore
      </button>
    </fieldset>

    <fieldset class="section">
      <legend>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="synth.spec.noise !== null"
            @change="synth.setNoise(($event.target as HTMLInputElement).checked)"
          />
          Rumore
        </label>
      </legend>
      <div v-if="synth.spec.noise" class="row">
        <select v-model="synth.spec.noise.color" class="field row__select" aria-label="Colore">
          <option v-for="(label, value) in noiseLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <ControlKnob v-model="synth.spec.noise.gain" :def="params.noiseGain" />
        <span class="seed">
          Seed <strong>{{ synth.spec.noise.seed }}</strong>
          <button
            type="button"
            class="button button--ghost button--small"
            @click="synth.newNoiseSeed()"
          >
            Cambia
          </button>
        </span>
      </div>
    </fieldset>

    <fieldset class="section">
      <legend>Inviluppo</legend>
      <div class="row">
        <ControlKnob v-model="synth.spec.envelope.attack" :def="params.attack" />
        <ControlKnob v-model="synth.spec.envelope.decay" :def="params.decay" />
        <ControlKnob v-model="synth.spec.envelope.sustain" :def="params.sustain" />
        <ControlKnob v-model="synth.spec.envelope.release" :def="params.release" />
      </div>
    </fieldset>

    <fieldset class="section">
      <legend>Filtro</legend>
      <div class="row">
        <select
          class="field row__select"
          aria-label="Tipo di filtro"
          :value="filterValue"
          @change="onFilterChange"
        >
          <option value="off">Spento</option>
          <option v-for="(label, value) in filterLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
        <template v-if="synth.spec.filter">
          <ControlKnob v-model="synth.spec.filter.cutoff" :def="params.cutoff" />
          <ControlKnob v-model="synth.spec.filter.resonance" :def="params.resonance" />
        </template>
      </div>
    </fieldset>

    <fieldset class="section">
      <legend>Effetti</legend>
      <ol v-if="synth.spec.effects.length" class="effects">
        <li
          v-for="(effect, i) in synth.spec.effects"
          :key="i"
          class="item"
          :aria-label="`Effetto ${i + 1}: ${effectLabels[effect.type]}`"
        >
          <div class="item__head">
            <strong>{{ effectLabels[effect.type] }}</strong>
            <span class="effect__tools">
              <button
                type="button"
                class="icon-button"
                :aria-label="`Sposta ${effectLabels[effect.type]} prima`"
                :disabled="i === 0"
                @click="synth.moveEffect(i, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="icon-button"
                :aria-label="`Sposta ${effectLabels[effect.type]} dopo`"
                :disabled="i === synth.spec.effects.length - 1"
                @click="synth.moveEffect(i, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="icon-button"
                :aria-label="`Rimuovi ${effectLabels[effect.type]}`"
                @click="synth.removeEffect(i)"
              >
                ×
              </button>
            </span>
          </div>
          <div class="row">
            <ControlKnob
              v-for="(def, key) in defsOf(effect)"
              :key="key"
              :model-value="values(effect)[key] ?? def.default"
              :def="def"
              @update:model-value="values(effect)[key] = $event"
            />
          </div>
        </li>
      </ol>
      <div class="row">
        <select v-model="newEffect" class="field row__select" aria-label="Effetto da aggiungere">
          <option value="">Aggiungi effetto…</option>
          <option v-for="type in effectTypes" :key="type" :value="type">
            {{ effectLabels[type] }}
          </option>
        </select>
        <button
          type="button"
          class="button button--ghost button--small"
          :disabled="!newEffect"
          @click="addEffect"
        >
          Aggiungi
        </button>
      </div>
    </fieldset>

    <fieldset class="section">
      <legend>Uscita</legend>
      <div class="row">
        <ControlKnob v-model="synth.spec.duration" :def="params.duration" />
        <ControlKnob v-model="synth.spec.master" :def="params.master" />
      </div>
    </fieldset>

    <div class="synth__actions">
      <button type="button" class="button" @click="togglePlay">
        {{ playing ? 'Stop' : 'Ascolta' }}
      </button>
      <input v-model="synth.name" class="field synth__name" aria-label="Nome del suono" />
      <button type="button" class="button button--ghost" :disabled="saving" @click="save">
        {{ saving ? 'Salvataggio…' : 'Salva in libreria' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.synth {
  display: grid;
  gap: var(--space-3);
}

.synth__bar {
  display: flex;
  justify-content: flex-end;
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

.section__empty {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.row__select {
  flex: 1 1 8rem;
  max-width: 12rem;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.seed {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.effects {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.effect__tools {
  display: flex;
  gap: var(--space-1);
}

.icon-button {
  display: inline-grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

.synth__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.synth__name {
  flex: 1 1 8rem;
}
</style>
