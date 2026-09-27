<script setup lang="ts">
import {
  eqParams,
  eqPresets,
  highAttenFreqs,
  highBoostFreqs,
  lowFreqs,
  usesSide,
  type EqSpec,
  type EqTarget,
} from '~/eq/spec'

const props = defineProps<{
  /** Il clip sorgente è mono: in mid/side il Side è vuoto. */
  mono?: boolean
}>()

const spec = defineModel<EqSpec>({ required: true })

const targets: { value: EqTarget; label: string }[] = [
  { value: 'stereo', label: 'L+R' },
  { value: 'mid', label: 'Mid' },
  { value: 'side', label: 'Side' },
]
const sections = [
  { key: 'hpf', label: 'Passa-alto' },
  { key: 'low', label: 'Bassi' },
  { key: 'lowMid', label: 'Medio-bassi' },
  { key: 'highMid', label: 'Medio-alti' },
  { key: 'high', label: 'Alti' },
] as const

const sideWarning = computed(() => props.mono && usesSide(spec.value))
/** Le frequenze a scatti si leggono meglio intere: "60 Hz", "12 kHz". */
const hz = (value: number) => (value >= 1000 ? `${value / 1000} kHz` : `${value} Hz`)

function onPreset(event: Event) {
  const select = event.target as HTMLSelectElement
  const preset = eqPresets.find((p) => p.name === select.value)
  if (preset) spec.value = preset.spec()
  select.value = ''
}
</script>

<template>
  <div class="eq">
    <div class="eq__bar">
      <select class="field" aria-label="Preset EQ" @change="onPreset">
        <option value="">Preset…</option>
        <option v-for="preset in eqPresets" :key="preset.name" :value="preset.name">
          {{ preset.name }}
        </option>
      </select>
      <select v-model="spec.mode" class="field" aria-label="Modalità EQ">
        <option value="stereo">Stereo</option>
        <option value="midSide">Mid/Side</option>
      </select>
    </div>

    <EqCurve :spec="spec" />

    <p v-if="sideWarning" class="eq__warning" role="alert">
      Il clip è mono: il Side è vuoto e le sezioni assegnate al Side non fanno niente.
    </p>

    <div v-for="s in sections" :key="s.key" class="section" role="group" :aria-label="s.label">
      <div class="section__head">
        <label class="toggle">
          <input v-model="spec[s.key].enabled" type="checkbox" />
          {{ s.label }}
        </label>
        <select
          v-if="spec.mode === 'midSide'"
          v-model="spec[s.key].applyTo"
          class="field field--small"
          :aria-label="`${s.label}: dove agisce`"
        >
          <option v-for="t in targets" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div v-if="spec[s.key].enabled" class="section__controls">
        <template v-if="s.key === 'hpf'">
          <ControlKnob v-model="spec.hpf.freq" :def="eqParams.hpfFreq" label="Freq" />
        </template>

        <template v-else-if="s.key === 'low'">
          <select v-model="spec.low.freq" class="field field--small" aria-label="Bassi: frequenza">
            <option v-for="f in lowFreqs" :key="f" :value="f">{{ hz(f) }}</option>
          </select>
          <ControlKnob v-model="spec.low.boost" :def="eqParams.boost" aria-label="Bassi: boost" />
          <ControlKnob v-model="spec.low.atten" :def="eqParams.atten" aria-label="Bassi: atten" />
        </template>

        <template v-else-if="s.key === 'lowMid' || s.key === 'highMid'">
          <ControlKnob
            v-model="spec[s.key].freq"
            :def="s.key === 'lowMid' ? eqParams.lowMidFreq : eqParams.highMidFreq"
            :aria-label="`${s.label}: frequenza`"
          />
          <ControlKnob
            v-model="spec[s.key].peak"
            :def="eqParams.peak"
            :aria-label="`${s.label}: picco`"
          />
          <ControlKnob
            v-model="spec[s.key].bandwidth"
            :def="eqParams.bandwidth"
            :aria-label="`${s.label}: banda`"
          />
        </template>

        <template v-else>
          <select
            v-model="spec.high.boostFreq"
            class="field field--small"
            aria-label="Alti: frequenza del boost"
          >
            <option v-for="f in highBoostFreqs" :key="f" :value="f">{{ hz(f) }}</option>
          </select>
          <ControlKnob v-model="spec.high.boost" :def="eqParams.boost" aria-label="Alti: boost" />
          <ControlKnob
            v-model="spec.high.bandwidth"
            :def="eqParams.bandwidth"
            aria-label="Alti: banda"
          />
          <select
            v-model="spec.high.attenFreq"
            class="field field--small"
            aria-label="Alti: frequenza dell'atten"
          >
            <option v-for="f in highAttenFreqs" :key="f" :value="f">{{ hz(f) }}</option>
          </select>
          <ControlKnob v-model="spec.high.atten" :def="eqParams.atten" aria-label="Alti: atten" />
        </template>
      </div>
    </div>

    <div class="section__controls">
      <ControlKnob v-model="spec.warmth" :def="eqParams.warmth" />
      <ControlKnob v-model="spec.volume" :def="eqParams.volume" aria-label="Volume EQ" />
    </div>
  </div>
</template>

<style scoped>
.eq {
  display: grid;
  gap: var(--space-2);
}

.eq__bar,
.section__head,
.section__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.eq__bar select {
  flex: 1 1 7rem;
}

.eq__warning {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
}

.section {
  display: grid;
  gap: var(--space-1);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.section__head {
  justify-content: space-between;
  font-size: var(--text-sm);
  font-weight: 600;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}

.field--small {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
}
</style>
