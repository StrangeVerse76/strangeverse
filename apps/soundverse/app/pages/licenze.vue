<script setup lang="ts">
useSeoMeta({ title: 'Licenze', description: 'Software di terze parti usato da Soundverse.' })
</script>

<template>
  <article class="licenses">
    <h1>Licenze</h1>
    <p>Soundverse usa questo software di terze parti.</p>

    <section aria-labelledby="lamejs">
      <h2 id="lamejs">@breezystack/lamejs (codifica MP3)</h2>
      <p>
        Porting in JavaScript dell'encoder MP3
        <a href="https://lame.sourceforge.io/" rel="noopener">LAME</a>, distribuito con licenza
        <a href="https://www.gnu.org/licenses/lgpl-3.0.html" rel="noopener">GNU LGPL 3.0</a>
        (che rimanda alla
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" rel="noopener">GNU GPL 3.0</a>). È usato
        senza modifiche, in un modulo separato che si carica solo quando si scarica un MP3. Il
        codice sorgente è su
        <a href="https://github.com/Breezystack/lamejs" rel="noopener"
          >github.com/Breezystack/lamejs</a
        >.
      </p>
    </section>

    <p class="muted">
      Tutto il resto di Soundverse (audio, analisi, interfaccia) è scritto da zero.
    </p>
  </article>
</template>

<style scoped>
.licenses {
  max-width: 44rem;
  padding-block: var(--space-6);
}

h2 {
  font-size: var(--text-lg);
}
</style>
