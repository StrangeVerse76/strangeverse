<script setup lang="ts">
const { site } = useAppConfig()

useHead({
  titleTemplate: (title) => {
    const base = site.appName || site.name
    return title ? `${title} · ${base}` : base
  },
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
