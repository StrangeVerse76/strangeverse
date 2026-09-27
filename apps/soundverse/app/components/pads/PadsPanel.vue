<script setup lang="ts">
import { unlockAudio } from '~/audio/context'
import { MuteGroups, playPadHit } from '~/pads/hit'
import {
  BANKS,
  gridOrder,
  keyForPad,
  MUTE_GROUPS,
  padIndex,
  padName,
  padNumberForKey,
  padParams,
  velocityFromPosition,
  type Pad,
} from '~/pads/kit'
import { useLibraryStore } from '~/stores/library'
import { usePadsStore } from '~/stores/pads'

const DRAG_TYPE = 'application/x-soundverse-clip'
/** Quanto resta acceso un pad dopo il colpo (ms), solo per l'occhio. */
const FLASH_MS = 120

const pads = usePadsStore()
const library = useLibraryStore()
const mutes = new MuteGroups()
const flashing = ref(new Set<number>())
const dropTarget = ref<number | null>(null)

const clipsById = computed(() => new Map(library.clips.map((c) => [c.id, c])))
const selectedPad = computed(() => pads.kit.pads[pads.selected])
const sortedClips = computed(() => [...library.clips].sort((a, b) => b.createdAt - a.createdAt))
const lengthValue = computed({
  get: () => selectedPad.value?.length ?? padParams.length.max,
  set: (value: number) => {
    // A fondo scala vuol dire "tutto il campione".
    if (selectedPad.value) selectedPad.value.length = value >= padParams.length.max ? null : value
  },
})

const clipName = (pad: Pad | undefined) =>
  pad?.clipId ? (clipsById.value.get(pad.clipId)?.name ?? 'Clip mancante') : 'vuoto'

onMounted(() => {
  void pads.load()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(
  () => [pads.kit, pads.fullVelocity],
  () => pads.scheduleSave(),
  { deep: true },
)

/** Suona un pad. Il contesto si sblocca in modo sincrono, poi si attende il buffer. */
async function trigger(index: number, velocity: number) {
  const { context, master } = unlockAudio()
  flash(index)
  const pad = pads.kit.pads[index]
  if (!pad?.clipId || !clipsById.value.has(pad.clipId)) return
  const buffer = await library.getBuffer(pad.clipId)
  const when = context.currentTime
  const hit = playPadHit(context, master, pad, buffer, velocity, when)
  mutes.add(pad.muteGroup, hit, when)
}

function flash(index: number) {
  flashing.value = new Set(flashing.value).add(index)
  setTimeout(() => {
    const next = new Set(flashing.value)
    next.delete(index)
    flashing.value = next
  }, FLASH_MS)
}

function onPadDown(event: PointerEvent, index: number) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const velocity = pads.fullVelocity
    ? 1
    : velocityFromPosition(event.clientY - rect.top, rect.height)
  pads.selected = index
  void trigger(index, velocity)
}

function onKeydown(event: KeyboardEvent) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  const number = padNumberForKey(event.key)
  if (number === null) return
  event.preventDefault()
  const index = padIndex(pads.bank, number)
  pads.selected = index
  void trigger(index, 1)
}

