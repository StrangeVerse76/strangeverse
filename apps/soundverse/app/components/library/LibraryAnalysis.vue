<script setup lang="ts">
import { keyNames, MAX_BPM, MIN_BPM, MIN_ANALYSIS_SECONDS } from '~/analysis/analyze'
import type { Clip } from '~/library/types'
import { useLibraryStore } from '~/stores/library'

const props = defineProps<{ clip: Clip }>()

const library = useLibraryStore()
const estimating = ref(false)

const bpm = computed(() => props.clip.analysis?.bpm ?? null)
const key = computed(() => props.clip.analysis?.key ?? null)
const canEstimate = computed(() => props.clip.duration >= MIN_ANALYSIS_SECONDS)

function save(next: { bpm?: number | null; key?: string | null }) {
  void library.setAnalysis(props.clip.id, {
    bpm: next.bpm === undefined ? bpm.value : next.bpm,
    key: next.key === undefined ? key.value : next.key,
  })
}

function onBpm(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  save({ bpm: Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null })
}

/** Raddoppia o dimezza: la correzione tipica quando la stima sceglie l'ottava sbagliata del tempo. */
function scale(factor: 2 | 0.5) {
  if (bpm.value === null) return
  const next = Math.round(bpm.value * factor * 10) / 10
  if (next >= MIN_BPM / 2 && next <= MAX_BPM * 2) save({ bpm: next })
}

async function estimate() {
  estimating.value = true
  try {
    await library.estimate(props.clip.id)
  } finally {
    estimating.value = false
  }
}
</script>

<template>
  <div class="analysis" role="group" aria-label="Tempo e tonalità">
    <label class="analysis__field">
      BPM
      <input
        class="field analysis__bpm"
        type="number"
        min="1"
        step="0.1"
        :value="bpm ?? ''"
        placeholder="—"
        aria-label="BPM del clip"
        @change="onBpm"
      />
    </label>
    <button
      type="button"
      class="chip"
      aria-label="Raddoppia il BPM"
      :disabled="bpm === null"
      @click="scale(2)"
    >
      ×2
    </button>
    <button
      type="button"
      class="chip"
      aria-label="Dimezza il BPM"
      :disabled="bpm === null"
      @click="scale(0.5)"
    >
      ÷2
    </button>
    <label class="analysis__field">
      Tonalità
      <select
        class="field"
        aria-label="Tonalità del clip"
        :value="key ?? ''"
        @change="save({ key: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">—</option>
        <option v-for="name in keyNames" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <button
      v-if="canEstimate"
      type="button"
      class="button button--ghost button--small"
      :disabled="estimating"
      @click="estimate"
    >
      {{ estimating ? 'Stima…' : 'Stima di nuovo' }}
    </button>
  </div>
</template>

<style scoped>
.analysis {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
}

.analysis__field {
  display: grid;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.analysis__bpm {
  width: 5.5rem;
}

.chip {
  min-width: 2.25rem;
  height: 2.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
