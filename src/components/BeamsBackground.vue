<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'

interface Props {
  intensity?: 'subtle' | 'medium' | 'strong'
  /** When true (component fully occluded — e.g. doors closed), the rAF loop
   *  sleeps. The beam field freezes in place; since nothing is visible while
   *  paused, the resumed frame is indistinguishable from a running one. */
  paused?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  intensity: 'strong',
  paused: false,
})

interface Beam {
  x: number
  y: number
  width: number
  length: number
  angle: number
  speed: number
  opacity: number
  hue: number
  pulse: number
  pulseSpeed: number
  sprite: HTMLCanvasElement | null
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let beams: Beam[] = []
let rafId = 0
const MINIMUM_BEAMS = 20

const opacityMap = { subtle: 0.35, medium: 0.55, strong: 0.8 } as const

// The old draw path set `ctx.filter = 'blur(35px)'` and re-blurred every
// gradient rect on every frame — by far the most expensive 2D-canvas work on
// the page. The gradient SHAPE of a beam only changes when the beam resets
// (new width/length/hue); only its overall alpha pulses per frame, and all
// gradient stops scale linearly with that alpha. So each beam's blurred
// gradient is baked once into a sprite at unit alpha, and the frame loop just
// drawImage()s it with globalAlpha = the pulsing opacity — pixel-equivalent
// output (Gaussian blur is rotation-invariant and alpha is linear).
//
// Sprites are baked at 1/4 scale: under 35px baked blur + ~52px CSS blur, the
// upscale is invisible, and it keeps 30 sprites at ~8MB total instead of 120MB.
const SPRITE_SCALE = 0.25
const BLUR_PX = 35
const PAD = BLUR_PX * 2

function bakeSprite(beam: Beam) {
  const w = Math.max(1, Math.ceil((beam.width + PAD * 2) * SPRITE_SCALE))
  const h = Math.max(1, Math.ceil((beam.length + PAD * 2) * SPRITE_SCALE))
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const c = off.getContext('2d')
  if (!c) {
    beam.sprite = null
    return
  }
  // All coordinates pre-multiplied by SPRITE_SCALE with an identity CTM —
  // engines disagree on whether ctx.filter blur radii track the transform,
  // so device-space math keeps the result deterministic everywhere.
  c.filter = `blur(${BLUR_PX * SPRITE_SCALE}px)`
  const pad = PAD * SPRITE_SCALE
  const gradient = c.createLinearGradient(0, pad, 0, pad + beam.length * SPRITE_SCALE)
  gradient.addColorStop(0, `hsla(${beam.hue}, 90%, 65%, 0)`)
  gradient.addColorStop(0.1, `hsla(${beam.hue}, 90%, 65%, 0.5)`)
  gradient.addColorStop(0.4, `hsla(${beam.hue}, 90%, 65%, 1)`)
  gradient.addColorStop(0.6, `hsla(${beam.hue}, 90%, 65%, 1)`)
  gradient.addColorStop(0.9, `hsla(${beam.hue}, 90%, 65%, 0.5)`)
  gradient.addColorStop(1, `hsla(${beam.hue}, 90%, 65%, 0)`)
  c.fillStyle = gradient
  c.fillRect(pad, pad, beam.width * SPRITE_SCALE, beam.length * SPRITE_SCALE)
  beam.sprite = off
}

function createBeam(width: number, height: number): Beam {
  const angle = -35 + Math.random() * 10
  const beam: Beam = {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.12 + Math.random() * 0.16,
    hue: 70 + Math.random() * 30,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
    sprite: null,
  }
  bakeSprite(beam)
  return beam
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const parent = canvas.parentElement
  if (!parent) return

  // Last applied backing-store size. Rebuilding the beam field is expensive —
  // 30 fresh offscreen canvases, each filled through a 35px Gaussian — and it
  // also visibly restarts the field. It must happen only when the size really
  // changed, not on every event that merely *might* mean a resize.
  let lastW = -1
  let lastH = -1

  const updateCanvasSize = () => {
    // Capped at 2 like every other canvas on the site. This one was the sole
    // exception, and it is the most expensive surface here: a full-viewport
    // 2D canvas under a 52px blur. At DPR 3 the uncapped backing store cost
    // 2.25× the fill of DPR 2 for sharpness no eye can resolve through that
    // much blur.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth || window.innerWidth
    const h = parent.clientHeight || window.innerHeight
    const bw = Math.round(w * dpr)
    const bh = Math.round(h * dpr)
    if (bw === lastW && bh === lastH) return
    lastW = bw
    lastH = bh
    canvas.width = bw
    canvas.height = bh
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    const totalBeams = MINIMUM_BEAMS * 1.5
    beams = Array.from({ length: totalBeams }, () => createBeam(canvas.width, canvas.height))
  }

  updateCanvasSize()
  // ResizeObserver on the parent already fires for window resizes (the parent
  // is viewport-sized), so the extra window listener only ever duplicated the
  // work — two full field rebuilds per resize frame while a window is dragged,
  // and on every URL-bar nudge on mobile.
  const ro = new ResizeObserver(updateCanvasSize)
  ro.observe(parent)

  function resetBeam(beam: Beam, index: number, totalBeams: number) {
    if (!canvas) return beam
    const column = index % 3
    const spacing = canvas.width / 3
    beam.y = canvas.height + 100
    beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5
    beam.width = 100 + Math.random() * 100
    beam.speed = 0.5 + Math.random() * 0.4
    beam.hue = 70 + (index * 30) / totalBeams
    beam.opacity = 0.2 + Math.random() * 0.1
    bakeSprite(beam)
    return beam
  }

  function drawBeam(c: CanvasRenderingContext2D, beam: Beam) {
    if (!beam.sprite) return
    c.save()
    c.translate(beam.x, beam.y)
    c.rotate((beam.angle * Math.PI) / 180)
    c.globalAlpha = Math.min(
      1,
      beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[props.intensity]
    )
    c.drawImage(
      beam.sprite,
      -beam.width / 2 - PAD,
      -PAD,
      beam.width + PAD * 2,
      beam.length + PAD * 2
    )
    c.restore()
  }

  // Second gate: the whole stage can scroll out of the viewport (sections
  // after the door reveal) — no point animating an off-screen canvas.
  let inViewport = true
  const visObs = new IntersectionObserver((entries) => {
    inViewport = entries.some((e) => e.isIntersecting)
    if (inViewport && rafId === 0 && !props.paused) {
      rafId = requestAnimationFrame(animate)
    }
  })
  visObs.observe(parent)

  function animate() {
    if (!canvas || !ctx) return
    if (props.paused || !inViewport) {
      rafId = 0
      return
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const totalBeams = beams.length
    beams.forEach((beam, index) => {
      beam.y -= beam.speed
      beam.pulse += beam.pulseSpeed
      if (beam.y + beam.length < -100) resetBeam(beam, index, totalBeams)
      drawBeam(ctx, beam)
    })
    rafId = requestAnimationFrame(animate)
  }
  animate()

  watch(
    () => props.paused,
    (paused) => {
      if (!paused && rafId === 0 && inViewport) {
        rafId = requestAnimationFrame(animate)
      }
    }
  )

  onBeforeUnmount(() => {
    ro.disconnect()
    visObs.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    // Offscreen sprite canvases hold a backing store each — drop the refs so
    // they are collectable immediately rather than at the whim of the closure.
    beams = []
  })
})
</script>

<template>
  <div class="beams-bg" aria-hidden="true">
    <canvas ref="canvasRef" class="beams-canvas" />
    <div class="beams-veil" />
  </div>
</template>

<style scoped>
.beams-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.beams-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Was blur(15px) here + backdrop-filter blur(50px) on .beams-veil. The
     backdrop blur re-blurred the full viewport every frame — the single most
     expensive compositor op on the page. Gaussian blurs compose in
     quadrature: √(15² + 50²) ≈ 52px, and the only content behind the veil is
     this canvas over a flat dark background, so folding the veil's blur into
     the canvas filter is visually identical at a fraction of the cost. */
  filter: blur(52px);
}
.beams-veil {
  position: absolute;
  inset: 0;
  background: rgba(14, 17, 9, 0.05);
  animation: beams-veil-pulse 10s ease-in-out infinite;
}
@keyframes beams-veil-pulse {
  0%, 100% { opacity: 0.05; }
  50% { opacity: 0.15; }
}
</style>
