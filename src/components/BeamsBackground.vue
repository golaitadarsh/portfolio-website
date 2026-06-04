<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

interface Props {
  intensity?: 'subtle' | 'medium' | 'strong'
}

const props = withDefaults(defineProps<Props>(), {
  intensity: 'strong',
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
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let beams: Beam[] = []
let rafId = 0
const MINIMUM_BEAMS = 20

const opacityMap = { subtle: 0.35, medium: 0.55, strong: 0.8 } as const

function createBeam(width: number, height: number): Beam {
  const angle = -35 + Math.random() * 10
  return {
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
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const parent = canvas.parentElement
  if (!parent) return

  const updateCanvasSize = () => {
    const dpr = window.devicePixelRatio || 1
    const w = parent.clientWidth || window.innerWidth
    const h = parent.clientHeight || window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    const totalBeams = MINIMUM_BEAMS * 1.5
    beams = Array.from({ length: totalBeams }, () => createBeam(canvas.width, canvas.height))
  }

  updateCanvasSize()
  const ro = new ResizeObserver(updateCanvasSize)
  ro.observe(parent)
  window.addEventListener('resize', updateCanvasSize)

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
    return beam
  }

  function drawBeam(c: CanvasRenderingContext2D, beam: Beam) {
    c.save()
    c.translate(beam.x, beam.y)
    c.rotate((beam.angle * Math.PI) / 180)

    const pulsingOpacity =
      beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[props.intensity]

    const gradient = c.createLinearGradient(0, 0, 0, beam.length)
    gradient.addColorStop(0, `hsla(${beam.hue}, 90%, 65%, 0)`)
    gradient.addColorStop(0.1, `hsla(${beam.hue}, 90%, 65%, ${pulsingOpacity * 0.5})`)
    gradient.addColorStop(0.4, `hsla(${beam.hue}, 90%, 65%, ${pulsingOpacity})`)
    gradient.addColorStop(0.6, `hsla(${beam.hue}, 90%, 65%, ${pulsingOpacity})`)
    gradient.addColorStop(0.9, `hsla(${beam.hue}, 90%, 65%, ${pulsingOpacity * 0.5})`)
    gradient.addColorStop(1, `hsla(${beam.hue}, 90%, 65%, 0)`)

    c.fillStyle = gradient
    c.fillRect(-beam.width / 2, 0, beam.width, beam.length)
    c.restore()
  }

  function animate() {
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.filter = 'blur(35px)'
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

  onBeforeUnmount(() => {
    ro.disconnect()
    window.removeEventListener('resize', updateCanvasSize)
    if (rafId) cancelAnimationFrame(rafId)
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
  filter: blur(15px);
}
.beams-veil {
  position: absolute;
  inset: 0;
  background: rgba(14, 17, 9, 0.05);
  backdrop-filter: blur(50px);
  -webkit-backdrop-filter: blur(50px);
  animation: beams-veil-pulse 10s ease-in-out infinite;
}
@keyframes beams-veil-pulse {
  0%, 100% { opacity: 0.05; }
  50% { opacity: 0.15; }
}
</style>
