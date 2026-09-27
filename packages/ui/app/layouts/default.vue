<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <div class="page">
    <a class="skip-link" href="#contenuto">Vai al contenuto</a>
    <SiteHeader />
    <main
      id="contenuto"
      class="container page__main"
      :class="{ 'container--wide': route.meta.wide }"
    >
      <slot />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  /* Le decorazioni che escono dai bordi non devono creare scroll orizzontale. */
  overflow-x: clip;
}

.page__main {
  flex: 1;
  width: 100%;
  padding-block: var(--space-6) var(--space-8);
}

.skip-link {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 10;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 600;
  transform: translateY(-200%);
}

.skip-link:focus-visible {
  transform: none;
}
</style>
