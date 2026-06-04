<script lang="ts" setup>
import Topbar from '../components/Topbar.vue'
import PageFoot from '../components/PageFoot.vue'
</script>

<template>
  <Topbar />
  <main>
    <slot />
  </main>
  <PageFoot />
</template>
