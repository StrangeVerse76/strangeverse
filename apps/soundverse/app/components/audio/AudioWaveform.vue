<script setup lang="ts">
export interface WaveRegion {
  /** Frazioni della durata, 0..1, con start < end. */
  start: number
  end: number
}

const props = defineProps<{
  /** Picchi 0..1, uno per colonna. */
  peaks: readonly number[]
  /** Posizione del cursore di riproduzione, 0..1 (null = nascosto). */
  progress?: number | null
  label: string
  /**
   * Con la durata (secondi) si può selezionare una regione trascinando;
   * un gesto più breve di `CLICK_SECONDS` vale come click e sposta la riproduzione.
   */
  duration?: number
  region?: WaveRegion | null
}>()

const emit = defineEmits<{
  seek: [fraction: number]
  select: [region: WaveRegion]
}>()

/** Sotto questa durata (in secondi di audio) un trascinamento conta come click. */
const CLICK_SECONDS = 0.05

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const dragging = ref<WaveRegion | null>(null)
let observer: ResizeObserver | null = null
let anchor: number | null = null

const selectable = computed(() => props.duration !== undefined)
const shownRegion = computed(() => dragging.value ?? props.region ?? null)

function draw() {
  const el = canvas.value
  if (!el) return
  const ratio = window.devicePixelRatio || 1
  const width = el.clientWidth
  const height = el.clientHeight
  el.width = Math.round(width * ratio)
  el.height = Math.round(height * ratio)
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const style = getComputedStyle(el)
  const wave = style.getPropertyValue('--wave-color').trim() || '#f5a524'
  const played = style.getPropertyValue('--wave-played').trim() || wave
  const mid = height / 2
  const count = props.peaks.length
  const progressX = props.progress == null ? -1 : props.progress * width

  const region = shownRegion.value
  if (region) {
    ctx.fillStyle = style.getPropertyValue('--wave-region').trim() || 'rgba(255,255,255,0.1)'
    ctx.fillRect(region.start * width, 0, (region.end - region.start) * width, height)
  }

  for (let x = 0; x < width; x++) {
    const peak = props.peaks[Math.floor((x / width) * count)] ?? 0
    const h = Math.max(1, peak * (height - 4))
    ctx.fillStyle = x <= progressX ? played : wave
    ctx.fillRect(x, mid - h / 2, 1, h)
  }

  if (progressX >= 0) {
    ctx.fillStyle = style.getPropertyValue('--wave-cursor').trim() || '#fff'
    ctx.fillRect(Math.min(progressX, width - 2), 0, 2, height)
  }
}

function fractionAt(event: PointerEvent) {
  const el = canvas.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function onPointerDown(event: PointerEvent) {
  const fraction = fractionAt(event)
  if (!selectable.value) {
    emit('seek', fraction)
    return
  }
  canvas.value?.setPointerCapture(event.pointerId)
  anchor = fraction
}

function onPointerMove(event: PointerEvent) {
  if (anchor === null) return
  const fraction = fractionAt(event)
  dragging.value = { start: Math.min(anchor, fraction), end: Math.max(anchor, fraction) }
}

function onPointerUp(event: PointerEvent) {
  if (anchor === null) return
  const fraction = fractionAt(event)
  const region = { start: Math.min(anchor, fraction), end: Math.max(anchor, fraction) }
  anchor = null
  dragging.value = null
  if ((region.end - region.start) * (props.duration ?? 0) < CLICK_SECONDS) emit('seek', fraction)
  else emit('select', region)
}

onMounted(() => {
  observer = new ResizeObserver(draw)
  if (canvas.value) observer.observe(canvas.value)
  draw()
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.peaks, props.progress, shownRegion.value], draw)
</script>

<template>
  <canvas
    ref="canvas"
    class="waveform"
    role="img"
    :aria-label="label"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  />
</template>

<style scoped>
.waveform {
  --wave-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  --wave-played: var(--color-accent);
  --wave-cursor: var(--color-text);
  --wave-region: color-mix(in srgb, var(--color-accent-2) 28%, transparent);

  display: block;
  width: 100%;
  height: 5rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  cursor: pointer;
  touch-action: none;
}
</style>
