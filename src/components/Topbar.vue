<script lang="ts" setup>
// Topbar — sticky brand + 5-link nav. RouterLink auto-adds aria-current="page".
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <span class="brand-dot"></span>
      ADARSH GOLAIT
      <span class="brand-sub">— Portfolio</span>
    </RouterLink>
    <nav class="nav" aria-label="Primary">
      <RouterLink to="/education"><span class="nav-num">01</span><span class="nav-label">Education</span></RouterLink>
      <RouterLink to="/experience"><span class="nav-num">02</span><span class="nav-label">Experience</span></RouterLink>
      <RouterLink to="/projects"><span class="nav-num">03</span><span class="nav-label">Projects</span></RouterLink>
      <RouterLink to="/leadership"><span class="nav-num">04</span><span class="nav-label">Leadership</span></RouterLink>
      <RouterLink to="/recognition"><span class="nav-num">05</span><span class="nav-label">Recognition</span></RouterLink>
    </nav>
  </header>
</template>
