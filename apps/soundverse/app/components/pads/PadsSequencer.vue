<script setup lang="ts">
import { toPlain } from '~/utils/plain'
import { renderRecipe } from '~/library/recipes'
import { padName } from '~/pads/kit'
import { GRIDS, patternBeats, type PadEvent } from '~/pads/pattern'
import { usePadSequencer } from '~/pads/useSequencer'
import type { ParamDef } from '~/synth/spec'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'

const pads = usePadsStore()
const library = useLibraryStore()
const seq = usePadSequencer()
const saving = ref(false)
const name = ref('Pattern')

const params = {
  bpm: { label: 'BPM', unit: '', min: 40, max: 220, step: 1, default: 90 },
  swing: { label: 'Swing', unit: '', min: 0, max: 1, step: 0.01, default: 0 },
} satisfies Record<string, ParamDef>

const length = computed(() => patternBeats(pads.pattern))
/** Le corsie da disegnare: un pad per riga, solo quelli usati dal pattern. */
const lanes = computed(() => {
  const byPad = new Map<number, PadEvent[]>()
  for (const event of pads.pattern.events)
    byPad.set(event.pad, [...(byPad.get(event.pad) ?? []), event])
  return [...byPad.entries()].sort(([a], [b]) => a - b)
})

onBeforeUnmount(() => seq.stop())

function toggleRecord() {
  if (pads.recording) pads.stopRecording()
  else {
    pads.startRecording()
    if (!seq.playing.value) seq.togglePlay()
  }
}

function onBars(event: Event) {
  pads.setBars(Number((event.target as HTMLSelectElement).value))
}

function addPattern() {
  pads.choosePattern(pads.addPattern(), seq.playing.value)
}

