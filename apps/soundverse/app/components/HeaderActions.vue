<script setup lang="ts">
import { authClient } from '~/auth/client'
import { useMe } from '~/auth/me'

// Chi è entrato lo chiede il plugin della sincronizzazione, solo nel browser: la pagina resta
// statica e la libreria funziona anche senza login.
const { me, refresh } = useMe()
const route = useRoute()
const denied = computed(() => route.query.error !== undefined)
const busy = ref(false)

async function signIn() {
  busy.value = true
  await authClient.signIn.social({
    provider: 'github',
    callbackURL: '/',
    errorCallbackURL: '/?error=login',
  })
}

async function signOut() {
  busy.value = true
  try {
    await authClient.signOut()
    await refresh()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="me?.enabled" class="account">
    <p v-if="denied && !me.user" class="account__error" role="alert">Accesso non consentito</p>
    <template v-if="me.user">
      <img v-if="me.user.image" :src="me.user.image" alt="" class="account__avatar" />
      <span class="account__name">{{ me.user.name }}</span>
      <SyncStatus />
      <button type="button" class="account__button" :disabled="busy" @click="signOut">Esci</button>
    </template>
    <button v-else type="button" class="account__button" :disabled="busy" @click="signIn">
      Accedi con GitHub
    </button>
  </div>
</template>

<style scoped>
.account {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.account__avatar {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
}

.account__name {
  color: var(--color-muted);
}

.account__error {
  margin: 0;
  color: var(--color-danger);
}

.account__button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
}

.account__button:hover {
  border-color: var(--color-accent);
}
</style>
