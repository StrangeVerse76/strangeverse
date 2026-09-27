<script setup lang="ts">
const props = defineProps<{
  /** Picchi 0..1, uno per colonna. */
  peaks: readonly number[]
  /** Posizione del cursore di riproduzione, 0..1 (null = nascosto). */
  progress?: number | null
  label: string
}>()

const emit = defineEmits<{ seek: [fraction: number] }>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let observer: ResizeObserver | null = null

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

function onPointer(event: PointerEvent) {
  const el = canvas.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  emit('seek', Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)))
}

onMounted(() => {
  observer = new ResizeObserver(draw)
  if (canvas.value) observer.observe(canvas.value)
  draw()
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => [props.peaks, props.progress], draw)
</script>

<template>
  <canvas ref="canvas" class="waveform" role="img" :aria-label="label" @pointerdown="onPointer" />
</template>

<style scoped>
.waveform {
  --wave-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  --wave-played: var(--color-accent);
  --wave-cursor: var(--color-text);

  display: block;
  width: 100%;
  height: 5rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  cursor: pointer;
  touch-action: none;
}
</style>
