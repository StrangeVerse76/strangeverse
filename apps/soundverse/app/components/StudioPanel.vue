<script setup lang="ts">
defineProps<{
  title: string
  /** Numero della issue che porterà il pannello, finché non è pronto. */
  comingIn?: number
}>()

const id = useId()
</script>

<template>
  <section class="panel" :aria-labelledby="id">
    <header class="panel__header">
      <h2 :id="id" class="panel__title" tabindex="-1">{{ title }}</h2>
    </header>
    <div class="panel__body">
      <slot>
        <p v-if="comingIn" class="panel__placeholder">In arrivo · issue #{{ comingIn }}</p>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.panel__header {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.panel__title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.panel__body {
  flex: 1;
  padding: var(--space-4);
}

.panel__placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  min-height: 8rem;
  margin: 0;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
  font-size: var(--text-sm);
}
</style>
