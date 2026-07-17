<script lang="ts" setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

export interface WallPhoto {
  src: string
  cap: string
}

const props = defineProps<{
  photos: WallPhoto[]
  label?: string
}>()

const ROWS = 3
const COLS = 3
const N = ROWS * COLS

const gridEl = ref<HTMLElement | null>(null)
const partEls: HTMLElement[] = []
const setPartEl = (el: unknown, i: number) => {
  if (el) partEls[i] = el as HTMLElement
}

const showing = reactive(Array.from({ length: N }, () => 'front' as 'front' | 'back'))
const offsets = reactive(Array.from({ length: N }, () => ({ w: 0, h: 0, x: 0, y: 0 })))
const assembledUrl = ref('')
const tagText = ref('')
const tagOn = ref(false)
// Gate the tile background URLs until the wall approaches the viewport —
// nine ~300KB JPEGs otherwise download at page load, racing the hero's
// first-paint assets. 1200px of lead keeps the swap invisible.
const near = ref(false)

let stagger = 0
let returning = false
let timers: number[] = []
let ro: ResizeObserver | null = null
let nearIo: IntersectionObserver | null = null

const later = (fn: () => void, ms: number) => {
  timers.push(window.setTimeout(fn, ms))
}

/* backs assemble the full image: each back-img is grid-sized,
   offset by its tile's measured position (gap-safe, responsive) */
function size() {
  const grid = gridEl.value
  if (!grid) return
  const g = grid.getBoundingClientRect()
  if (g.width < 10) return
  partEls.forEach((el, i) => {
    const t = el.getBoundingClientRect()
    offsets[i] = {
      w: g.width - 2,
      h: g.height - 2,
      x: -(t.left - g.left - 1),
      y: -(t.top - g.top - 1),
    }
  })
}

function backStyle(i: number) {
  const o = offsets[i]
  return {
    width: `${o.w}px`,
    height: `${o.h}px`,
    transform: `translate(${o.x}px, ${o.y}px)`,
    backgroundImage: assembledUrl.value ? `url("${assembledUrl.value}")` : undefined,
  }
}

function frontStyle(i: number) {
  const photo = props.photos[i]
  return photo && near.value ? { backgroundImage: `url("${photo.src}")` } : undefined
}

function wave(r: number, c: number) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return
  const i = r * COLS + c
  if (showing[i] === 'back') return
  showing[i] = 'back'
  later(() => {
    wave(r + 1, c)
    wave(r - 1, c)
    wave(r, c + 1)
    wave(r, c - 1)
  }, stagger)
}

function onClick(e: MouseEvent) {
  const partEl = (e.target as HTMLElement).closest('.wg-part')
  if (!partEl || returning) return
  const i = partEls.indexOf(partEl as HTMLElement)
  if (i < 0) return

  if (showing[i] === 'front') {
    const photo = props.photos[i]
    if (!photo) return
    assembledUrl.value = photo.src
    wave(Math.floor(i / COLS), i % COLS)
    tagText.value = photo.cap
    tagOn.value = true
  } else if (showing.filter((s) => s === 'back').length === N) {
    returning = true
    tagOn.value = false
    showing.forEach((_, j) => {
      later(() => {
        showing[j] = 'front'
        if (j === N - 1) returning = false
      }, j * (stagger ? 45 : 0))
    })
  }
}

onMounted(() => {
  stagger = matchMedia('(prefers-reduced-motion: no-preference)').matches ? 120 : 0
  ro = new ResizeObserver(size)
  if (gridEl.value) ro.observe(gridEl.value)
  size()
  if (gridEl.value) {
    nearIo = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.value = true
        nearIo?.disconnect()
      }
    }, { rootMargin: '1200px 0px' })
    nearIo.observe(gridEl.value)
  } else {
    near.value = true
  }
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  timers = []
  ro?.disconnect()
  nearIo?.disconnect()
})
</script>

<template>
  <div class="wg">
    <div class="wg-grid" ref="gridEl" :aria-label="label" @click="onClick">
      <div
        v-for="(s, i) in showing"
        :key="i"
        class="wg-part"
        :class="{ 'show-front': s === 'front' }"
        :ref="(el) => setPartEl(el, i)"
      >
        <div class="wg-back">
          <div class="wg-back-img" :class="{ ph: !assembledUrl }" :style="backStyle(i)"></div>
        </div>
        <div class="wg-front" :class="{ 'has-photo': !!photos[i] }" :style="frontStyle(i)">
          <span class="wg-ix">{{ String(i + 1).padStart(2, '0') }}</span>
          <span v-if="photos[i]" class="wg-lb">{{ photos[i].cap }}</span>
        </div>
      </div>
      <span class="wg-tag" :class="{ on: tagOn }">{{ tagText }}</span>
    </div>
  </div>
</template>

<style scoped>
.wg-grid {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 1px;
  padding: 1px;
  background: var(--ink);
  border: 1px solid var(--ink);
  perspective: 1100px;
}
.wg-part {
  position: relative;
  transform: rotateY(180deg);
  transform-style: preserve-3d;
  transition: transform 0.34s ease-in-out;
  background: var(--paper);
}
.wg-part.show-front { transform: none; }

.wg-front,
.wg-back {
  position: absolute;
  inset: 0;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  overflow: hidden;
  cursor: pointer;
}
.wg-front {
  background-color: var(--paper-2);
  background-size: cover;
  background-position: center;
}
.wg-front:not(.has-photo)::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(-45deg, transparent 0, transparent 14px, rgba(9, 9, 11, 0.035) 14px, rgba(9, 9, 11, 0.035) 28px);
}
.wg-front.has-photo {
  filter: grayscale(1);
  transition: filter 0.25s ease, box-shadow 0.25s ease;
}
.wg-part.show-front:hover .wg-front.has-photo { filter: grayscale(0); }
.wg-part.show-front:hover .wg-front { box-shadow: inset 0 0 0 2px var(--accent); }
.wg-front .wg-ix {
  position: absolute;
  top: 5px;
  left: 6px;
  font: 500 0.52rem/1 var(--f-mono);
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  padding: 3px 4px;
  background: rgba(255, 255, 255, 0.82);
}
.wg-front .wg-lb {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  font: 500 0.5rem/1 var(--f-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink);
  padding: 4px 4px 5px;
  background: rgba(255, 255, 255, 0.86);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wg-back {
  transform: rotateY(180deg);
  background: var(--ink);
}
.wg-back-img {
  position: absolute;
  top: 0;
  left: 0;
  background-size: cover;
  background-position: center;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}
.wg-back-img.ph {
  background-color: var(--paper-2);
  background-image: repeating-linear-gradient(-45deg, transparent 0, transparent 22px, rgba(9, 9, 11, 0.035) 22px, rgba(9, 9, 11, 0.035) 44px);
}

/* caption chip on the assembled photo */
.wg-tag {
  position: absolute;
  left: 1px;
  bottom: 1px;
  z-index: 5;
  pointer-events: none;
  font: 500 0.56rem/1 var(--f-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
  padding: 5px 7px 6px;
  background: rgba(255, 255, 255, 0.88);
  opacity: 0;
  transition: opacity 0.25s ease;
}
.wg-tag.on {
  opacity: 1;
  transition-delay: 0.55s;
}

@media (prefers-reduced-motion: reduce) {
  .wg-part { transition: none; }
}
</style>
