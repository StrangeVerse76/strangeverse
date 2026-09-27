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
</script>

<template>
  <div class="studio">
    <h1 class="visually-hidden">Soundverse</h1>

    <div class="studio__rack" role="group" aria-label="Strumenti">
      <StudioPanel title="Synth">
        <SynthPanel />
      </StudioPanel>
      <StudioPanel title="Batteria">
        <DrumsPanel />
      </StudioPanel>
      <StudioPanel title="Campioni">
        <SamplePanel />
      </StudioPanel>
      <StudioPanel title="Accordi">
        <ChordsPanel />
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
    'rack'
    'library'
    'timeline';
  gap: var(--space-4);
}

@media (min-width: 64rem) {
  .studio {
    grid-template-columns: minmax(0, 1fr) 20rem;
    grid-template-areas:
      'rack library'
      'timeline timeline';
  }
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
