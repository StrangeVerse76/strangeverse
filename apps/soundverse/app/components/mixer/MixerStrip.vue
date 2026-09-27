<script setup lang="ts">
import { defaultEq } from '~/eq/spec'
import { mixParams, SENDS, type ChannelMix } from '~/mixer/mixer'
import type { ParamDef } from '~/synth/spec'

defineProps<{ name: string; mono?: boolean }>()

const gain = defineModel<number>('gain', { required: true })
const muted = defineModel<boolean>('muted', { required: true })
const mix = defineModel<ChannelMix>('mix', { required: true })

const gainDef: ParamDef = { label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 }
const showEq = ref(false)

function toggleEq() {
  if (!mix.value.eq) mix.value.eq = defaultEq()
  showEq.value = !showEq.value
}

function removeEq() {
  mix.value.eq = null
  showEq.value = false
}

const sendDef = (i: number): ParamDef => ({ ...mixParams.send, label: SENDS[i] ?? 'Mandata' })
</script>

<template>
  <section class="strip" :aria-label="`Canale ${name}`">
    <header class="strip__head">
      <strong>{{ name }}</strong>
      <span class="strip__tools">
        <button
          type="button"
          class="chip"
          :aria-pressed="muted"
          :aria-label="`Muto ${name}`"
          @click="muted = !muted"
        >
          M
        </button>
        <button
          type="button"
          class="chip chip--solo"
          :aria-pressed="mix.solo"
          :aria-label="`Solo ${name}`"
          @click="mix.solo = !mix.solo"
        >
          S
        </button>
        <button
          type="button"
          class="chip"
          :aria-pressed="!!mix.eq"
          :aria-label="`EQ ${name}`"
          @click="toggleEq"
        >
          EQ
        </button>
      </span>
    </header>
    <div class="strip__knobs">
      <ControlKnob v-model="gain" :def="gainDef" :aria-label="`Volume ${name}`" />
      <ControlKnob v-model="mix.pan" :def="mixParams.pan" :aria-label="`Pan ${name}`" />
      <ControlKnob
        v-for="(_, i) in SENDS"
        :key="i"
        :model-value="mix.sends[i] ?? 0"
        :def="sendDef(i)"
        :aria-label="`Mandata ${SENDS[i]} ${name}`"
        @update:model-value="mix.sends[i] = $event"
      />
    </div>
    <div v-if="showEq && mix.eq" class="strip__eq">
      <EqEditor v-model="mix.eq" :mono="mono" />
      <button type="button" class="button button--ghost button--small" @click="removeEq">
        Togli EQ
      </button>
    </div>
  </section>
</template>

<style scoped>
.strip {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.strip__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.strip__tools {
  display: flex;
  gap: var(--space-1);
}

.strip__knobs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.strip__eq {
  display: grid;
  gap: var(--space-2);
}

.chip {
  min-width: 1.9rem;
  height: 1.75rem;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}

.chip--solo[aria-pressed='true'] {
  border-color: #eab308;
  color: #eab308;
}

.button--small {
  justify-self: start;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
