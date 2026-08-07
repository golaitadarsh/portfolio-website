<script lang="ts" setup>
// Topbar — sticky brand + 5-link nav. RouterLink auto-adds aria-current="page".
// Below 720px the nav collapses behind a toggle (see .nav-toggle / .nav rules
// in style.css); the links themselves are unchanged so routing and the
// active-state styling keep working in both presentations.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useMobileNav } from '../composables/useMobileNav'

const { open, toggle, close } = useMobileNav()

// Sync --topbar-h to the real rendered height (Portfolio.vue does the same for
// its own bar). The static clamp() is a pre-JS fallback and misses by a couple
// of px, which is enough for body copy to scroll through the seam under
// anything anchored to it — the /projects filter bar sticks at var(--topbar-h),
// and so does scroll-padding-top for every in-page anchor.
const barEl = ref<HTMLElement | null>(null)
let ro: ResizeObserver | null = null

function syncTopbarH() {
  const h = barEl.value?.getBoundingClientRect().height
  // Subpixel, not rounded: floor/ceil leaves a hairline the browser rounds
  // into a visible 1px seam.
  if (h) document.documentElement.style.setProperty('--topbar-h', `${h}px`)
}

onMounted(() => {
  syncTopbarH()
  if (barEl.value) {
    ro = new ResizeObserver(syncTopbarH)
    ro.observe(barEl.value)
  }
  // Web-font swap changes the lockup's height after first paint.
  document.fonts?.ready?.then(syncTopbarH)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  // Deliberately leaving --topbar-h set. Vue can flush this teardown after the
  // incoming route has mounted, so clearing it here would wipe the new bar's
  // measurement and drop the page back to the clamp() fallback mid-navigation.
  // Every route re-syncs on mount, and both bars measure the same anyway.
})
</script>

<template>
  <header ref="barEl" class="topbar">
    <RouterLink to="/" class="brand" @click="close">
      <span class="brand-dot"></span>
      ADARSH GOLAIT
      <span class="brand-sub">— Portfolio</span>
    </RouterLink>

    <button
      type="button"
      class="nav-toggle"
      :aria-expanded="open"
      aria-controls="primary-nav"
      :aria-label="open ? 'Close menu' : 'Open menu'"
      @click="toggle"
    >
      <span class="bars" aria-hidden="true"></span>
      <span>{{ open ? 'Close' : 'Menu' }}</span>
    </button>

    <nav
      id="primary-nav"
      class="nav"
      :class="{ 'is-open': open }"
      aria-label="Primary"
      @click="close"
    >
      <RouterLink to="/education"><span class="nav-num">01</span><span class="nav-label">Education</span></RouterLink>
      <RouterLink to="/experience"><span class="nav-num">02</span><span class="nav-label">Experience</span></RouterLink>
      <RouterLink to="/projects"><span class="nav-num">03</span><span class="nav-label">Projects</span></RouterLink>
      <RouterLink to="/leadership"><span class="nav-num">04</span><span class="nav-label">Leadership</span></RouterLink>
      <RouterLink to="/recognition"><span class="nav-num">05</span><span class="nav-label">Recognition</span></RouterLink>
    </nav>
  </header>
</template>
