<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'

const FluidCursor = defineAsyncComponent(() => import('./components/fluid-cursor/FluidCursor.vue'))
const route = useRoute()
</script>

<template>
  <RouterView />
  <FluidCursor v-if="route.path === '/'" />
</template>
