<script lang="ts" setup>
/* ============================================================
   MEDAL SCRUB — scroll-scrubbed frame sequence
   Gold-medal presentation animation (box opens → medal swings
   in → box closes), rendered from a pre-extracted webp frame
   sequence in /public/medal/ and scrubbed frame-by-frame by
   scroll.

   Progress source: when an ancestor [data-medal-driver] section
   is pin-staged (`aw-staged`, see Portfolio.vue), progress is the
   scroll travel through the pin — the section holds still while
   the animation plays to its end, then releases. Otherwise (mobile,
   reduced motion) it falls back to the slot's own viewport travel.

   Perf contract (see project memory): no free-running rAF —
   draws happen only on scroll/resize events, and the scroll
   listener is attached only while the canvas is on screen.
   Frames lazy-load when the section approaches the viewport.
   ============================================================ */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const FRAME_COUNT = 150
const FRAME_W = 512
const FRAME_H = 910
const frameSrc = (i: number) => `/medal/f${String(i).padStart(3, '0')}.webp`
/* Frame shown when the user prefers reduced motion — medal fully presented. */
const STATIC_FRAME = 75
/* In pin mode the frames finish at 92% of the pin travel — the section
   holds the final frame briefly, then releases. */
const PIN_END = 0.92

const rootEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const readoutEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)

onMounted(() => {
  const root = rootEl.value
  const canvas = canvasEl.value
  if (!root || !canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  const driver = root.closest<HTMLElement>('[data-medal-driver]')

  const frames: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null)
  let loadStarted = false
  let currentFrame = -1
  let pendingFrame = 0
  let raf = 0
  let cssW = 0
  let cssH = 0

  function draw(index: number) {
    const img = frames[index]
    if (!img) return
    if (index === currentFrame) return
    currentFrame = index
    root!.dataset.frame = String(index)
    if (readoutEl.value) {
      readoutEl.value.textContent = `f ${String(index).padStart(3, '0')} / ${FRAME_COUNT - 1}`
    }
    if (barEl.value) {
      barEl.value.style.transform = `scaleX(${(index / (FRAME_COUNT - 1)).toFixed(4)})`
    }
    ctx!.fillStyle = '#000'
    ctx!.fillRect(0, 0, canvas!.width, canvas!.height)
    /* contain-fit — the source background is pure black, so bars are invisible */
    const scale = Math.min(canvas!.width / FRAME_W, canvas!.height / FRAME_H)
    const w = FRAME_W * scale
    const h = FRAME_H * scale
    ctx!.drawImage(img, (canvas!.width - w) / 2, (canvas!.height - h) / 2, w, h)
  }

  /* Nearest loaded frame at-or-below the target, so scrubbing degrades
     gracefully while frames are still arriving. */
  function drawNearest(target: number) {
    pendingFrame = target
    for (let i = target; i >= 0; i--) {
      if (frames[i]) { draw(i); return }
    }
  }

  function progress(): number {
    const vh = window.innerHeight
    if (driver && driver.classList.contains('aw-staged')) {
      /* pinned: travel through the tall section, frames done by PIN_END */
      const r = driver.getBoundingClientRect()
      const range = r.height - vh
      const raw = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 1
      return Math.min(1, raw / PIN_END)
    }
    /* fallback: the slot's own travel through the viewport */
    const m = root!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (vh - m.top) / (vh + m.height)))
  }

  function targetFrame(): number {
    if (reducedMotion) return STATIC_FRAME
    return Math.min(FRAME_COUNT - 1, Math.floor(progress() * FRAME_COUNT))
  }

  function update() {
    raf = 0
    /* force redraw after resize even if the frame index is unchanged */
    drawNearest(targetFrame())
  }

  function onScroll() {
    if (!raf) raf = requestAnimationFrame(update)
  }

  function loadFrames() {
    if (loadStarted) return
    loadStarted = true
    const wanted = reducedMotion ? [STATIC_FRAME] : [...Array(FRAME_COUNT).keys()]
    /* Modest concurrency: keeps the page's other asset streams breathing. */
    const CONCURRENCY = 6
    let next = 0
    const pump = () => {
      if (next >= wanted.length) return
      const i = wanted[next++]
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        frames[i] = img
        /* repaint if this frame unblocks the current scrub position */
        if (i <= pendingFrame && i > currentFrame) drawNearest(pendingFrame)
        pump()
      }
      img.onerror = pump
      img.src = frameSrc(i)
    }
    for (let k = 0; k < CONCURRENCY; k++) pump()
  }

  const ro = new ResizeObserver((entries) => {
    const box = entries[0].contentRect
    if (box.width === cssW && box.height === cssH) return
    cssW = box.width
    cssH = box.height
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(cssW * dpr))
    canvas.height = Math.max(1, Math.round(cssH * dpr))
    currentFrame = -1
    onScroll()
  })
  ro.observe(canvas)

  /* Start fetching frames well before the section scrolls in. */
  const nearIo = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      loadFrames()
      nearIo.disconnect()
    }
  }, { rootMargin: '1200px 0px' })
  nearIo.observe(root)

  /* Scrub only while on screen — listener detaches when scrolled away. */
  let listening = false
  const visIo = new IntersectionObserver((entries) => {
    const onScreen = entries.some((e) => e.isIntersecting)
    if (onScreen && !listening) {
      listening = true
      addEventListener('scroll', onScroll, { passive: true })
      onScroll()
    } else if (!onScreen && listening) {
      listening = false
      removeEventListener('scroll', onScroll)
    }
  }, { rootMargin: '120px 0px' })
  visIo.observe(root)

  onBeforeUnmount(() => {
    ro.disconnect()
    nearIo.disconnect()
    visIo.disconnect()
    if (listening) removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
  })
})
</script>

