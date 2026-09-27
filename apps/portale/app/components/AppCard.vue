<script setup lang="ts">
import { statusLabels, type AppEntry } from '~/data/apps'

const props = defineProps<{ app: AppEntry }>()

const href = computed(() => (props.app.status === 'live' ? props.app.url : null))
</script>

<template>
  <article class="card" :class="{ 'card--disabled': !href }">
    <span class="card__icon" aria-hidden="true">{{ app.icon }}</span>
    <div class="card__body">
      <h3 class="card__title">
        <a v-if="href" :href="href" class="card__link">{{ app.name }}</a>
        <template v-else>{{ app.name }}</template>
      </h3>
      <p class="card__description">{{ app.description }}</p>
    </div>
    <span class="card__status" :data-status="app.status">{{ statusLabels[app.status] }}</span>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-3);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition:
    border-color 0.2s,
    transform 0.2s;
}

.card:not(.card--disabled):hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
}

.card__icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  font-size: 1.5rem;
}

.card__title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-lg);
}

.card__link {
  color: inherit;
  text-decoration: none;
}

/* Tutta la scheda è cliccabile, ma il link resta uno solo per i lettori di schermo. */
.card__link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.card__description {
  margin: 0;
  color: var(--color-muted);
}

.card__status {
  justify-self: start;
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  background: var(--color-surface-2);
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.card__status[data-status='live'] {
  background: color-mix(in srgb, var(--color-accent) 18%, transparent);
  color: var(--color-accent);
}
</style>
