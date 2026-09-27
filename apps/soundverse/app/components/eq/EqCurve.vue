<script setup lang="ts">
import { SAMPLE_RATE } from '~/audio/constants'
import { responseDb } from '~/eq/biquad'
import { eqFilters, type EqSpec } from '~/eq/spec'

const props = defineProps<{ spec: EqSpec }>()

const MIN_HZ = 20
const MAX_HZ = 20_000
const RANGE_DB = 20

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let observer: ResizeObserver | null = null

/** Le curve da disegnare: una in stereo, due (mid e side) in mid/side. */
const curves = computed(() => {
  const placed = eqFilters(props.spec, SAMPLE_RATE)
  const pick = (targets: string[]) =>
    placed.filter((p) => targets.includes(p.target)).map((p) => p.filter)
  const volume = props.spec.volume
  return props.spec.mode === 'stereo'
    ? [{ name: 'stereo', filters: pick(['stereo']), volume }]
    : [
        { name: 'mid', filters: pick(['stereo', 'mid']), volume },
        { name: 'side', filters: pick(['stereo', 'side']), volume },
      ]
})

const summary = computed(() =>
  curves.value
    .map((c) => {
      const at = (hz: number) => (responseDb(c.filters, hz, SAMPLE_RATE) + c.volume).toFixed(1)
      return `${c.name}: 50 Hz ${at(50)} dB, 1 kHz ${at(1000)} dB, 10 kHz ${at(10000)} dB`
    })
    .join('; '),
)

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
  const y = (db: number) => height / 2 - (db / RANGE_DB) * (height / 2)
  const x = (hz: number) => (Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * width

  ctx.strokeStyle = style.getPropertyValue('--grid').trim()
  ctx.lineWidth = 1
  for (const hz of [100, 1000, 10000]) {
    ctx.beginPath()
    ctx.moveTo(x(hz), 0)
    ctx.lineTo(x(hz), height)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, y(0))
  ctx.lineTo(width, y(0))
  ctx.stroke()

  const colors = [
    style.getPropertyValue('--line').trim(),
    style.getPropertyValue('--line-2').trim(),
  ]
  curves.value.forEach((curve, i) => {
    ctx.strokeStyle = colors[i] ?? '#f5a524'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let px = 0; px <= width; px += 2) {
      const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, px / width)
      const db = responseDb(curve.filters, hz, SAMPLE_RATE) + curve.volume
      const py = Math.min(height, Math.max(0, y(db)))
      if (px === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  })
}

onMounted(() => {
  observer = new ResizeObserver(draw)
  if (canvas.value) observer.observe(canvas.value)
  draw()
})
onBeforeUnmount(() => observer?.disconnect())
watch(curves, draw, { deep: true })
</script>

<template>
  <figure class="curve">
    <canvas ref="canvas" role="img" :aria-label="`Risposta dell'equalizzatore. ${summary}`" />
    <figcaption>
      <span>20 Hz</span>
      <span v-if="spec.mode === 'midSide'" class="legend">
        <span class="legend__mid">Mid</span> · <span class="legend__side">Side</span>
      </span>
      <span>20 kHz · ±{{ RANGE_DB }} dB</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.curve {
  --grid: var(--color-border);
  --line: var(--color-accent);
  --line-2: var(--color-accent-2);

  display: grid;
  gap: var(--space-1);
  margin: 0;
}

canvas {
  width: 100%;
  height: 6rem;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

figcaption {
  display: flex;
  justify-content: space-between;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}

.legend__mid {
  color: var(--color-accent);
}

.legend__side {
  color: var(--color-accent-2);
}
</style>