<template>
  <div ref="rootEl" class="medal-wrap">
    <div class="medal-glow" aria-hidden="true"></div>
    <div class="slot dark medal-scrub">
      <canvas ref="canvasEl" class="medal-canvas" aria-label="Gold medal presentation animation"></canvas>
      <span ref="readoutEl" class="medal-readout" aria-hidden="true">f 000 / 149</span>
      <i ref="barEl" class="medal-progress" aria-hidden="true"></i>
      <span class="medal-tag">Gold Medal · IITGN 2023</span>
    </div>
  </div>
</template>

<style scoped>
.medal-wrap {
  position: relative;
}
/* gold aura — swells with --aw-glow (set by the awards pin driver) while
   the medal is presented; sits behind the slot so it reads as light
   spilling from the box (spotlight treatment adapted from 21st.dev) */
.medal-glow {
  position: absolute;
  inset: -16%;
  /* the slot covers the inner ~76% of this box — keep meaningful alpha
     out past the slot edge so the aura actually shows around it */
  background: radial-gradient(
    closest-side,
    rgba(233, 196, 106, 0.5) 40%,
    rgba(233, 196, 106, 0.3) 76%,
    rgba(233, 196, 106, 0) 100%
  );
  opacity: var(--aw-glow, 0);
  pointer-events: none;
}
/* Below 980px the awards .split collapses to one column, so the wrap spans
   gutter to gutter and a -16% horizontal bleed lands outside the page —
   making the whole document horizontally scrollable (html/body only hid it
   via the global overflow-x:clip). Breakpoint matches .split's, so this
   covers landscape phones and tablets too, not just portrait. Keep the
   vertical swell; pull the sides inside the 1.5rem gutter. */
@media (max-width: 980px) {
  .medal-glow { inset: -16% -1rem; }
}
.medal-scrub {
  display: block;
  padding: 0;
  aspect-ratio: 9 / 16;
  max-height: min(72vh, 640px);
  background: #000;
  border-style: solid;
  border-color: rgba(255, 255, 255, 0.14);
}
/* real content — drop the placeholder hatch, keep the corner ticks */
.medal-scrub::before { display: none; }
.medal-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.medal-readout {
  position: absolute;
  top: 0.75rem;
  right: 0.85rem;
  font: 500 0.6rem/1 var(--f-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
.medal-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--accent, #dbfe52);
  transform: scaleX(0);
  transform-origin: left;
  pointer-events: none;
}
.medal-tag {
  position: absolute;
  left: 0.85rem;
  bottom: 0.75rem;
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
</style>
