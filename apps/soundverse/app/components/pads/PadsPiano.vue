<script setup lang="ts">
import { isBlackKey, noteName, pianoKeys } from '~/pads/levels'

const props = defineProps<{ octave: number }>()
const emit = defineEmits<{ note: [midi: number]; octave: [octave: number] }>()

const keys = computed(() => pianoKeys(props.octave))
const whites = computed(() => keys.value.filter((k) => !isBlackKey(k)))
const pressed = ref(new Set<number>())

/** Posizione di un tasto nero: fra i due bianchi vicini. */
function blackLeft(midi: number) {
  const whiteIndex = whites.value.indexOf(midi - 1)
  return `${((whiteIndex + 1) / whites.value.length) * 100}%`
}

function down(midi: number) {
  pressed.value = new Set(pressed.value).add(midi)
  emit('note', midi)
}

function up(midi: number) {
  const next = new Set(pressed.value)
  next.delete(midi)
  pressed.value = next
}
</script>

<template>
  <section class="piano" aria-label="Tastiera a piano">
    <div class="piano__bar">
      <button
        type="button"
        class="chip"
        aria-label="Ottava più bassa"
        :disabled="octave <= 0"
        @click="emit('octave', octave - 1)"
      >
        −
      </button>
      <span class="hint">{{ noteName(keys[0] ?? 48) }} – {{ noteName(keys.at(-1) ?? 72) }}</span>
      <button
        type="button"
        class="chip"
        aria-label="Ottava più alta"
        :disabled="octave >= 7"
        @click="emit('octave', octave + 1)"
      >
        +
      </button>
      <span class="hint">suona il pad selezionato · Do4 = tono originale</span>
    </div>
    <div class="keys">
      <button
        v-for="midi in whites"
        :key="midi"
        type="button"
        class="key key--white"
        :class="{ 'key--down': pressed.has(midi) }"
        :aria-label="noteName(midi)"
        @pointerdown="down(midi)"
        @pointerup="up(midi)"
        @pointerleave="up(midi)"
      >
        <span v-if="midi % 12 === 0" class="key__label">{{ noteName(midi) }}</span>
      </button>
      <button
        v-for="midi in keys.filter(isBlackKey)"
        :key="midi"
        type="button"
        class="key key--black"
        :class="{ 'key--down': pressed.has(midi) }"
        :style="{ left: blackLeft(midi) }"
        :aria-label="noteName(midi)"
        @pointerdown="down(midi)"
        @pointerup="up(midi)"
        @pointerleave="up(midi)"
      />
    </div>
  </section>
</template>

<style scoped>
.piano {
  display: grid;
  gap: var(--space-2);
}

.piano__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.chip {
  min-width: 2rem;
  height: 2rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.chip:disabled {
  opacity: 0.4;
}

.hint {
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.keys {
  position: relative;
  display: flex;
  height: 6rem;
  touch-action: none;
  user-select: none;
}

.key {
  padding: 0;
  border: 1px solid var(--color-border);
  cursor: pointer;
}

.key--white {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-end;
  justify-content: center;
  border-radius: 0 0 4px 4px;
  background: #f5f2ea;
}

.key--black {
  position: absolute;
  top: 0;
  z-index: 1;
  width: 4%;
  height: 60%;
  border-radius: 0 0 3px 3px;
  background: #1b1724;
  transform: translateX(-50%);
}

.key--down {
  background: var(--color-accent);
}

.key__label {
  margin-bottom: 0.3rem;
  color: #5f586d;
  font-size: 0.6rem;
}
</style>
