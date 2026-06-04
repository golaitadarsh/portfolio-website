<script lang="ts" setup>
import * as THREE from 'three'
import { onMounted, onUnmounted, ref } from 'vue'

interface Props {
  dotColor?: string
  bgColor?: string
  dotSize?: number      // base dot radius in px
  spacing?: number      // grid spacing in px
  influence?: number    // cursor influence radius in px
  strength?: number     // displacement / glow strength [0,1]
  falloff?: number      // exponent of influence falloff
}

const props = withDefaults(defineProps<Props>(), {
  dotColor:  '#3a3a3a',
  bgColor:   '#ffffff',
  dotSize:   1.4,
  spacing:   28,
  influence: 180,
  strength:  0.9,
  falloff:   2.2,
})

const container = ref<HTMLElement | null>(null)

let renderer: THREE.WebGLRenderer
let animId: number

onMounted(() => {
  if (!container.value) return
  const el = container.value
  const canvas = el.querySelector('canvas') as HTMLCanvasElement

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  const bg = new THREE.Color(props.bgColor)
  renderer.setClearColor(bg, 1)

  const cam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const scene = new THREE.Scene()
  const geom  = new THREE.PlaneGeometry(2, 2)

  const dotCol = new THREE.Color(props.dotColor)

  const mat = new THREE.ShaderMaterial({
    transparent: false,
    depthTest:   false,
    uniforms: {
      uResolution: { value: new THREE.Vector2(el.clientWidth, el.clientHeight) },
      uMouse:      { value: new THREE.Vector2(-9999, -9999) },  // px space, top-left origin
      uDotColor:   { value: new THREE.Vector3(dotCol.r, dotCol.g, dotCol.b) },
      uBgColor:    { value: new THREE.Vector3(bg.r, bg.g, bg.b) },
      uDotSize:    { value: props.dotSize },
      uSpacing:    { value: props.spacing },
      uInfluence:  { value: props.influence },
      uStrength:   { value: props.strength },
      uFalloff:    { value: props.falloff },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec2  uResolution, uMouse;
      uniform vec3  uDotColor, uBgColor;
      uniform float uDotSize, uSpacing, uInfluence, uStrength, uFalloff, uPixelRatio;
      varying vec2  vUv;

      void main() {
        // Convert gl_FragCoord (drawing-buffer px) to CSS px to match mouse coords.
        // Origin remapped to top-left.
        vec2 fragPx = vec2(gl_FragCoord.x, (uResolution.y * uPixelRatio) - gl_FragCoord.y) / uPixelRatio;

        vec2 gridF      = fragPx / uSpacing;
        vec2 baseCellId = floor(gridF);

        // Track best (closest) dot across a 3x3 neighborhood. Needed because a
        // neighbor cell's dot can grow / displace into this fragment.
        float bestD   = 1e9;
        float bestInf = 0.0;
        float bestRad = 0.0;

        for (int ox = -1; ox <= 1; ox++) {
          for (int oy = -1; oy <= 1; oy++) {
            vec2 cellId   = baseCellId + vec2(float(ox), float(oy));
            vec2 centerPx = (cellId + 0.5) * uSpacing;

            vec2  fromMouse = centerPx - uMouse;
            float distM     = length(fromMouse);

            float inf = 1.0 - clamp(distM / uInfluence, 0.0, 1.0);
            inf = pow(inf, uFalloff);

            // Repel — displacement weight saturates at 1
            vec2  dir      = distM > 0.0001 ? fromMouse / distM : vec2(0.0);
            float shiftAmt = clamp(inf * uStrength, 0.0, 1.0);
            float maxShift = uSpacing * 0.45;
            vec2  displaced = centerPx + dir * shiftAmt * maxShift;

            float d      = length(fragPx - displaced);
            float radius = uDotSize * (1.0 + inf * uStrength * 1.2);

            // Closeness = (radius - d), bigger = inside. Pick winner by max.
            if (d - radius < bestD - bestRad) {
              bestD   = d;
              bestRad = radius;
              bestInf = inf;
            }
          }
        }

        float edge = 1.5;
        float mask = 1.0 - smoothstep(bestRad - edge, bestRad + edge, bestD);
        vec3  col  = mix(uDotColor, uDotColor * 1.8 + 0.2, bestInf * uStrength);

        gl_FragColor = vec4(mix(uBgColor, col, mask), 1.0);
      }
    `,
  })

  scene.add(new THREE.Mesh(geom, mat))

  // Cursor in CSS pixel space, top-left origin — matches gl_FragCoord remapping
  const mouse  = { x: -9999, y: -9999, active: false }
  const smooth = { x: -9999, y: -9999 }

  function setMouse(clientX: number, clientY: number) {
    const r = el.getBoundingClientRect()
    const nx = clientX - r.left
    const ny = clientY - r.top
    if (!mouse.active) {
      smooth.x = nx
      smooth.y = ny
      mouse.active = true
    }
    mouse.x = nx
    mouse.y = ny
  }
  function onMove(e: MouseEvent) { setMouse(e.clientX, e.clientY) }
  function onLeave() {
    mouse.x = -9999
    mouse.y = -9999
    mouse.active = false
  }
  function onDocMouseOut(e: MouseEvent) {
    // Fires when cursor leaves the viewport entirely
    if (!e.relatedTarget) onLeave()
  }
  function onTouch(e: TouchEvent) {
    if (!e.touches[0]) return
    setMouse(e.touches[0].clientX, e.touches[0].clientY)
  }
  function onResize() {
    const w = el.clientWidth, h = el.clientHeight
    renderer.setSize(w, h)
    mat.uniforms.uResolution.value.set(w, h)
  }

  window.addEventListener('mousemove', onMove, { passive: true })
  document.addEventListener('mouseout', onDocMouseOut)
  window.addEventListener('touchmove', onTouch, { passive: true })
  window.addEventListener('resize', onResize)

  function frame() {
    animId = requestAnimationFrame(frame)
    if (mouse.active) {
      smooth.x += (mouse.x - smooth.x) * 0.22
      smooth.y += (mouse.y - smooth.y) * 0.22
      mat.uniforms.uMouse.value.set(smooth.x, smooth.y)
    } else {
      mat.uniforms.uMouse.value.set(-9999, -9999)
    }
    renderer.render(scene, cam)
  }
  frame()

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseout', onDocMouseOut)
    window.removeEventListener('touchmove', onTouch)
    window.removeEventListener('resize', onResize)
    geom.dispose()
    mat.dispose()
    renderer.dispose()
  })
})
</script>

<template>
  <div ref="container" class="dot-field">
    <canvas></canvas>
  </div>
</template>

<style scoped>
.dot-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
.dot-field canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
