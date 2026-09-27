<script setup lang="ts">
const { site } = useAppConfig()
const route = useRoute()
</script>

<template>
  <header class="header">
    <div class="container header__inner" :class="{ 'container--wide': route.meta.wide }">
      <div class="brand">
        <NuxtLink :to="site.homeUrl" class="brand__home">
          <SiteLogo class="brand__logo" />
          <span>{{ site.name }}</span>
        </NuxtLink>
        <template v-if="site.appName">
          <span class="brand__sep" aria-hidden="true">/</span>
          <NuxtLink to="/" class="brand__app">{{ site.appName }}</NuxtLink>
        </template>
      </div>

      <nav v-if="site.nav.length" aria-label="Principale" class="nav">
        <NuxtLink v-for="item in site.nav" :key="item.to" :to="item.to" class="nav__link">
          {{ item.label }}
        </NuxtLink>
      </nav>

      <ThemeToggle />
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 5;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 85%, transparent);
  backdrop-filter: blur(12px);
}

.header__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  min-height: 4rem;
  padding-block: var(--space-2);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.brand__home,
.brand__app {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  text-decoration: none;
}

.brand__sep {
  color: var(--color-border);
  font-weight: 400;
}

.brand__app {
  color: var(--color-accent);
}

.brand__logo {
  width: 1.75rem;
  height: 1.75rem;
}

.nav {
  display: flex;
  gap: var(--space-1);
}

/* Su schermi stretti: marchio e tema sulla prima riga, il menu sotto. */
@media (max-width: 30rem) {
  .nav {
    order: 3;
    width: 100%;
    margin-inline: calc(-1 * var(--space-3));
  }
}

.nav__link {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
  font-weight: 500;
  text-decoration: none;
}

.nav__link:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.nav__link.router-link-exact-active {
  color: var(--color-text);
}
</style>
