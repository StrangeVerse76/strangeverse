<script setup lang="ts">
import type { ParamDef } from '~/synth/spec'
import { formatParam } from '~/utils/format'
import { clamp, fromNormalized, roundTo, toNormalized } from '~/utils/scale'

const props = defineProps<{
  def: ParamDef
  /** Etichetta da mostrare, se diversa da quella del parametro. */
  label?: string
  /** Nome per i lettori di schermo, se serve più preciso dell'etichetta (es. "Volume Cassa"). */
  ariaLabel?: string
  /** Solo la manopola, senza etichetta e valore visibili (restano per i lettori di schermo). */
  compact?: boolean
  /** Testo al posto del valore (es. "intera" per una lunghezza a fondo scala). */
  valueText?: string
}>()

const model = defineModel<number>({ required: true })

/** Pixel di trascinamento verticale per l'escursione completa (Maiusc = regolazione fine). */
const DRAG_RANGE = 160
const FINE_FACTOR = 4
/** Arco di 270°, da -135° a +135° rispetto alle ore 12. */
const SWEEP = 270

const name = computed(() => props.label ?? props.def.label)
const accessibleName = computed(() => props.ariaLabel ?? name.value)
const position = computed(() => toNormalized(model.value, props.def))
const text = computed(
  () => props.valueText ?? formatParam(model.value, props.def.unit, props.def.step),
)

function set(value: number) {
  model.value = roundTo(clamp(value, props.def.min, props.def.max), props.def.step)
}

function setPosition(p: number) {
  set(fromNormalized(p, props.def))
}

/** Un passo della tastiera o della rotella: 1% dell'escursione (10% con `big`), almeno uno `step`. */
function nudge(direction: 1 | -1, big = false) {
  const amount = big ? 0.1 : 0.01
  const { min, max, step, log } = props.def
  let next = log
    ? fromNormalized(position.value + direction * amount, props.def)
    : model.value + direction * Math.max(step, (max - min) * amount)
  next = roundTo(clamp(next, min, max), step)
  if (next === model.value) next = model.value + direction * step
  set(next)
}

let dragStart: { y: number; position: number } | null = null

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragStart = { y: event.clientY, position: position.value }
}

function onPointerMove(event: PointerEvent) {
  if (!dragStart) return
  const range = DRAG_RANGE * (event.shiftKey ? FINE_FACTOR : 1)
  setPosition(dragStart.position + (dragStart.y - event.clientY) / range)
}

function onPointerUp() {
  dragStart = null
}

function onWheel(event: WheelEvent) {
  nudge(event.deltaY < 0 ? 1 : -1, !event.shiftKey && Math.abs(event.deltaY) > 50)
}

function onKeydown(event: KeyboardEvent) {
  const keys: Record<string, () => void> = {
    ArrowUp: () => nudge(1),
    ArrowRight: () => nudge(1),
    ArrowDown: () => nudge(-1),
    ArrowLeft: () => nudge(-1),
    PageUp: () => nudge(1, true),
    PageDown: () => nudge(-1, true),
    Home: () => set(props.def.min),
    End: () => set(props.def.max),
  }
  const action = keys[event.key]
  if (action) {
    event.preventDefault()
    action()
  }
}

// Geometria dell'arco (viewBox 0 0 40 40, centro 20,20, raggio 15).
const R = 15
function point(p: number) {
  const angle = ((-SWEEP / 2 + p * SWEEP - 90) * Math.PI) / 180
  return { x: 20 + R * Math.cos(angle), y: 20 + R * Math.sin(angle) }
}
function arc(from: number, to: number) {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const start = point(a)
  const end = point(b)
  const large = (b - a) * SWEEP > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${large} 1 ${end.x} ${end.y}`
}
const origin = computed(() => (props.def.bipolar ? toNormalized(0, props.def) : 0))
const track = arc(0, 1)
const valueArc = computed(() => arc(origin.value, position.value))
const tip = computed(() => point(position.value))
</script>

<template>
  <div
    class="knob"
    :class="{ 'knob--compact': compact }"
    :title="compact ? `${name}: ${text}` : undefined"
  >
    <div
      class="knob__dial"
      role="slider"
      tabindex="0"
      :aria-label="accessibleName"
      :aria-valuemin="def.min"
      :aria-valuemax="def.max"
      :aria-valuenow="model"
      :aria-valuetext="text"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @keydown="onKeydown"
      @dblclick="set(def.default)"
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path :d="track" class="knob__track" />
        <path v-if="position !== origin" :d="valueArc" class="knob__value" />
        <line x1="20" y1="20" :x2="tip.x" :y2="tip.y" class="knob__pointer" />
      </svg>
    </div>
    <template v-if="!compact">
      <span class="knob__label">{{ name }}</span>
      <span class="knob__text">{{ text }}</span>
    </template>
  </div>
</template>

<style scoped>
.knob {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  min-width: 4rem;
  user-select: none;
}

.knob--compact {
  min-width: 0;
}

.knob__dial {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  cursor: ns-resize;
  touch-action: none;
}

.knob__dial svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.knob__track,
.knob__value {
  fill: none;
  stroke-width: 3.5;
  stroke-linecap: round;
}

.knob__track {
  stroke: var(--color-surface-2);
}

.knob__value {
  stroke: var(--color-accent);
}

.knob__pointer {
  stroke: var(--color-text);
  stroke-width: 2.5;
  stroke-linecap: round;
}

.knob__label {
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.knob__text {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  white-space: nowrap;
}
</style>
