<script lang="ts" setup>
// The fluid cursor is not a global chrome layer — it belongs to the hero
// plate only, so Portfolio.vue mounts it and gates it on the hero zoom
// progress. See `fluidCursorActive` there.

// Mounted here rather than as a plain script tag in index.html: the Vue
// binding hooks vue-router, so each client-side navigation reports its own
// page view. A bare tag only ever sees the first load.
import { Analytics } from '@vercel/analytics/vue'
</script>

<template>
  <RouterView />
  <Analytics />
</template>
