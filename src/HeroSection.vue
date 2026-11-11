<script lang="ts" setup>
import * as THREE from 'three'
import { onMounted, ref, onUnmounted, defineAsyncComponent } from 'vue'

// Lossless WebP re-encodes of the original PNGs (identical pixels, ~55%
// smaller — saves ~1MB off the critical first-paint payload). The .png
// sources stay in assets/ as the editing masters.
import basePhotoUrl     from '../assets/base-photo.webp?url'
import layeredPhotoUrl  from '../assets/layered-photo.webp?url'
import { deviceTier, tuneRenderer } from './perf/deviceTier'
import { hasWebGL2 } from './perf/webgl'
import { BASE_ASP, LAYERED_ASP, SUBJECT, heroFitUV } from './heroFraming'

const DotField = defineAsyncComponent(() => import('./components/dot-field/DotField.vue'))

// The dot field is a second full-screen WebGL context stacked behind the hero's
// own one. Creating it costs a context + extension probe whether or not anyone
// ever moves a cursor over it, and on a machine that is already dropping frames
// that is the wrong trade. Below the tier bar it renders as a static CSS dot
// grid instead: same colour, same 28px pitch, same dot size — it just doesn't
// bend around the cursor. Read once, at setup, so it can never change under a
// live component and swap a canvas out mid-session.
const lowTier = deviceTier() === 'low'

// Nothing on this page can draw without a WebGL2 context. Asked once, up
// front, so the surfaces that would each discover it separately (and each log
// a hard three error for it) simply don't mount. See perf/webgl.ts.
const webglOK = hasWebGL2()

interface Props {
  showTopbar?: boolean
  scrollCueTarget?: string
  // When false, the scroll cue renders as a non-interactive visual hint (no
  // anchor). Used by the portfolio embed, where the "next section" is the
  // scroll-driven door reveal — not a section you can hash-jump to. On the
  // standalone home route the cue stays a real link to #home-content.
  scrollCueLink?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  showTopbar: true,
  scrollCueTarget: '#home-content',
  scrollCueLink: true,
})

const container = ref<HTMLElement | null>(null)

// WebGL can be unavailable (browser policy, headless, old GPU). The fluid
// reveal is decorative — when the renderer can't be created we show the
// static base photo instead of letting the mounted hook throw, which would
// abort route navigation and blank the page.
const webglFailed = ref(false)

const SIM_RES = 128

let renderer: THREE.WebGLRenderer
// 0 = loop parked (see the viewport gate in animate()); rAF ids are always >= 1.
let animId = 0

const mouse     = { x: 0.5, y: 0.5 }
const prevMouse = { x: 0.5, y: 0.5 }
const smooth    = { x: 0.5, y: 0.5 }
let mouseOnScreen = false

