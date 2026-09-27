<script setup lang="ts">
const { site } = useAppConfig()

useSeoMeta({
  title: 'Chi sono',
  description: 'Chi c’è dietro StrangeVerse e perché esiste.',
})
</script>

<template>
  <article class="about">
    <h1>Chi sono</h1>
    <!-- TODO(Pietro): sostituire con i propri contenuti. -->
    <p>
      Ciao, sono <strong>Pietro</strong>. StrangeVerse è il mio spazio personale per costruire
      piccole app per il browser: cose che mi incuriosiscono, strumenti che mi servono, esperimenti
      per imparare.
    </p>
    <p>
      La prima è un'app per fare musica. Le altre arriveranno una alla volta, ciascuna con il suo
      angolo di multiverso.
    </p>
    <p class="muted">
      Il progetto è aperto: il codice è su
      <a :href="site.repoUrl" rel="noopener">GitHub</a>.
    </p>
  </article>
</template>

<style scoped>
.about {
  max-width: 40rem;
  padding-block: var(--space-6);
}

.about p {
  font-size: var(--text-lg);
}
</style>
