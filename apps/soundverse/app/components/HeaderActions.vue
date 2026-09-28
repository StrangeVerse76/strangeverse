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

// Le passkey servono il supporto WebAuthn del browser (c'è in tutti quelli recenti).
const passkeys = ref(false)
onMounted(() => (passkeys.value = !!window.PublicKeyCredential))
const message = ref<string | null>(null)

async function signInWithPasskey() {
  busy.value = true
  message.value = null
  try {
    const { error } = await authClient.signIn.passkey()
    if (error) message.value = 'Accesso con passkey non riuscito'
    else await refresh()
  } finally {
    busy.value = false
  }
}

async function addPasskey() {
  busy.value = true
  message.value = null
  try {
    const { error } = await authClient.passkey.addPasskey({ name: 'Soundverse' })
    message.value = error
      ? 'Passkey non aggiunta'
      : 'Passkey aggiunta: la prossima volta basta Touch ID'
    await refresh()
  } finally {
    busy.value = false
  }
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
      <button
        v-if="passkeys && me.user.passkeys === 0"
        type="button"
        class="account__button"
        :disabled="busy"
        @click="addPasskey"
      >
        Aggiungi passkey
      </button>
      <button type="button" class="account__button" :disabled="busy" @click="signOut">Esci</button>
    </template>
    <template v-else>
      <button
        v-if="passkeys"
        type="button"
        class="account__button"
        :disabled="busy"
        @click="signInWithPasskey"
      >
        Accedi con passkey
      </button>
      <button type="button" class="account__button" :disabled="busy" @click="signIn">
        Accedi con GitHub
      </button>
    </template>
    <p v-if="message" class="account__message" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.account {
  display: inline-flex;
  flex-wrap: wrap;
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

.account__message {
  margin: 0;
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
