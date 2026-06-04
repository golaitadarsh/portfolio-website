<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const prev = computed(() => route.meta.prev)
const next = computed(() => route.meta.next)
</script>

<template>
  <nav class="page-foot" aria-label="Page navigation" v-if="prev || next">
    <RouterLink v-if="prev" :to="prev.to" class="prev">
      <div class="dir">← Previous</div>
      <div class="label"><span class="num">{{ prev.num }}</span>{{ prev.label }}</div>
    </RouterLink>
    <RouterLink v-else to="/" class="prev">
      <div class="dir">← Home</div>
      <div class="label"><span class="num">00</span>Index</div>
    </RouterLink>
    <RouterLink v-if="next" :to="next.to" class="next">
      <div class="dir">Next →</div>
      <div class="label">{{ next.label }}<span class="num">{{ next.num }}</span></div>
    </RouterLink>
    <RouterLink v-else to="/" class="next">
      <div class="dir">Back →</div>
      <div class="label">Home<span class="num">00</span></div>
    </RouterLink>
  </nav>
</template>
