<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const notFound = computed(() => props.error.statusCode === 404)

useSeoMeta({
  title: () => (notFound.value ? 'Pagina non trovata' : 'Errore'),
  robots: 'noindex',
})
</script>

<template>
  <NuxtLayout>
    <section class="error">
      <p class="error__code">{{ error.statusCode }}</p>
      <h1>{{ notFound ? 'Questa pagina non esiste' : 'Qualcosa è andato storto' }}</h1>
      <p class="muted">
        {{
          notFound
            ? 'Forse è finita in un altro universo. Torna alla home e riparti da lì.'
            : 'Riprova tra poco. Se il problema resta, torna alla home.'
        }}
      </p>
      <button type="button" class="button" @click="clearError({ redirect: '/' })">
        Torna alla home
      </button>
    </section>
  </NuxtLayout>
</template>

<style scoped>
.error {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  padding-block: var(--space-8);
}

.error__code {
  margin: 0;
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--color-accent);
}

.error h1 {
  margin: 0;
}

.error .muted {
  max-width: 45ch;
  margin: 0 0 var(--space-3);
}
</style>
