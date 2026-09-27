<script setup lang="ts">
import { apps } from '~/data/apps'

const description =
  'StrangeVerse è un piccolo multiverso di app per il browser, costruite per curiosità e per divertimento.'

useSeoMeta({
  description,
  ogTitle: 'StrangeVerse',
  ogDescription: description,
  ogType: 'website',
})
</script>

<template>
  <div>
    <section class="hero">
      <p class="hero__eyebrow">Un multiverso di piccole app</p>
      <h1 class="hero__title">StrangeVerse</h1>
      <p class="hero__lead">
        Esperimenti e strumenti che vivono nel browser. Ognuno è un mondo a sé: si apre, si prova,
        si gioca.
      </p>
    </section>

    <section aria-labelledby="catalogo-titolo">
      <h2 id="catalogo-titolo">Le app</h2>
      <ul class="catalog" role="list">
        <li v-for="app in apps" :key="app.id">
          <AppCard :app="app" />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  padding-block: var(--space-7) var(--space-8);
}

/* Anelli decorativi, richiamo al logo. */
.hero::before {
  content: '';
  position: absolute;
  top: 50%;
  right: -6rem;
  z-index: -1;
  width: 28rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle, transparent 54%, var(--color-accent) 54.5%, transparent 56%),
    radial-gradient(circle, transparent 66%, var(--color-accent-2) 66.5%, transparent 67.5%),
    radial-gradient(
      circle,
      color-mix(in srgb, var(--color-accent-2) 22%, transparent),
      transparent 70%
    );
  opacity: 0.45;
  transform: translateY(-50%);
  pointer-events: none;
}

@media (max-width: 48rem) {
  .hero::before {
    top: 0;
    right: -9rem;
    width: 18rem;
    opacity: 0.3;
    transform: none;
  }
}

.hero__eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero__title {
  margin: 0 0 var(--space-4);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: -0.04em;
}

.hero__lead {
  max-width: 38rem;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-lg);
}

.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.catalog > li {
  display: grid;
}
</style>
