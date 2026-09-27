<script setup lang="ts">
const { site } = useAppConfig()
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <p>{{ site.name }} · progetto personale</p>
      <a :href="site.repoUrl" rel="noopener">Codice su GitHub</a>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.footer__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  padding-block: var(--space-5);
}

.footer p {
  margin: 0;
}

.footer a {
  color: inherit;
}

.footer a:hover {
  color: var(--color-text);
}
</style>
