<script setup lang="ts">
import { noteName } from '~/pads/levels'
import { knobLabel } from '~/midi/knobs'
import { padName } from '~/pads/kit'
import { useMidiStore } from '~/stores/midi'
import { usePadsStore } from '~/stores/pads'

const midi = useMidiStore()
const pads = usePadsStore()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  midi.load()
  timer = setInterval(() => (now.value = Date.now()), 100)
})
onBeforeUnmount(() => clearInterval(timer))

const baseNotes = [24, 36, 48, 60]
const learnedNotes = computed(() =>
  Object.entries(midi.learnedNotes).map(([note, pad]) => ({ note: Number(note), pad })),
)
const ccs = computed(() => Object.entries(midi.ccMap))

function learnPad() {
  midi.learnPad = pads.selected
  midi.learning = midi.learning === 'pad' ? null : 'pad'
}

function learnKnob() {
  midi.learning = midi.learning === 'knob' ? null : 'knob'
}

function onBase(event: Event) {
  midi.baseNote = Number((event.target as HTMLSelectElement).value)
  midi.persist()
}
</script>

<template>
  <div class="midi">
    <template v-if="midi.status === 'unsupported'">
      <p class="hint" role="status">
        Questo browser non supporta il MIDI (Web MIDI). Funziona con Chrome, Edge e Firefox, non con
        Safari.
      </p>
    </template>

    <template v-else-if="midi.status !== 'ready'">
      <button
        type="button"
        class="button"
        :disabled="midi.status === 'connecting'"
        @click="midi.connect()"
      >
        {{ midi.status === 'connecting' ? 'Collegamento…' : 'Collega MIDI' }}
      </button>
      <p v-if="midi.status === 'denied'" class="error" role="alert">
        Il browser non ha dato accesso al MIDI. Controlla i permessi del sito.
      </p>
    </template>

    <template v-else>
      <ul class="inputs" aria-label="Ingressi MIDI">
        <li v-if="!midi.inputs.length" class="hint">Nessun controller collegato.</li>
        <li v-for="input in midi.inputs" :key="input.id" class="input">
          <span
            class="led"
            :class="{ 'led--on': now - (midi.activity[input.id] ?? 0) < 200 }"
            aria-hidden="true"
          />
          {{ input.name }}
        </li>
      </ul>
      <p class="hint" aria-live="polite">{{ midi.lastMessage || 'In attesa di messaggi…' }}</p>

      <label class="field-label">
        Pad A1 sulla nota
        <select class="field" aria-label="Nota del pad A1" :value="midi.baseNote" @change="onBase">
          <option v-for="n in baseNotes" :key="n" :value="n">{{ noteName(n) }} ({{ n }})</option>
        </select>
      </label>

      <div class="row">
        <button
          type="button"
          class="button button--ghost button--small"
          :aria-pressed="midi.learning === 'pad'"
          @click="learnPad"
        >
          Impara pad
        </button>
        <button
          type="button"
          class="button button--ghost button--small"
          :aria-pressed="midi.learning === 'knob'"
          @click="learnKnob"
        >
          Impara manopola
        </button>
      </div>
      <p v-if="midi.learning === 'pad'" class="learn" role="status">
        Suona una nota sul controller: andrà al pad {{ padName(midi.learnPad) }}.
      </p>
      <p v-else-if="midi.learning === 'knob'" class="learn" role="status">
        Tocca una manopola dell'app, poi muovi un controllo sul controller.
      </p>

      <ul v-if="learnedNotes.length || ccs.length" class="maps" aria-label="Mappature MIDI">
        <li v-for="m in learnedNotes" :key="`n${m.note}`">
          Nota {{ m.note }} → pad {{ padName(m.pad) }}
          <button
            type="button"
            class="chip"
            :aria-label="`Dimentica la nota ${m.note}`"
            @click="midi.forgetNote(m.note)"
          >
            ×
          </button>
        </li>
        <li v-for="[key, ref] in ccs" :key="key">
          CC {{ key.split(':')[1] }} (canale {{ key.split(':')[0] }}) → {{ knobLabel(ref) }}
          <button
            type="button"
            class="chip"
            :aria-label="`Dimentica il CC ${key}`"
            @click="midi.forgetCc(key)"
          >
            ×
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.midi {
  display: grid;
  gap: var(--space-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.inputs,
.maps {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-sm);
}

.maps li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.input {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.led {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--color-surface-2);
}

.led--on {
  background: #22c55e;
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

.learn {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent) 16%, transparent);
  font-size: var(--text-sm);
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

.button[aria-pressed='true'] {
  border-color: var(--color-accent);
  color: var(--color-accent);
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
