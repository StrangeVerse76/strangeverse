<script setup lang="ts">
import { useSyncNow, useSyncStatus } from '~/sync/status'
import { formatBytes } from '~/utils/format'

const status = useSyncStatus()
const now = useSyncNow()

const label = computed(() => {
  switch (status.value.state) {
    case 'syncing':
      return 'Sincronizzazione…'
    case 'ok':
      return status.value.waiting
        ? `Sincronizzato · ${status.value.waiting} clip in attesa della sorgente`
        : 'Sincronizzato'
    case 'error':
      return 'Errore di sincronizzazione'
    case 'offline':
      return 'Offline: sincronizzo al ritorno'
    default:
      return ''
  }
})

const usage = computed(() => {
  const u = status.value.usage
  return u ? `${formatBytes(u.audioBytes)} di ${formatBytes(u.quotaBytes)} di audio` : ''
})
</script>

<template>
  <span v-if="status.state !== 'off'" class="sync">
    <span class="sync__dot" :class="`sync__dot--${status.state}`" aria-hidden="true" />
    <span role="status" :title="status.error ?? usage">{{ label }}</span>
    <span v-if="usage && status.state === 'ok'" class="sync__usage">· {{ usage }}</span>
    <button
      type="button"
      class="sync__now"
      :disabled="status.state === 'syncing'"
      aria-label="Sincronizza ora"
      @click="now?.()"
    >
      ↻
    </button>
  </span>
</template>

<style scoped>
.sync {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.sync__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-muted);
}

.sync__dot--ok {
  background: #22c55e;
}

.sync__dot--syncing {
  background: var(--color-accent);
}

.sync__dot--error {
  background: var(--color-danger);
}

.sync__now {
  min-width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
</style>
