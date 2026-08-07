<script lang="ts" setup>
// The fluid cursor is not a global chrome layer — it belongs to the hero
// plate only, so Portfolio.vue mounts it and gates it on the hero zoom
// progress. See `fluidCursorActive` there.
</script>

<template>
  <RouterView />
</template>