async function save() {
  saving.value = true
  try {
    const recipe = {
      type: 'padPattern',
      pattern: toPlain(pads.pattern),
      settings: toPlain(pads.settings),
      pads: toPlain(pads.kit.pads),
      mixer: toPlain(pads.mixer),
    } as const
    await library.add({
      name: name.value,
      kind: 'drums',
      channels: await renderRecipe(recipe, library.sourceBuffer),
      recipe,
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="seq" aria-label="Sequencer dei pad">
    <div class="row">
      <button type="button" class="button" @click="seq.togglePlay()">
        {{ seq.playing.value ? 'Stop' : 'Play' }}
      </button>
      <button
        type="button"
        class="button button--ghost rec"
        :aria-pressed="pads.recording"
        @click="toggleRecord"
      >
        ● Rec
      </button>
      <button
        type="button"
        class="button button--ghost button--small"
        :disabled="pads.undo === null"
        @click="pads.undoRecording()"
      >
        Annulla
      </button>
      <button type="button" class="button button--ghost button--small" @click="pads.clearPattern()">
        Cancella pattern
      </button>
      <label class="toggle">
        <input v-model="pads.metronome" type="checkbox" />
        Metronomo
      </label>
    </div>

    <div class="row">
      <ControlKnob v-model="pads.settings.bpm" :def="params.bpm" />
      <ControlKnob v-model="pads.settings.swing" :def="params.swing" />
      <label class="field-label">
        Griglia
        <select v-model="pads.settings.grid" class="field" aria-label="Griglia">
          <option v-for="g in GRIDS" :key="g" :value="g">{{ g }}</option>
        </select>
      </label>
      <label class="toggle">
        <input v-model="pads.settings.quantize" type="checkbox" />
        Quantizza
      </label>
      <label class="field-label">
        Battute
        <select
          class="field"
          aria-label="Battute del pattern"
          :value="pads.pattern.bars"
          @change="onBars"
        >
          <option v-for="b in 8" :key="b" :value="b">{{ b }}</option>
        </select>
      </label>
    </div>

    <div class="row">
      <label class="toggle">
        <input v-model="pads.noteRepeat" type="checkbox" />
        Note Repeat
      </label>
      <label class="toggle">
        <input v-model="pads.latch" type="checkbox" :disabled="!pads.noteRepeat" />
        Latch
      </label>
      <span v-if="seq.latched.value.size" class="hint">
        In ripetizione: {{ [...seq.latched.value].map(padName).join(', ') }}
      </span>
    </div>

    <div class="patterns" role="group" aria-label="Pattern">
      <button
        v-for="(p, i) in pads.patterns"
        :key="p.id"
        type="button"
        class="chip"
        :class="{ 'chip--queued': pads.queuedIndex === i }"
        :aria-pressed="pads.patternIndex === i"
        @click="pads.choosePattern(i, seq.playing.value)"
      >
        {{ i + 1 }}
      </button>
      <button type="button" class="chip" aria-label="Nuovo pattern" @click="addPattern">+</button>
      <span v-if="pads.queuedIndex !== null" class="hint">
        In coda: pattern {{ pads.queuedIndex + 1 }}
      </span>
    </div>

    <div class="lanes" :aria-label="`Eventi del pattern ${pads.patternIndex + 1}`" role="list">
      <div class="lane" aria-hidden="true">
        <span class="lane__name" />
        <div class="lane__track lane__track--ruler">
          <span
            v-for="b in length"
            :key="b"
            class="tick"
            :class="{ 'tick--bar': (b - 1) % 4 === 0 }"
            :style="{ left: `${((b - 1) / length) * 100}%` }"
          />
          <span
            v-if="seq.playing.value"
            class="playhead"
            data-testid="seq-playhead"
            :style="{ left: `${(seq.beat.value / length) * 100}%` }"
          />
        </div>
      </div>
      <p v-if="!lanes.length" class="hint">
        Premi Rec e suona i pad: i colpi finiscono qui, quantizzati sulla griglia.
      </p>
      <div
        v-for="[pad, events] in lanes"
        :key="pad"
        class="lane"
        role="listitem"
        :aria-label="`Pad ${padName(pad)}: ${events.length} colpi`"
      >
        <span class="lane__name">{{ padName(pad) }}</span>
        <div class="lane__track">
          <button
            v-for="(e, i) in events"
            :key="i"
            type="button"
            class="dot"
            :style="{ left: `${(e.beat / length) * 100}%`, opacity: 0.35 + e.velocity * 0.65 }"
            :aria-label="`Togli il colpo di ${padName(pad)} al battito ${(e.beat + 1).toFixed(2)}`"
            @click="pads.removeEvent(e)"
          />
        </div>
      </div>
    </div>

    <div class="row">
      <input v-model="name" class="field name" aria-label="Nome del pattern salvato" />
      <button
        type="button"
        class="button button--ghost"
        :disabled="saving || !pads.pattern.events.length"
        @click="save"
      >
        {{ saving ? 'Salvataggio…' : 'Salva in libreria' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.seq {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.row,
.patterns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.rec[aria-pressed='true'] {
  border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 20%, transparent);
  color: var(--color-danger);
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  cursor: pointer;
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

.chip {
  min-width: 2rem;
  height: 2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-weight: 700;
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}

.chip--queued {
  border-style: dashed;
  border-color: var(--color-accent);
}

.lanes {
  position: relative;
  display: grid;
  gap: var(--space-1);
  min-height: 3rem;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.lane__track--ruler {
  height: 0.6rem;
  background: transparent;
}

.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-border);
}

.tick--bar {
  background: var(--color-muted);
}

.playhead {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--color-text);
}

.lane {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  align-items: center;
  gap: var(--space-2);
}

.lane__name {
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.lane__track {
  position: relative;
  height: 1rem;
  border-radius: 3px;
  background: var(--color-surface-2);
}

.dot {
  position: absolute;
  top: 50%;
  width: 0.7rem;
  height: 0.7rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--color-accent);
  transform: translate(-50%, -50%);
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