onMounted(() => {
  if (!container.value) return
  const el = container.value

  const canvas = el.querySelector('#three-canvas') as HTMLCanvasElement
  if (!webglOK) {
    webglFailed.value = true
    return
  }
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    })
  } catch {
    webglFailed.value = true
    return
  }
  tuneRenderer(renderer)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  renderer.setClearColor(0x000000, 0)

  // ── textures ──────────────────────────────────────────────────────────────
  const loader = new THREE.TextureLoader()
  function tex(url: string, srgb = false) {
    const t = loader.load(url)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.minFilter  = THREE.LinearFilter
    t.magFilter  = THREE.LinearFilter
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  }
  const tBase    = tex(basePhotoUrl,    true)
  const tLayered = tex(layeredPhotoUrl, true)

  // ── fluid sim render targets ──────────────────────────────────────────────
  const rtOpts: THREE.RenderTargetOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format:    THREE.RGBAFormat,
    type:      THREE.HalfFloatType,
    wrapS:     THREE.RepeatWrapping,
    wrapT:     THREE.RepeatWrapping,
  }
  let velA = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts)
  let velB = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts)
  let dyeA = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts)
  let dyeB = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts)

  const simCam  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadGeo = new THREE.PlaneGeometry(2, 2)
  const simV = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.); }`

  const velSplatMat = new THREE.ShaderMaterial({
    uniforms: {
      uSrc:    { value: null as unknown as THREE.Texture },
      uPoint:  { value: new THREE.Vector2(0.5, 0.5) },
      uDelta:  { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 0.12 },
      uTime:   { value: 0 },
      uSwirl:  { value: 0 },
    },
    vertexShader: simV,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uSrc;
      uniform vec2 uPoint, uDelta;
      uniform float uRadius, uTime, uSwirl;
      varying vec2 vUv;
      void main(){
        vec2 d = vUv - uPoint;
        float r2 = dot(d,d);
        float g = exp(-r2/(uRadius*uRadius));
        vec2 perp = vec2(-uDelta.y, uDelta.x);
        float wob = sin(uTime * 4.0 + vUv.x * 22.0) * 0.5
                  + cos(uTime * 3.3 + vUv.y * 18.0) * 0.5;
        vec2 v = texture2D(uSrc,vUv).xy
               + uDelta * g
               + perp   * g * uSwirl * wob;
        gl_FragColor = vec4(v, 0., 1.);
      }`,
  })

  const dyeSplatMat = new THREE.ShaderMaterial({
    uniforms: {
      uSrc:      { value: null as unknown as THREE.Texture },
      uPoint:    { value: new THREE.Vector2(0.5, 0.5) },
      uRadius:   { value: 0.14 },
      uStrength: { value: 0.0 },
    },
    vertexShader: simV,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uSrc;
      uniform vec2 uPoint;
      uniform float uRadius, uStrength;
      varying vec2 vUv;
      void main(){
        vec2 d = vUv - uPoint;
        float g = exp(-dot(d,d)/(uRadius*uRadius));
        float v = texture2D(uSrc,vUv).r + g * uStrength;
        gl_FragColor = vec4(clamp(v,0.,1.5), 0., 0., 1.);
      }`,
  })

  const velAdvMat = new THREE.ShaderMaterial({
    uniforms: {
      uVel:    { value: null as unknown as THREE.Texture },
      uDt:     { value: 0.016 },
      uDecay:  { value: 1.0 },
      uInvRes: { value: new THREE.Vector2(1/SIM_RES, 1/SIM_RES) },
    },
    vertexShader: simV,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uVel;
      uniform float uDt, uDecay;
      uniform vec2 uInvRes;
      varying vec2 vUv;
      void main(){
        vec2 v = texture2D(uVel,vUv).xy;
        vec2 c = vUv - v * uDt;
        c = clamp(c, 0.001, 0.999);
        gl_FragColor = texture2D(uVel,c) * uDecay;
      }`,
  })

  const dyeAdvMat = new THREE.ShaderMaterial({
    uniforms: {
      uVel:    { value: null as unknown as THREE.Texture },
      uDye:    { value: null as unknown as THREE.Texture },
      uDt:     { value: 0.016 },
      uDecay:  { value: 0.91 },
      uInvRes: { value: new THREE.Vector2(1/SIM_RES, 1/SIM_RES) },
    },
    vertexShader: simV,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uVel, uDye;
      uniform float uDt, uDecay;
      uniform vec2 uInvRes;
      varying vec2 vUv;
      void main(){
        vec2 v = texture2D(uVel,vUv).xy;
        vec2 c = vUv - v * uDt;
        c = clamp(c, 0.001, 0.999);
        float d = texture2D(uDye,c).r * uDecay;
        gl_FragColor = vec4(d, 0., 0., 1.);
      }`,
  })

  function makeScene(mat: THREE.Material) {
    const s = new THREE.Scene()
    s.add(new THREE.Mesh(quadGeo, mat))
    return s
  }
  const vsScene = makeScene(velSplatMat)
  const dsScene = makeScene(dyeSplatMat)
  const vaScene = makeScene(velAdvMat)
  const daScene = makeScene(dyeAdvMat)

  // ── cover-fit math ────────────────────────────────────────────────────────
  // The fit itself lives in ../heroFraming — Portfolio.vue's page-2 crop has
  // to know where this puts the subject, and the two drifting apart is what
  // put a dead grey band above the head in the landed slot.
  const BASE_EYE_UV     = 1 - SUBJECT.eyeY
  const LAYERED_EYE_UV  = 0.81
  const BASE_X_NUDGE    = 0
  const LAYERED_X_NUDGE = -0.005
  const fitUV = heroFitUV

  // ── main display scene — flat ortho quad ──────────────────────────────────
  const mainScene = new THREE.Scene()
  const mainCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const displayGeo = new THREE.PlaneGeometry(2, 2)

  const vpW0 = el.clientWidth, vpH0 = el.clientHeight
  const covBase    = fitUV(vpW0, vpH0, BASE_ASP,    BASE_EYE_UV,    BASE_X_NUDGE)
  const covLayered = fitUV(vpW0, vpH0, LAYERED_ASP, LAYERED_EYE_UV, LAYERED_X_NUDGE)

  const displayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest:   false,
    uniforms: {
      uBase:    { value: tBase },
      uLayered: { value: tLayered },
      uDye:     { value: dyeA.texture },
      uMouse:   { value: new THREE.Vector2(0.5, 0.5) },
      // Uniform parallax — applied identically to base + layered so silhouette,
      // RGB, and alpha all translate together. Zero distortion possible.
      uParallax: { value: 0.012 },
      uBaseSc:  { value: new THREE.Vector2(covBase.sx,    covBase.sy) },
      uBaseOf:  { value: new THREE.Vector2(covBase.ox,    covBase.oy) },
      uLaySc:   { value: new THREE.Vector2(covLayered.sx, covLayered.sy) },
      uLayOf:   { value: new THREE.Vector2(covLayered.ox, covLayered.oy) },
    },
    vertexShader: /* glsl */`
      precision highp float;
      uniform vec2 uBaseSc, uBaseOf;
      varying vec2 vScrUv;
      varying vec2 vBaseUv;
      void main(){
        vScrUv  = uv;
        vBaseUv = uv * uBaseSc + uBaseOf;
        gl_Position = vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uBase, uLayered, uDye;
      uniform vec2  uMouse, uLaySc, uLayOf;
      uniform float uParallax;
      varying vec2  vScrUv, vBaseUv;

      void main(){
        // Uniform UV shift — image translates with cursor, identical for base + layered.
        // No depth modulation, no mask change. Pure translation = silhouette + edges
        // stay pixel-perfect with no fringe reveal.
        vec2 pOff = -(uMouse - 0.5) * uParallax;

        vec2 baseUv = vBaseUv + pOff;
        vec2 layUv  = vScrUv * uLaySc + uLayOf + pOff;

        vec4 baseS = texture2D(uBase,    baseUv);
        vec4 layS  = texture2D(uLayered, layUv);

        float dye    = texture2D(uDye, vScrUv).r;
        float reveal = smoothstep(0.0044, 0.20, dye);

        vec3  rgb = mix(baseS.rgb, layS.rgb, reveal);
        float a   = mix(baseS.a,   layS.a,   reveal);

        // Output transparent outside silhouette so background (DotField) shows through.
        gl_FragColor = vec4(rgb, a);
      }`,
  })

  const displayMesh = new THREE.Mesh(displayGeo, displayMat)
  mainScene.add(displayMesh)

  // ── fluid sim step ────────────────────────────────────────────────────────
  let simTime = 0
  // Set true in animate() when the page has scrolled — used here only to
  // freeze NEW dye splats so a stationary cursor sitting on the helmet doesn't
  // keep re-painting it during the zoom. Existing dye decays normally.
  let freezeSplats = false
  function stepSim(dt: number) {
    simTime += dt
    const dx = mouse.x - prevMouse.x
    const dy = mouse.y - prevMouse.y
    const speed = Math.hypot(dx, dy)
    const splatOn = (mouseOnScreen || phantomActive) && !freezeSplats

    velSplatMat.uniforms.uSrc.value  = velA.texture
    velSplatMat.uniforms.uPoint.value.set(mouse.x, mouse.y)
    velSplatMat.uniforms.uTime.value = simTime
    const velMag = Math.min(speed * 220, 12)
    const dirX = speed > 1e-5 ? dx / speed : 0
    const dirY = speed > 1e-5 ? dy / speed : 0
    velSplatMat.uniforms.uDelta.value.set(dirX * velMag, dirY * velMag)
    velSplatMat.uniforms.uSwirl.value = splatOn ? 3.6 : 0
    renderer.setRenderTarget(velB)
    renderer.render(vsScene, simCam)
    ;[velA, velB] = [velB, velA]

    dyeSplatMat.uniforms.uSrc.value      = dyeA.texture
    dyeSplatMat.uniforms.uPoint.value.set(mouse.x, mouse.y)
    dyeSplatMat.uniforms.uStrength.value = splatOn
      ? Math.min(0.25 + speed * 30, 1.2)
      : 0
    renderer.setRenderTarget(dyeB)
    renderer.render(dsScene, simCam)
    ;[dyeA, dyeB] = [dyeB, dyeA]

    velAdvMat.uniforms.uVel.value = velA.texture
    velAdvMat.uniforms.uDt.value  = dt
    renderer.setRenderTarget(velB)
    renderer.render(vaScene, simCam)
    ;[velA, velB] = [velB, velA]

    dyeAdvMat.uniforms.uVel.value = velA.texture
    dyeAdvMat.uniforms.uDye.value = dyeA.texture
    dyeAdvMat.uniforms.uDt.value  = dt
    renderer.setRenderTarget(dyeB)
    renderer.render(daScene, simCam)
    ;[dyeA, dyeB] = [dyeB, dyeA]

    renderer.setRenderTarget(null)
  }

  // Reveal cursor (CSS px, top-left origin). Declared BEFORE animate() so
  // the first synchronous run of the loop doesn't hit a TDZ error.
  let revealX = -9999, revealY = -9999, revealActive = false
  let revealPX = -9999, revealPY = -9999     // previous-frame cursor for velocity
  let revealSX = -9999, revealSY = -9999
  // Trail lags — slower LERP factors create a fluid-streak shape
  let r1x = -9999, r1y = -9999
  let r2x = -9999, r2y = -9999
  // strength: 1 while cursor active, decays toward 0 on leave (smooth fade-out)
  // radius: grows with cursor speed, capped — drives mask reach
  let revealStrength = 0
  let revealRadius   = 180

  // Phantom splashes — random idle hints that hero is interactive.
  // Drives the same virtual cursor (mouse / reveal) as a real pointer so the
  // existing fluid splat + reveal LERP chain renders the trail for free.
  let phantomActive = false
  let phantomPath: { x: number; y: number }[] = []
  let phantomFrame = 0
  let phantomTimer: ReturnType<typeof setTimeout> | null = null
  // Holds the reveal flash visible after the swept path ends so the eye can
  // catch it. Decremented by dt each frame; while > 0 the reveal branch runs.
  let phantomGlowMs = 0

  function startPhantom() {
    // The pending handle has been consumed — clear it before any of the
    // re-schedule paths below, so "is a phantom already queued?" stays honest.
    phantomTimer = null
    if (mouseOnScreen) { scheduleNextPhantom(); return }
    // Only fire phantom splashes while hero is the active foreground (page-1).
    // Once the page is scrolled, the Page-1 element is mid-zoom or landed in
    // the Page-2 slot — auto-reveal there looks wrong.
    if (window.scrollY > 0) { scheduleNextPhantom(); return }
    // Uniform random across full hero — every region equally likely.
    const startX = 0.05 + Math.random() * 0.90
    const startY = 0.05 + Math.random() * 0.90
    const theta  = Math.random() * Math.PI * 2
    const len    = 0.10 + Math.random() * 0.18
    const endX   = Math.min(0.95, Math.max(0.02, startX + Math.cos(theta) * len))
    const endY   = Math.min(0.95, Math.max(0.05, startY + Math.sin(theta) * len))
    const N = 8
    phantomPath = []
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      const t = u * u * (3 - 2 * u)
      phantomPath.push({ x: startX + (endX - startX) * t, y: startY + (endY - startY) * t })
    }
    phantomFrame  = 0
    phantomActive = true
    phantomGlowMs = 900
  }

  // Hoisted: this scheduler re-arms itself for the life of the page (every
  // 30–3000ms), and window.matchMedia allocates a fresh MediaQueryList on
  // every call — thousands of throwaway objects per session for a preference
  // that is queried once and then live-tracked by the MQL itself.
  const phantomReduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  function scheduleNextPhantom() {
    if (phantomReduced.matches) return
    // Nothing to reveal while the loop is parked — the chain restarts with the
    // loop (see the viewport gate below), so an off-screen hero stops waking
    // the main thread up to 30×/sec for the rest of the session.
    if (!heroOnScreen) return
    const delay = 30 + Math.random() * (3000 - 30)
    phantomTimer = setTimeout(startPhantom, delay)
  }

  // ── render loop ───────────────────────────────────────────────────────────
  // Sleep gate: once the page has scrolled away, the cursor is off the hero,
  // and no phantom is running, the dye fully decays within ~1s and every
  // further frame renders identical pixels (the idle parallax drift is
  // ±0.0005 UV ≈ sub-pixel). After a generous quiet window, skip sim+render
  // until the cursor returns or the page scrolls back to top. The loop keeps
  // ticking so wake conditions are re-checked every frame.
  const QUIET_FRAMES_BEFORE_SLEEP = 240
  let quietFrames = 0
  let last = performance.now()

  // Hard viewport gate, above the quiet-frame gate. The quiet gate only skips
  // the sim+render — the tick itself kept re-arming forever, reading
  // window.scrollY (which flushes pending layout) once per frame for the whole
  // session, on a hero that scrolls permanently out of view within one screen.
  // The observer re-arms the loop if the user scrolls back up.
  let heroOnScreen = true
  const heroVisObs = new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting)
    if (vis === heroOnScreen) return
    heroOnScreen = vis
    if (vis) {
      if (animId === 0) {
        // Swallow the sleep gap so dt on the first waking frame is one frame,
        // not however long the user spent down the page.
        last = performance.now()
        quietFrames = 0
        animId = requestAnimationFrame(animate)
      }
      // The phantom chain declines to re-arm while parked — restart it.
      if (phantomTimer === null && !phantomActive) scheduleNextPhantom()
    } else if (phantomTimer !== null) {
      clearTimeout(phantomTimer)
      phantomTimer = null
    }
  })
  heroVisObs.observe(el)

  function animate() {
    if (!heroOnScreen) {
      animId = 0
      return
    }
    animId = requestAnimationFrame(animate)
    const now = performance.now()
    const dt  = Math.min((now - last) / 1000, 0.05)
    last = now

    // Scroll gate — as the page begins zooming toward Page-2, helmet splat +
    // phantom reveals must die so they don't trail into the landing. A real
    // cursor on the hero always wins (tiny accidental scrolls of 1–2 px must
    // not freeze interaction). Phantom is suppressed regardless.
    const scrolled = window.scrollY > 0
    // Freeze NEW dye splats once the user has scrolled past a meaningful
    // threshold (not the moment scrollY > 0). Below the threshold, the trail
    // keeps painting so the reveal animation doesn't snap off the instant the
    // wheel ticks. Past the threshold, splats stop and existing dye decays.
    freezeSplats = window.scrollY > 500
    if (scrolled) {
      phantomActive = false
      phantomFrame = 0
      phantomGlowMs = 0
      if (!mouseOnScreen) revealActive = false
    }

    // Phantom splash — drive virtual cursor from baked path so stepSim + reveal
    // chain treat it as a real cursor sweep.
    if (phantomActive && !mouseOnScreen) {
      const p = phantomPath[phantomFrame]
      mouse.x = p.x
      mouse.y = p.y
      phantomFrame++
      if (phantomFrame >= phantomPath.length) {
        phantomActive = false
        scheduleNextPhantom()
      }
    }
    // Afterglow countdown — keeps reveal flash branch firing for a beat after
    // the swept path ends so the eye can register the glow.
    if (phantomGlowMs > 0 && !mouseOnScreen) {
      phantomGlowMs = Math.max(0, phantomGlowMs - dt * 1000)
    }

    const heroActive =
      !scrolled || mouseOnScreen || phantomActive || phantomGlowMs > 0 ||
      revealStrength >= 0.01
    if (heroActive) {
      quietFrames = 0
    } else if (++quietFrames > QUIET_FRAMES_BEFORE_SLEEP) {
      quietFrames = QUIET_FRAMES_BEFORE_SLEEP + 1
      // Keep prev-cursor synced while asleep so the first frame after wake
      // computes the same small delta it would have in an always-on loop.
      prevMouse.x = mouse.x
      prevMouse.y = mouse.y
      return
    }

    // Subtle idle drift when off-screen — keeps parallax breathing
    const targetX = mouseOnScreen ? mouse.x : 0.5 + Math.sin(now * 0.0004) * 0.04
    const targetY = mouseOnScreen ? mouse.y : 0.5 + Math.cos(now * 0.00035) * 0.03
    smooth.x += (targetX - smooth.x) * 0.08
    smooth.y += (targetY - smooth.y) * 0.08

    stepSim(dt)

    displayMat.uniforms.uDye.value = dyeA.texture
    displayMat.uniforms.uMouse.value.set(smooth.x, smooth.y)

    // Dye decay: snap clear only when the cursor isn't on hero AND we've
    // scrolled. Real cursor on hero keeps the default decay so the trail
    // behaves normally even at small scrollY.
    const fastDecay = scrolled && !mouseOnScreen
    dyeAdvMat.uniforms.uDecay.value = fastDecay ? 0.35 : 0.91

    // Phantom-driven reveal flash — converts UV mouse → hero-local CSS px and
    // runs the same LERP trail at reduced strength so accent text blinks faintly
    // at the phantom spot. Skipped when real cursor is active.
    if ((phantomActive || phantomGlowMs > 0) && !revealActive && !mouseOnScreen) {
      const px = mouse.x * el.clientWidth
      const py = (1 - mouse.y) * el.clientHeight
      if (revealSX < -1000) {
        revealSX = px; revealSY = py
        r1x = px;     r1y = py
        r2x = px;     r2y = py
      }
      revealSX += (px       - revealSX) * 0.32
      revealSY += (py       - revealSY) * 0.32
      r1x      += (revealSX - r1x)      * 0.14
      r1y      += (revealSY - r1y)      * 0.14
      r2x      += (r1x      - r2x)      * 0.08
      r2y      += (r1y      - r2y)      * 0.08
      // While sweeping, ramp to 1.0 (matches real-cursor strength). After path
      // ends, decay smoothly across the remaining glow window.
      const target = phantomActive ? 1.0 : Math.max(0, phantomGlowMs / 900)
      revealStrength += (target - revealStrength) * 0.25
      revealRadius = 220
      el.style.setProperty('--mx',  `${revealSX}px`)
      el.style.setProperty('--my',  `${revealSY}px`)
      el.style.setProperty('--t1x', `${r1x}px`)
      el.style.setProperty('--t1y', `${r1y}px`)
      el.style.setProperty('--t2x', `${r2x}px`)
      el.style.setProperty('--t2y', `${r2y}px`)
      el.style.setProperty('--reveal-r', `${revealRadius}px`)
      el.style.setProperty('--reveal-strength', `${revealStrength}`)
    } else
    // Text reveal — head blob always visible at cursor (slow OR fast).
    // Two trailing lag blobs follow with their own LERP; velocity stretches
    // them further out so a fast push EXTENDS reach, slow drift keeps it local.
    // Real cursor on hero always allowed (even mid-scroll). Phantom-driven
    // afterglow is the only thing the scroll gate suppresses.
    if (revealActive) {
      if (revealSX < -1000) {
        revealSX = revealX; revealSY = revealY
        revealPX = revealX; revealPY = revealY
        r1x = revealX; r1y = revealY
        r2x = revealX; r2y = revealY
      }
      // Per-frame velocity
      const dxR = revealX - revealPX
      const dyR = revealY - revealPY
      const speed = Math.hypot(dxR, dyR)
      revealPX = revealX; revealPY = revealY

      // Base radius always present. Speed adds extra reach (push harder = bigger).
      const targetRadius = 180 + Math.min(speed * 8, 420)   // 180..600px
      revealRadius += (targetRadius - revealRadius) * 0.18
      // Strength fixed at 1 — color always clearly visible when cursor is on hero.
      revealStrength = 1

      // Head LERP — tight, hugs cursor
      revealSX += (revealX  - revealSX) * 0.32
      revealSY += (revealY  - revealSY) * 0.32
      // Lag1 — looser, drags behind head
      r1x      += (revealSX - r1x)      * 0.14
      r1y      += (revealSY - r1y)      * 0.14
      // Lag2 — slowest, longest trail
      r2x      += (r1x      - r2x)      * 0.08
      r2y      += (r1y      - r2y)      * 0.08

      el.style.setProperty('--mx',  `${revealSX}px`)
      el.style.setProperty('--my',  `${revealSY}px`)
      el.style.setProperty('--t1x', `${r1x}px`)
      el.style.setProperty('--t1y', `${r1y}px`)
      el.style.setProperty('--t2x', `${r2x}px`)
      el.style.setProperty('--t2y', `${r2y}px`)
      el.style.setProperty('--reveal-r', `${revealRadius}px`)
      el.style.setProperty('--reveal-strength', `${revealStrength}`)
    } else {
      // Cursor off-screen — long, lingering afterglow on the ADARSH accent so
      // the color hold reads as a deliberate trail rather than a snap-off.
      // 0.975/frame ≈ half-life of ~27 frames (~450 ms @60fps).
      // When the page is actively scrolling away AND the cursor is off-hero,
      // snap it off quickly instead so it doesn't trail across the zoom.
      revealStrength *= (scrolled && !mouseOnScreen) ? 0.55 : 0.975
      el.style.setProperty('--reveal-strength', `${revealStrength}`)
      if (revealStrength < 0.01) {
        revealSX = -9999; revealSY = -9999
        r1x = -9999; r1y = -9999
        r2x = -9999; r2y = -9999
        el.style.setProperty('--mx',  '-9999px')
        el.style.setProperty('--my',  '-9999px')
        el.style.setProperty('--t1x', '-9999px')
        el.style.setProperty('--t1y', '-9999px')
        el.style.setProperty('--t2x', '-9999px')
        el.style.setProperty('--t2y', '-9999px')
      }
    }

    prevMouse.x = mouse.x
    prevMouse.y = mouse.y

    renderer.render(mainScene, mainCam)
  }
  animate()
  scheduleNextPhantom()

  // ── events ────────────────────────────────────────────────────────────────
  function onMouseMove(e: MouseEvent) {
    const r = el.getBoundingClientRect()
    mouse.x = (e.clientX - r.left) / r.width
    mouse.y = 1.0 - (e.clientY - r.top) / r.height
    mouseOnScreen = true
    revealX = e.clientX - r.left
    revealY = e.clientY - r.top
    revealActive = true
    if (phantomActive || phantomGlowMs > 0) {
      phantomActive = false
      phantomFrame = 0
      phantomGlowMs = 0
    }
  }
  function onMouseLeave() {
    mouseOnScreen = false
    revealActive = false
  }
  function onTouchMove(e: TouchEvent) {
    if (!e.touches[0]) return
    const r = el.getBoundingClientRect()
    mouse.x = (e.touches[0].clientX - r.left) / r.width
    mouse.y = 1.0 - (e.touches[0].clientY - r.top) / r.height
    mouseOnScreen = true
    revealX = e.touches[0].clientX - r.left
    revealY = e.touches[0].clientY - r.top
    revealActive = true
  }
  function onResize() {
    const w = el.clientWidth, h = el.clientHeight
    renderer.setSize(w, h)
    const cb = fitUV(w, h, BASE_ASP,    BASE_EYE_UV,    BASE_X_NUDGE)
    const cl = fitUV(w, h, LAYERED_ASP, LAYERED_EYE_UV, LAYERED_X_NUDGE)
    displayMat.uniforms.uBaseSc.value.set(cb.sx, cb.sy)
    displayMat.uniforms.uBaseOf.value.set(cb.ox, cb.oy)
    displayMat.uniforms.uLaySc.value.set(cl.sx, cl.sy)
    displayMat.uniforms.uLayOf.value.set(cl.ox, cl.oy)
    refreshRevealOffsets()
  }

  // For each .reveal-text, store its top-left offset (vs hero) as CSS vars so
  // the accent's mask-image can convert viewport-coord cursor into element-local.
  function refreshRevealOffsets() {
    const heroRect = el.getBoundingClientRect()
    el.querySelectorAll<HTMLElement>('.reveal-text').forEach(node => {
      const r = node.getBoundingClientRect()
      node.style.setProperty('--ex', `${r.left - heroRect.left}px`)
      node.style.setProperty('--ey', `${r.top  - heroRect.top}px`)
    })
  }
  // Single-shot offset refresh after layout. No ResizeObserver, no fonts.ready.
  requestAnimationFrame(() => requestAnimationFrame(refreshRevealOffsets))

  el.addEventListener('mousemove',  onMouseMove,  { passive: true })
  el.addEventListener('mouseleave', onMouseLeave)
  el.addEventListener('touchmove',  onTouchMove,  { passive: true })
  window.addEventListener('resize', onResize)

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    animId = 0
    heroVisObs.disconnect()
    if (phantomTimer !== null) clearTimeout(phantomTimer)
    phantomTimer = null
    phantomActive = false
    el.removeEventListener('mousemove',  onMouseMove)
    el.removeEventListener('mouseleave', onMouseLeave)
    el.removeEventListener('touchmove',  onTouchMove)
    window.removeEventListener('resize', onResize)
    velA.dispose(); velB.dispose(); dyeA.dispose(); dyeB.dispose()
    renderer.dispose()
    // dispose() frees three's GPU objects but keeps the WebGL context alive.
    // Browsers cap concurrent contexts and evict the oldest past the cap, so
    // an uncollected context here blanks another canvas on a later route.
    renderer.forceContextLoss()
    ;[tBase, tLayered].forEach(t => t.dispose())
    ;[velSplatMat, dyeSplatMat, velAdvMat, dyeAdvMat, displayMat].forEach(m => m.dispose())
    displayGeo.dispose(); quadGeo.dispose()
  })
})
</script>

<template>
  <div ref="container" class="hero">
    <DotField v-if="!lowTier && webglOK" :influence="450" :strength="2" />
    <div v-else class="dot-field-static" aria-hidden="true"></div>
    <div class="hero-stack-blur" aria-hidden="true"></div>
    <canvas v-show="!webglFailed" id="three-canvas"></canvas>
    <img v-if="webglFailed" class="three-canvas-fallback" :src="basePhotoUrl" alt="" aria-hidden="true" />

    <div class="overlay">
      <header v-if="props.showTopbar" class="topbar">
        <nav class="nav" aria-label="Primary">
          <RouterLink to="/education"><span class="nav-num">01</span><span class="nav-label">Education</span></RouterLink>
          <RouterLink to="/experience"><span class="nav-num">02</span><span class="nav-label">Experience</span></RouterLink>
          <RouterLink to="/projects"><span class="nav-num">03</span><span class="nav-label">Projects</span></RouterLink>
          <a href="mailto:golaitadarsh@gmail.com"><span class="nav-num">04</span><span class="nav-label">Contact</span></a>
        </nav>
      </header>

      <div class="hero-stack">
        <div class="tagline-block">
          <p class="tagline">Redefining limits, creating endless possibilities</p>
          <span class="stack-divider" aria-hidden="true"></span>
        </div>
        <h1 class="hero-name" aria-label="Adarsh Golait">
          <span class="hero-name-line reveal-text"><span class="reveal-base">ADARSH</span><span class="reveal-accent" aria-hidden="true">ADARSH</span></span>
          <span class="hero-name-line">GOLAIT</span>
        </h1>
      </div>

      <component
        :is="props.scrollCueLink ? 'a' : 'div'"
        :href="props.scrollCueLink ? props.scrollCueTarget : undefined"
        class="scroll-cue"
        :class="{ 'scroll-cue--static': !props.scrollCueLink }"
        :aria-label="props.scrollCueLink ? 'Scroll to next section' : undefined"
        :aria-hidden="props.scrollCueLink ? undefined : 'true'"
      >
        <span class="scroll-cue-label">Scroll</span>
        <span class="scroll-cue-track">
          <span class="scroll-cue-bead"></span>
        </span>
      </component>
    </div>
  </div>
</template>

<style scoped>
/* Static stand-in for <DotField> on machines below the tier bar (see the
   `lowTier` note in the script). Reproduces the shader's resting state: the
   same #3a3a3a dot on white, the same 1.4px radius, the same 28px grid pitch.
   What it cannot do is bulge the dots around the cursor — which is precisely
   the part those machines were rendering at 30fps anyway. Occupies the same
   box and z-index as the canvas it replaces, so nothing above it moves. */
.dot-field-static {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: #fff;
  background-image: radial-gradient(circle, #3a3a3a 0.7px, transparent 1.5px);
  background-size: 28px 28px;
  background-position: 14px 14px;
}

.hero {
  position: relative;
  width: 100%;
  /* svh, matching the #hero / .hs-sticky stage this plate sits in. On iOS
     Safari 100vh is the URL-bar-collapsed height, so a vh-sized plate stood
     ~90px taller than its clipping box (bottom of the photo and the scroll
     cue cut off) and then re-sized mid-scroll as the bar collapsed, forcing
     a WebGL resize each time. svh == vh on desktop, so nothing moves there. */
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  background: #fff;
  cursor: none;
  /* Smoothed cursor in CSS px, top-left origin. Set by HeroSection.vue. */
  --mx: -9999px;
  --my: -9999px;
  /* Trail positions for liquid blob — decayed lags of the smoothed cursor */
  --t1x: -9999px; --t1y: -9999px;
  --t2x: -9999px; --t2y: -9999px;
  /* Reveal radius (grows with cursor speed) + strength (1 active, fades on leave) */
  --reveal-r: 180px;
  --reveal-strength: 0;
  --accent: #DBFE52;
}
#three-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 10;
}
/* Static stand-in for the WebGL canvas when a context can't be created —
   same layer, cover-fit like the shader's base pass. */
.three-canvas-fallback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 10;
}
/* ── editorial design tokens (exaggerated minimalism · per ui-ux skill) ─── */
.overlay {
  --ink:        #09090B;
  --ink-soft:   rgba(9, 9, 11, 0.62);
  --ink-faint:  rgba(9, 9, 11, 0.36);
  --rule:       rgba(9, 9, 11, 0.14);
  /* --gutter-x / --gutter-y intentionally NOT redeclared here: they inherit
     from :root in style.css, which locks them to fixed rem from 1024px up so
     the hero's edge anchors sit at the same offsets on a laptop and on an
     external monitor. Shadowing them here would reinstate the vh drift. */

  --f-sans: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
  --f-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;

  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 70;
}

/* ── topbar (nav only, right-aligned, pushed up + right) ───────────────── */
.topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: var(--pad-topbar-y) clamp(1rem, 2.6vw, 2rem) 0;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}
.topbar::after {
  /* hairline divider under topbar — Swiss editorial */
  content: '';
  position: absolute;
  left: var(--gutter-x);
  right: clamp(1rem, 2.6vw, 2rem);
  bottom: -0.85rem;
  height: 1px;
  background: var(--rule);
}
.nav {
  display: flex;
  align-items: flex-start;
  gap: clamp(1.2rem, 2.4vw, 2.4rem);
}
.nav a {
  pointer-events: auto;
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  text-decoration: none;
  color: var(--ink);
  padding: 0.25rem 0 0.4rem;
  position: relative;
  transition: color 0.25s ease;
}
.nav-num {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  transition: color 0.25s ease;
}
.nav-label {
  font: 500 0.78rem/1 var(--f-sans);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.nav a::after {
  /* underline grows on hover/focus */
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.nav a:hover::after,
.nav a:focus-visible::after { transform: scaleX(1); }
.nav a:hover .nav-num,
.nav a:focus-visible .nav-num { color: var(--ink); }
.nav a:focus-visible { outline: none; }

/* ── hero stack — name + tagline grouped, bottom-left ──────────────────────
   Sized to stay inside the LEFT GUTTER (outside the central photo silhouette).
   Photo width ≈ 0.92 * viewportH * 1.4544 → on 16:9 desktop, photo occupies
   center ~75% of viewport. Safe left zone ≈ 0..14vw. We cap name size + stack
   width so even the widest glyph row never crosses the photo.
*/
.hero-stack {
  position: absolute;
  left: var(--gutter-x);
  bottom: calc(var(--gutter-y) * 3.3);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.7rem;
  pointer-events: none;
}
/* Vignette behind the text — soft white wash + backdrop blur, masked to a
   radial fade so no rectangle edge is visible. Sibling of #three-canvas so it
   sits ABOVE the dot grid but BELOW the photo plane, preventing the blur from
   rising over the image when aspect-ratio changes. */
.hero-stack-blur {
  position: absolute;
  left: calc(var(--gutter-x) - 3rem);
  bottom: calc(var(--gutter-y) * 3.3 - 3rem);
  width: min(38vw, 520px);
  height: clamp(11rem, 22vh, 18rem);
  background: rgba(255, 255, 255, 0.22);
  -webkit-backdrop-filter: blur(1px);
          backdrop-filter: blur(1px);
  -webkit-mask-image: radial-gradient(
    ellipse 64% 64% at 35% 60%,
    rgba(0,0,0,0.85) 0%,
    rgba(0,0,0,0.75) 50%,
    rgba(0,0,0,0.35) 80%,
    rgba(0,0,0,0)    100%
  );
          mask-image: radial-gradient(
    ellipse 64% 64% at 35% 60%,
    rgba(0,0,0,0.85) 0%,
    rgba(0,0,0,0.75) 50%,
    rgba(0,0,0,0.35) 80%,
    rgba(0,0,0,0)    100%
  );
  pointer-events: none;
  z-index: 5;
}

/* Tagline block — width matches tagline so divider ends with text. */
.tagline-block {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
  width: max-content;
  max-width: min(70vw, 720px);
}
.tagline {
  margin: 0;
  white-space: nowrap;
  font: 700 clamp(0.6rem, 0.76vw, 0.74rem)/1 var(--f-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
}
.stack-divider {
  display: block;
  width: 100%;
  height: 1px;
  background: var(--ink);
}

/* Name — exaggerated minimalism. Two-tone (ADARSH primary, GOLAIT secondary).
   Font size capped so the widest line stays inside the left gutter on
   standard breakpoints (≥1101px ≤34vw, scaled down at narrower viewports). */
.hero-name {
  margin: 0;
  display: block;
  font-family: var(--f-sans);
  font-weight: 900;
  font-size: clamp(2.73rem, 6.93vw, 6.3rem);   /* +5% scale */
  line-height: 0.86;
  letter-spacing: -0.055em;
  text-transform: uppercase;
  max-width: min(34vw, 520px);
  font-feature-settings: "ss01", "cv11";
}
.hero-name-line { display: block; }
.hero-name-line:first-child  { color: #0A0A0A; }
.hero-name-line:last-child   { color: #4A4A4F; }

/* ── scroll cue — bottom-right ──────────────────────────────────────────── */
.scroll-cue {
  pointer-events: auto;
  position: absolute;
  right: var(--gutter-x);
  bottom: var(--gutter-y);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  text-decoration: none;
  color: var(--ink);
}
/* Static variant (portfolio embed) — pure visual hint, not clickable. */
.scroll-cue.scroll-cue--static {
  pointer-events: none;
  cursor: default;
}
.scroll-cue-label {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.scroll-cue-track {
  position: relative;
  display: block;
  width: 1px;
  height: 56px;
  background: var(--rule);
  overflow: hidden;
}
.scroll-cue-bead {
  position: absolute;
  left: -1.5px;
  top: 0;
  width: 4px;
  height: 12px;
  background: var(--ink);
  animation: scrollBead 2.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes scrollBead {
  0%   { transform: translateY(-110%); opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateY(460%); opacity: 0; }
}

/* ── reduced motion ─────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .scroll-cue-bead { animation: none; opacity: 0.7; transform: translateY(160%); }
  .nav a::after    { transition: none; }
}

/* ── reveal text — accent layer masked by liquid blob ──────────────────── */
.reveal-text {
  position: relative;
  /* Shrink wrapper to text width so .reveal-accent (inset:0) exactly overlays
     the glyph rectangle, not the full line box. */
  width: fit-content;
  max-width: 100%;
}
.reveal-base {
  display: inline-block;
  vertical-align: top;
  line-height: inherit;
}
/* Accent layer — inline-block clone painted in --accent, absolutely positioned
   over .reveal-base, then revealed via a multi-blob mask-image. The parent
   .hero exposes viewport-coord --mx/--my; each .reveal-text stores its own
   offset in --ex/--ey via JS so the mask's calc() converts to element-local. */
.reveal-accent {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: var(--accent);
  /* Inherit all type styles from parent (font, size, weight, tracking, etc.) */
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: inherit;
  /* Velocity-driven liquid mask. Strength + radius scale with cursor speed
     (set by JS). At rest, strength → 0 = no reveal. Fast move = full blob +
     trailing lag splats decaying behind. Mirrors the photo's dye-splat curve. */
  opacity: var(--reveal-strength, 0);
  -webkit-mask-image:
    radial-gradient(circle var(--reveal-r) at calc(var(--mx)  - var(--ex, 0px)) calc(var(--my)  - var(--ey, 0px)),
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0) 100%),
    radial-gradient(circle calc(var(--reveal-r) * 0.9) at calc(var(--t1x) - var(--ex, 0px)) calc(var(--t1y) - var(--ey, 0px)),
      rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0) 100%),
    radial-gradient(circle calc(var(--reveal-r) * 0.7) at calc(var(--t2x) - var(--ex, 0px)) calc(var(--t2y) - var(--ey, 0px)),
      rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0) 100%);
          mask-image:
    radial-gradient(circle var(--reveal-r) at calc(var(--mx)  - var(--ex, 0px)) calc(var(--my)  - var(--ey, 0px)),
      rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0) 100%),
    radial-gradient(circle calc(var(--reveal-r) * 0.9) at calc(var(--t1x) - var(--ex, 0px)) calc(var(--t1y) - var(--ey, 0px)),
      rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0) 100%),
    radial-gradient(circle calc(var(--reveal-r) * 0.7) at calc(var(--t2x) - var(--ex, 0px)) calc(var(--t2y) - var(--ey, 0px)),
      rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0) 100%);
  -webkit-mask-composite: source-over;
          mask-composite: add;
  will-change: mask-image, opacity;
  transition: opacity 120ms linear;
}

/* ── responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .hero-name { font-size: clamp(2.2rem, 6.2vw, 4.6rem); max-width: min(40vw, 420px); }
}
@media (max-width: 900px) {
  .hero-name     { font-size: clamp(2rem, 7vw, 3.8rem); max-width: min(46vw, 360px); }
  .tagline-block { max-width: 60vw; }
}
@media (max-width: 640px) {
  .topbar { padding: 0.9rem 1rem 0; }
  .topbar::after { left: 1rem; right: 1rem; bottom: -0.65rem; }
  .nav    { gap: 0.9rem; flex-wrap: wrap; justify-content: flex-end; }
  .nav-num { display: none; }
  .nav-label { font-size: 0.7rem; letter-spacing: 0.14em; }

  .hero-stack {
    left: var(--gutter-x);
    right: var(--gutter-x);
    bottom: auto;
    top: calc(var(--gutter-y) + 3rem);
    gap: 0.7rem;
  }
  .hero-stack-blur {
    left: calc(var(--gutter-x) - 1.5rem);
    right: calc(var(--gutter-x) - 1.5rem);
    bottom: auto;
    top: calc(var(--gutter-y) + 1rem);
    width: auto;
    height: clamp(12rem, 33vh, 18rem);
    /* Radial mask feathers left/right but cuts a visible band straight across
       the face at the bottom. The type sits at the top of the phone hero, so a
       long top-down fade is the natural read and never draws an edge. */
    -webkit-mask-image: linear-gradient(to bottom,
      rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.94) 40%,
      rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.24) 84%, rgba(0,0,0,0) 100%);
            mask-image: linear-gradient(to bottom,
      rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.94) 40%,
      rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.24) 84%, rgba(0,0,0,0) 100%);
    /* The 0.72 veil + 5px blur was rescue work: the phone crop used to put
       the name straight onto dark hair, where #0A0A0A on near-black made
       "SH" and "GO" unreadable. The portrait-viewport cap in fitUV() moved
       the hair clear of the type, so that weight now only has the DotField
       under it — and at 0.72 it visibly bleached the dots into a pale
       rectangle behind the lockup. Back down to a whisper of lift, matching
       the desktop intent. z-index stays at 20 (between the photo canvas at
       10 and the .overlay at 70) so it still has something to sample if a
       very short viewport pushes the hair back up under the name. */
    z-index: 20;
    background: rgba(255, 255, 255, 0.3);
    -webkit-backdrop-filter: blur(3px) saturate(0.97);
            backdrop-filter: blur(3px) saturate(0.97);
  }
  .tagline-block { width: 100%; max-width: 100%; gap: 0.6rem; }
  /* 0.58rem is 9.3px — under the phone legibility floor. The strapline is
     the first line of copy on the site; it has to be readable, and at
     0.66rem it still fits one line down to 360px at this tracking. */
  .tagline       { white-space: normal; font-size: 0.66rem; letter-spacing: 0.11em; line-height: 1.45; }
  .hero-name     { font-size: clamp(2.2rem, 13vw, 4.4rem); max-width: 100%; }

  .scroll-cue { right: var(--gutter-x); bottom: calc(var(--gutter-y) * 0.9); }
  .scroll-cue-label { font-size: 0.68rem; }
  .scroll-cue-track { height: 40px; }
}
</style>