function onDrop(event: DragEvent, index: number) {
  dropTarget.value = null
  const clipId = event.dataTransfer?.getData(DRAG_TYPE)
  const pad = pads.kit.pads[index]
  if (clipId && pad && clipsById.value.has(clipId)) {
    pad.clipId = clipId
    pads.selected = index
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (event.dataTransfer?.types.includes(DRAG_TYPE)) {
    event.preventDefault()
    dropTarget.value = index
  }
}

async function onOpenKit(event: Event) {
  await pads.open((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="pads">
    <div class="row">
      <select class="field" aria-label="Apri kit" :value="pads.kit.id" @change="onOpenKit">
        <option v-for="k in pads.sortedKits" :key="k.id" :value="k.id">{{ k.name }}</option>
      </select>
      <input v-model="pads.kit.name" class="field kit-name" aria-label="Nome del kit" />
      <button type="button" class="button button--ghost button--small" @click="pads.newKit()">
        Nuovo kit
      </button>
    </div>

    <div class="row">
      <div class="banks" role="group" aria-label="Banco">
        <button
          v-for="b in BANKS"
          :key="b"
          type="button"
          class="chip"
          :aria-pressed="pads.bank === b"
          @click="pads.bank = b"
        >
          {{ b }}
        </button>
      </div>
      <label class="toggle">
        <input v-model="pads.fullVelocity" type="checkbox" />
        Velocity piena
      </label>
    </div>

    <div class="grid" role="group" :aria-label="`Pad del banco ${pads.bank}`">
      <button
        v-for="n in gridOrder"
        :key="`${pads.bank}${n}`"
        type="button"
        class="pad"
        :class="{
          'pad--empty': !pads.kit.pads[padIndex(pads.bank, n)]?.clipId,
          'pad--hit': flashing.has(padIndex(pads.bank, n)),
          'pad--selected': pads.selected === padIndex(pads.bank, n),
          'pad--drop': dropTarget === padIndex(pads.bank, n),
        }"
        :aria-label="`Pad ${pads.bank}${n}: ${clipName(pads.kit.pads[padIndex(pads.bank, n)])}`"
        @pointerdown="onPadDown($event, padIndex(pads.bank, n))"
        @keydown.enter.prevent="trigger(padIndex(pads.bank, n), 1)"
        @dragover="onDragOver($event, padIndex(pads.bank, n))"
        @dragleave="dropTarget = null"
        @drop.prevent="onDrop($event, padIndex(pads.bank, n))"
      >
        <span class="pad__number">{{ pads.bank }}{{ n }}</span>
        <span class="pad__clip">{{ clipName(pads.kit.pads[padIndex(pads.bank, n)]) }}</span>
        <kbd class="pad__key">{{ keyForPad(n) }}</kbd>
      </button>
    </div>

    <section v-if="selectedPad" class="editor" :aria-label="`Pad ${padName(pads.selected)}`">
      <div class="row">
        <strong>Pad {{ padName(pads.selected) }}</strong>
        <select
          v-model="selectedPad.clipId"
          class="field editor__clip"
          aria-label="Campione del pad"
        >
          <option :value="null">— vuoto —</option>
          <option v-for="clip in sortedClips" :key="clip.id" :value="clip.id">
            {{ clip.name }}
          </option>
        </select>
      </div>
      <div class="row">
        <ControlKnob v-model="selectedPad.gain" :def="padParams.gain" />
        <ControlKnob v-model="selectedPad.tune" :def="padParams.tune" />
        <ControlKnob v-model="selectedPad.attack" :def="padParams.attack" />
        <ControlKnob
          v-model="lengthValue"
          :def="padParams.length"
          :value-text="selectedPad.length === null ? 'intera' : undefined"
        />
        <label class="group">
          Gruppo mute
          <select v-model.number="selectedPad.muteGroup" class="field" aria-label="Gruppo di mute">
            <option :value="0">nessuno</option>
            <option v-for="g in MUTE_GROUPS" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
      </div>
    </section>

    <p class="hint">
      Tastiera: 1 2 3 4 · Q W E R · A S D F · Z X C V (il pad 1 è in basso a sinistra, come su una
      MPC). Trascina un clip dalla libreria su un pad per assegnarlo.
    </p>
  </div>
</template>

<style scoped>
.pads {
  display: grid;
  gap: var(--space-3);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.kit-name {
  flex: 1 1 8rem;
}

.banks {
  display: flex;
  gap: var(--space-1);
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

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.pad {
  position: relative;
  display: grid;
  align-content: space-between;
  aspect-ratio: 1;
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-2));
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  transition:
    background 80ms,
    transform 80ms;
}

.pad--empty {
  background: var(--color-surface-2);
  color: var(--color-muted);
}

.pad--selected {
  border-color: var(--color-accent);
}

.pad--hit {
  background: var(--color-accent);
  color: var(--color-on-accent);
  transform: scale(0.97);
}

.pad--drop {
  outline: 2px dashed var(--color-accent);
}

.pad__number {
  font-size: 0.7rem;
  font-weight: 700;
}

.pad__clip {
  overflow: hidden;
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pad__key {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}

.editor {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.editor__clip {
  flex: 1 1 10rem;
}

.group {
  display: grid;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hint {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.button--small {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}
</style>
