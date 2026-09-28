<script setup lang="ts">
definePageMeta({ wide: true })

const description =
  'Soundverse è uno studio audio nel browser: synth, batteria, campioni e una timeline per comporre.'

useSeoMeta({
  description,
  ogTitle: 'Soundverse',
  ogDescription: description,
  ogType: 'website',
})

/** Gli strumenti del rack, nell'ordine in cui compaiono: la barra porta direttamente a ognuno. */
const instruments = [
  { id: 'synth', title: 'Synth' },
  { id: 'batteria', title: 'Batteria' },
  { id: 'campioni', title: 'Campioni' },
  { id: 'accordi', title: 'Accordi' },
  { id: 'pad', title: 'Pad' },
  { id: 'chop', title: 'Chop' },
  { id: 'registra', title: 'Registra' },
  { id: 'mixer', title: 'Mixer' },
  { id: 'midi', title: 'MIDI' },
]

const rack = useTemplateRef<HTMLDivElement>('rack')
const active = ref(instruments[0]?.id ?? '')
let observer: IntersectionObserver | null = null

function goTo(id: string) {
  const panel = document.getElementById(`strumento-${id}`)
  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  panel?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  active.value = id
}

// Lo strumento "attivo" nella barra è quello più visibile nel rack.
onMounted(() => {
  if (!rack.value) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) active.value = visible.target.id.replace('strumento-', '')
    },
    { root: rack.value, threshold: [0.5, 0.75, 1] },
  )
  for (const item of instruments) {
    const el = document.getElementById(`strumento-${item.id}`)
    if (el) observer.observe(el)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="studio">
    <h1 class="visually-hidden">Soundverse</h1>

    <nav class="studio__nav" aria-label="Vai allo strumento">
      <!-- Link veri: portano allo strumento anche prima che il JavaScript sia pronto. -->
      <a
        v-for="item in instruments"
        :key="item.id"
        :href="`#strumento-${item.id}`"
        class="nav-chip"
        :aria-current="active === item.id ? 'true' : undefined"
        @click.prevent="goTo(item.id)"
      >
        {{ item.title }}
      </a>
    </nav>

    <div ref="rack" class="studio__rack" role="group" aria-label="Strumenti">
      <StudioPanel id="strumento-synth" title="Synth">
        <SynthPanel />
      </StudioPanel>
      <StudioPanel id="strumento-batteria" title="Batteria">
        <DrumsPanel />
      </StudioPanel>
      <StudioPanel id="strumento-campioni" title="Campioni">
        <SamplePanel />
      </StudioPanel>
      <StudioPanel id="strumento-accordi" title="Accordi">
        <ChordsPanel />
      </StudioPanel>
      <StudioPanel id="strumento-pad" title="Pad">
        <PadsPanel />
      </StudioPanel>
      <StudioPanel id="strumento-chop" title="Chop">
        <ChopPanel />
      </StudioPanel>
      <StudioPanel id="strumento-registra" title="Registra">
        <RecordPanel />
      </StudioPanel>
      <StudioPanel id="strumento-mixer" title="Mixer">
        <MixerPanel />
      </StudioPanel>
      <StudioPanel id="strumento-midi" title="MIDI">
        <MidiPanel />
      </StudioPanel>
    </div>

    <StudioPanel title="Libreria" class="studio__library">
      <LibraryPanel />
    </StudioPanel>

    <StudioPanel title="Timeline" class="studio__timeline">
      <TimelinePanel />
    </StudioPanel>
  </div>
</template>

<style scoped>
.studio {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'nav'
    'rack'
    'library'
    'timeline';
  gap: var(--space-4);
}

@media (min-width: 64rem) {
  .studio {
    grid-template-columns: minmax(0, 1fr) 20rem;
    grid-template-areas:
      'nav nav'
      'rack library'
      'timeline timeline';
  }
}

.studio__nav {
  grid-area: nav;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.nav-chip {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.nav-chip:hover {
  color: var(--color-text);
}

.nav-chip[aria-current='true'] {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 16%, transparent);
  color: var(--color-accent);
}

.studio__rack {
  grid-area: rack;
  display: grid;
  grid-auto-columns: minmax(22rem, 1fr);
  grid-auto-flow: column;
  gap: var(--space-4);
  overflow-x: auto;
  padding-bottom: var(--space-1);
  scroll-snap-type: x proximity;
}

.studio__rack > * {
  scroll-snap-align: start;
}

.studio__library {
  grid-area: library;
}

.studio__timeline {
  grid-area: timeline;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
