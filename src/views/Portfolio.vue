<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import HeroSection from '../HeroSection.vue'
import BeamsBackground from '../components/BeamsBackground.vue'
import signatureSvgRaw from '../../assets/signature.svg?raw'

// Normalise the source SVG so it can be safely injected via v-html and
// measured with getTotalLength(): drop XML prolog/DOCTYPE/<metadata>, kill
// non-SVG namespaces (Inkpad, ns0), drop the canvas-frame outer rectangle
// (legacy file), and replace '+' coordinate separators that Inkpad emits.
const signatureMarkup = (() => {
  let svg = signatureSvgRaw
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .replace(/\s+xmlns:inkpad="[^"]*"/g, '')
    .replace(/\s+xmlns:xlink="[^"]*"/g, '')
    .replace(/\s+inkpad:[a-zA-Z-]+="[^"]*"/g, '')
    .replace(/ns0:/g, '')
    .replace(/xmlns:ns0=/g, 'xmlns=')
    .replace(/<path[^>]*d="M0 932[^"]*"[^/]*\/>/g, '')
  // Inkpad encodes spaces between numeric path args as '+'. Browsers accept
  // it for some operators but not all — normalise to spaces.
  svg = svg.replace(/(d="[^"]*")/g, (_m, attr: string) => attr.replace(/\+/g, ' '))
  return svg.trim()
})()

const HeroCharacter = defineAsyncComponent(() => import('../character/HeroCharacter.vue'))

const characterVisible = ref(false)

// ────────────────────────────────────────────────────────────────────
// Hero → Page-2 slot zoom-out levers.
// Tweak any of these to change how Page 1 (HeroSection) lands inside
// the 4:5 slot on Page 2 (#intro-message). Values are smooth-scrubbed.
//
//   sizeScale     · multiplier on slot rect size (1 = exact slot fit).
//   offsetX/Y     · pixel nudge applied AFTER fit (positive = right/down).
//   cropX/cropY   · subject-position inside the crop window, 0..1.
//                   0.5 = center crop. Lower X = lean left, higher Y = lean down.
//   endSaturate   · saturation at fully-zoomed state (0 = grayscale, 1 = full).
//   endBrightness · brightness at fully-zoomed (1 = neutral; <1 darken).
//   endContrast   · contrast at fully-zoomed.
//   smoothing     · 0..1, lerp factor per frame; smaller = silkier (slower catchup).
//   driverVh      · driver section height in vh. Bigger = longer scroll runway.
// ────────────────────────────────────────────────────────────────────
// Slot aspect for landed Page-1. Landscape 3:2 by default; change to taste
// (e.g. 16/10, 4/3). Slot rect on Page-2 is also forced to this ratio.
const HERO_SLOT_AR = 24 / 14

// ────────────────────────────────────────────────────────────────────
// LEVERS — tweak these to change everything about the hero zoom feel.
// ────────────────────────────────────────────────────────────────────
const heroZoom = {
  // ── CHARACTER SIZE ────────────────────────────────────────────────
  // characterSize: master size multiplier on the landed character image.
  //   1.0  = exactly fills the 4:3 slot.
  //   >1   = bigger / closer crop (image grows past slot edges, clipped).
  //   <1   = smaller / wider crop (white margin visible inside slot).
  characterSize: 1.58,
  // Slot envelope size — shrunk slightly so the landed page-1 plane (bg)
  // reads smaller while characterSize bumps to keep the face the same px.
  sizeScale:     0.92,
  // Pixel nudge after fit. Positive offsetY moves character DOWN, etc.
  offsetX:       0,
  offsetY:       5,
  // Subject-position inside the crop window (0..1). 0.5 = center.
  cropX:         0.5,
  cropY:         0.47,
  // ── COLOR GRADE (filter applied to Page-1) ────────────────────────
  endSaturate:   0.0,    // 0 = grayscale, 1 = full color
  endBrightness: 0.95,   // <1 darkens, >1 brightens
  endContrast:   1.02,   // <1 flat, >1 punchy
  // Subtle green-tint via sepia + hue-rotate (matches reference's
  // desaturated mid-tone wash). 0 = off, 1 = full tint.
  endTint:       0.55,
  endHueDeg:     60,
  // ── BACKGROUND (RGB lerp from white → end color) ──────────────────
  // Each is 0..255. Default end = soft warm dark.
  bgEndR: 46, bgEndG: 54, bgEndB: 36,
  // Background brighten window — when bg color animates in (progress 0..1).
  bgDarkenStart: 0.12,
  bgDarkenEnd:   0.78,
  // ── MOTION CURVE ──────────────────────────────────────────────────
  // Higher smoothing = snappier response to scroll. 0.15 feels human/instant
  // without losing the lerp blend. driverVh shortened so first scroll input
  // produces visible motion immediately (no "scroll twice to start").
  smoothing:     0.12,
  driverVh:      520,
  // Pop disabled — set popAmount > 0 to re-enable a landing overshoot.
  popAmount:     0,
  popAt:         0.88,
  popWindow:     0.14,
  // 3D depth — clean recline-in-then-flat at landing.
  perspective:   2000,
  tiltXDeg:      5,
  tiltYDeg:      0,
  zDepthPx:      -120,
  // Fade-out window for hero overlay text.
  textFadeStart: 0.04,
  textFadeEnd:   0.38,
  // DotField fade window.
  dotFadeStart:  0.10,
  dotFadeEnd:    0.50,
  // Past this progress, kill pointer-events on Page-1 so the reveal/hover
  // animation inside HeroSection stops firing on Page-2.
  revealCutoff:  0.45,
  // Crop-animation lag behind the camera (0..0.2).
  cropLag:       0.06,
}

// Disable native scroll restoration immediately so reloads always land at
// the top of the hero stack (not mid-zoom on Page-2).
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

const heroDriverRef = ref<HTMLElement | null>(null)
const heroStickyRef = ref<HTMLElement | null>(null)
const heroPage1Ref  = ref<HTMLElement | null>(null)
const heroSlotRef   = ref<HTMLElement | null>(null)
const signatureRef  = ref<HTMLElement | null>(null)

// ────────────────────────────────────────────────────────────────────
// Door transition (Page 2 → Page 3). The doors live INSIDE `.hs-sticky`
// — same stage as the existing P2 + landed P1 + signature. Once the
// signature is fully drawn (heroProgress ≈ 1) and the user keeps
// wheeling, we lock the page scroll, freeze the P2 visual by hiding it
// in favour of the matching door clone, and split the door halves apart
// to reveal the HeroCharacter sitting at z=0 behind everything.
// After the doors fully part, we release the wheel lock and the user
// scrolls past the remaining .hs-driver runway into the body content.
// ────────────────────────────────────────────────────────────────────
const doorProgressRef = ref(0)         // 0 = doors closed, 1 = fully open
const doorVisibleRef  = ref(false)     // door layer painted only when in range
const characterDoorRef = ref(false)    // pre-mount HeroCharacter behind doors

const doorConfig = {
  // Wheel-delta units required to fully open the doors. ~1200 ≈ 3-4
  // medium wheel notches on macOS.
  wheelTotal: 1500,
  smoothing:  0.16,
  // Release wheel lock once we're this far open / fully closed.
  releaseAt:  0.985,
  // Engage door lock only once hero zoom-out + signature have committed.
  heroDoneAt: 0.985,
  // After doors fully open, hold the lock for an extra dwell so the user
  // can actually see the character before falling into the summary.
  // Wheel units of "dwell" before releasing for real.
  dwellTotal: 600,
}
let doorDwell = 0          // 0 = just opened, dwellTotal = ready to release
let doorRafId: number | null = null
let doorProgress = 0
let doorProgressTarget = 0
let doorAccum = 0           // raw wheel delta accumulated, 0..wheelTotal
let doorLocked = false      // true when we're hijacking wheel events

// Per-path metadata captured after v-html injects the SVG. Used to render the
// signature as a sequential pen draw and to position the pen tip at the active
// stroke head each frame.
type SigPath = { node: SVGPathElement; len: number; start: number }
let sigPaths: SigPath[] = []
let sigTotalLen = 0

function setupSignaturePaths() {
  const root = signatureRef.value
  if (!root) return
  const paths = root.querySelectorAll<SVGPathElement>('svg path')
  sigPaths = []
  sigTotalLen = 0
  paths.forEach((p) => {
    try {
      const len = p.getTotalLength()
      p.style.strokeDasharray = `${len}`
      p.style.strokeDashoffset = `${len}`
      p.classList.add('sig-stroke')
      sigPaths.push({ node: p, len, start: sigTotalLen })
      sigTotalLen += len
    } catch {
      /* getTotalLength can throw on degenerate paths — skip */
    }
  })
  // SVG element styling (size, overflow). The injected root <svg> has fixed
  // width/height attrs that we need to override so it scales responsively.
  const svg = root.querySelector('svg')
  if (svg) {
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
}

// Walk per-path dashoffsets for a global progress in 0..1. Stroke reveals
// sequentially across all paths in source order.
function updateSignatureDraw(progress: number) {
  if (!sigPaths.length) return
  const headLen = sigTotalLen * Math.min(1, Math.max(0, progress))
  for (const p of sigPaths) {
    const local = Math.min(p.len, Math.max(0, headLen - p.start))
    p.node.style.strokeDashoffset = `${p.len - local}`
  }
}

// Sync --topbar-h to the real rendered topbar height. The static clamp() in
// style.css undershoots the real height on some breakpoints (Chrome desktop),
// which makes the sticky hero plane taller than its visible-below-topbar slot
// and produces a few px of unwanted scroll on reload.
function syncTopbarH() {
  const tb = document.querySelector<HTMLElement>('.portfolio-topbar')
  if (!tb) return
  const h = tb.getBoundingClientRect().height
  // Use the exact subpixel value (not rounded) so calc(100vh - var(--topbar-h))
  // matches the real layout exactly. Math.floor / Math.ceil leaves a 0.0625px
  // residue that the browser rounds into a single-px scrollbar.
  if (h > 0) {
    document.documentElement.style.setProperty('--topbar-h', `${h}px`)
    invalidateTopbarH()
  }
}

let scrollSpy: IntersectionObserver | null = null
let revealObs: IntersectionObserver | null = null
let heroRafId: number | null = null
let heroResizeObs: ResizeObserver | null = null
let heroProgress = 0
let heroProgressTarget = 0
let heroSlotRect = { x: 0, y: 0, w: 0, h: 0 }
let heroVpW = 0
let heroVpH = 0

const sectionToNav: Record<string, string | null> = {
  summary: null,
  education: 'education',
  experience: 'experience',
  corporate: 'corporate',
  academic: 'corporate',
  por: 'por',
  extra: 'por',
  awards: 'awards',
  skills: 'skills',
}

function measureHeroSlot() {
  const slot = heroSlotRef.value
  const sticky = heroStickyRef.value
  if (!slot || !sticky) return
  const sRect = slot.getBoundingClientRect()
  const stRect = sticky.getBoundingClientRect()
  heroSlotRect = {
    x: sRect.left - stRect.left,
    y: sRect.top  - stRect.top,
    w: sRect.width,
    h: sRect.height,
  }
  heroVpW = stRect.width
  heroVpH = stRect.height
  applyHeroTransform(true)
}

function applyHeroTransform(force = false) {
  const page1 = heroPage1Ref.value
  if (!page1 || heroVpW === 0 || heroVpH === 0) return

  const t = heroProgress
  // Primary ease — quintic in-out. Slower start, slower end, momentum middle.
  // Feels significantly more cinematic than cubic for long zooms.
  const eased = easeInOutQuint(t)
  // Crop runs slightly behind the scale, so the lens-crop reads as separate
  // motion from the camera push — adds physical-camera realism.
  const easedCrop = easeInOutQuint(Math.max(0, t - heroZoom.cropLag) / (1 - heroZoom.cropLag))

  const targetAR = HERO_SLOT_AR
  const cropW = Math.min(heroVpW, heroVpH * targetAR)
  const cropH = cropW / targetAR

  const slotW = heroSlotRect.w * heroZoom.sizeScale

  // visibleW/H = the trimmed window that lands exactly inside the slot.
  // Dividing by characterSize > 1 enlarges the character at landing (smaller
  // visible source × larger scale = bigger image inside the slot).
  const visibleW = cropW / heroZoom.characterSize
  const visibleH = cropH / heroZoom.characterSize

  const scaleEnd = slotW / visibleW

  const cropOffX = (heroVpW - visibleW) * heroZoom.cropX
  const cropOffY = (heroVpH - visibleH) * heroZoom.cropY

  const slotCenterX = heroSlotRect.x + heroSlotRect.w / 2 + heroZoom.offsetX
  const slotCenterY = heroSlotRect.y + heroSlotRect.h / 2 + heroZoom.offsetY
  const txEnd = slotCenterX - (cropOffX + visibleW / 2) * scaleEnd
  const tyEnd = slotCenterY - (cropOffY + visibleH / 2) * scaleEnd

  // Pop overshoot — tighter window, smaller amount = elegant rather than bouncy.
  const popDelta = Math.max(0, 1 - Math.abs(t - heroZoom.popAt) / heroZoom.popWindow)
  const popMult  = 1 + smoothstep(0, 1, popDelta) * heroZoom.popAmount

  const scale = (1 + (scaleEnd - 1) * eased) * popMult
  // Snap translation to whole pixels — subpixel jitter on rotated/scaled
  // elements is what causes the "image moves here and there for a few frames"
  // wobble. At full-vp scale the eye can't tell.
  const tx = Math.round(txEnd * eased)
  const ty = Math.round(tyEnd * eased)

  // 3D recline — eases in, peaks mid, ramps to ZERO past 0.85 so the final
  // landing is perfectly flat with no leftover rotation noise.
  const tiltFade  = 1 - smoothstep(0.80, 1.00, t)
  const tiltCurve = Math.sin(Math.PI * eased) * tiltFade
  const rotX = heroZoom.tiltXDeg * tiltCurve
  const rotY = heroZoom.tiltYDeg * tiltCurve
  const tz   = Math.round(heroZoom.zDepthPx * tiltCurve)

  // Clip-path uses easedCrop so the crop trails behind the camera.
  const clipLeftPx   = cropOffX * easedCrop
  const clipRightPx  = (heroVpW - cropOffX - visibleW) * easedCrop
  const clipTopPx    = cropOffY * easedCrop
  const clipBottomPx = (heroVpH - cropOffY - visibleH) * easedCrop

  // Filters fade to mid-tone desaturated at end.
  const sat = 1 + (heroZoom.endSaturate   - 1) * eased
  const bri = 1 + (heroZoom.endBrightness - 1) * eased
  const con = 1 + (heroZoom.endContrast   - 1) * eased
  const sep = heroZoom.endTint * eased
  const hue = heroZoom.endHueDeg * eased

  // Single style write per frame — minimizes layout/paint cycles.
  page1.style.transform =
    `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, ${tz.toFixed(2)}px) ` +
    `rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg) ` +
    `scale(${scale.toFixed(4)})`
  page1.style.clipPath =
    `inset(${clipTopPx.toFixed(1)}px ${clipRightPx.toFixed(1)}px ${clipBottomPx.toFixed(1)}px ${clipLeftPx.toFixed(1)}px)`
  page1.style.filter =
    `saturate(${sat.toFixed(3)}) ` +
    `brightness(${bri.toFixed(3)}) ` +
    `contrast(${con.toFixed(3)}) ` +
    `sepia(${sep.toFixed(3)}) ` +
    `hue-rotate(${hue.toFixed(1)}deg)`
  // Past the reveal cutoff, drop pointer-events so HeroSection's hover/reveal
  // animation stops firing — feels distracting once we're landed on Page-2.
  page1.style.pointerEvents = t < heroZoom.revealCutoff ? 'auto' : 'none'
  page1.style.setProperty('--hs-shadow-strength', `${eased.toFixed(3)}`)
  page1.style.setProperty('--hs-depth-shadow', `${tiltCurve.toFixed(3)}`)
  heroSlotRef.value?.style.setProperty('--hs-cover-progress', `${Math.min(1, eased * 1.4).toFixed(3)}`)

  const textFade = smoothstep(heroZoom.textFadeStart, heroZoom.textFadeEnd, t)
  page1.style.setProperty('--hs-text-fade', `${textFade.toFixed(3)}`)
  const dotFade = smoothstep(heroZoom.dotFadeStart, heroZoom.dotFadeEnd, t)
  page1.style.setProperty('--hs-dot-fade', `${dotFade.toFixed(3)}`)
  // Signature pen-draw — held off until page-1 has clearly committed to the
  // zoom-out, then finishes shortly before landing. updateSignatureDraw walks
  // per-path stroke-dashoffsets to reveal the signature sequentially.
  updateSignatureDraw(smoothstep(0.42, 0.92, t))

  const bgDark = smoothstep(heroZoom.bgDarkenStart, heroZoom.bgDarkenEnd, t)
  // Lerp white (255,255,255) → user-set end color via the three R/G/B levers.
  const bgR = Math.round(255 + (heroZoom.bgEndR - 255) * bgDark)
  const bgG = Math.round(255 + (heroZoom.bgEndG - 255) * bgDark)
  const bgB = Math.round(255 + (heroZoom.bgEndB - 255) * bgDark)
  page1.style.setProperty('--hs-bg-color', `rgb(${bgR}, ${bgG}, ${bgB})`)

  if (force) {
    /* no-op — kept for parity */
  }
}

function easeInOutQuint(t: number) {
  return t < 0.5
    ? 16 * t * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 5) / 2
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)))
  return t * t * (3 - 2 * t)
}

// Hero zoom-out + signature consume only the FIRST `heroBudget` of the
// runway. The remainder is held in reserve so the sticky stays pinned
// while the door split (wheel-locked) runs after heroProgress hits 1.
const HERO_BUDGET_VH = 240

// Shared scroll geometry for the sticky hero/door stage. `scrolled` is how
// far into the pinned runway we are (0 = stage just pinned). `heroBudgetPx`
// is where hero-zoom completes and the door entry sits.
function doorGeom() {
  const driver = heroDriverRef.value
  const sticky = heroStickyRef.value
  if (!driver) return null
  const rect = driver.getBoundingClientRect()
  const stickyH = sticky?.clientHeight || window.innerHeight
  const travel = Math.max(1, driver.clientHeight - stickyH)
  const scrolled = Math.min(travel, Math.max(0, -rect.top))
  const heroBudgetPx = Math.min(travel, HERO_BUDGET_VH * window.innerHeight / 100)
  return { scrolled, heroBudgetPx, travel }
}

function onHeroScroll() {
  const g = doorGeom()
  if (!g) return
  heroProgressTarget = Math.min(1, g.scrolled / Math.max(1, g.heroBudgetPx))
  if (heroRafId === null) {
    heroRafId = requestAnimationFrame(heroLoop)
  }
}

function heroLoop() {
  heroRafId = null
  const diff = heroProgressTarget - heroProgress
  if (Math.abs(diff) > 0.0005) {
    heroProgress += diff * heroZoom.smoothing
    applyHeroTransform()
    heroRafId = requestAnimationFrame(heroLoop)
  } else {
    heroProgress = heroProgressTarget
    applyHeroTransform()
  }
}

// ────────────────────────────────────────────────────────────────────
// Door transition — wheel-driven, scroll-locked. No actual page scroll
// happens during the split: when the door stage top reaches the viewport
// top, we lock body scroll and route wheel deltas into doorAccum (which
// drives doorProgress 0→1). Once fully open, lock releases and natural
// scroll continues into P3 below.
//
// Reverse: at door progress 1 with wheel-up at top of stage we re-engage
// and close the doors in reverse before releasing back to P2.
// ────────────────────────────────────────────────────────────────────
let cachedTopbarH: number | null = null
function invalidateTopbarH() { cachedTopbarH = null }

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

// Tolerance (px of scroll runway) for catching the door entry. A fast wheel
// flick can jump well past the exact entry offset between two frames, so the
// engage test is a half-open zone (not a tight ±window) and the scroll is
// snapped to the exact entry on engage. The sticky stays pinned across the
// whole reserved runway, so without this anchoring a reverse wheel would slam
// the doors shut at an arbitrary offset and trap the scroll mid-summary.
const DOOR_ENTRY_EPS = 24

// Snap the page scroll so the door stage sits exactly at its entry offset.
// `delta` = how far current scroll is from the entry (positive = below it).
function snapToDoorEntry(delta: number) {
  window.scrollTo({ top: window.scrollY - delta, left: 0, behavior: 'auto' })
}

function maybeEngageDoorLock(wheelDy = 0) {
  // Reduced-motion users keep native scroll — never hijack the wheel.
  if (prefersReducedMotion()) return
  const g = doorGeom()
  if (!g) return
  // distToEntry > 0 → scrolled past the door entry (down into the runway);
  // < 0 → still above it. Door entry is where hero-zoom finishes.
  const distToEntry = g.scrolled - g.heroBudgetPx
  doorVisibleRef.value = heroProgress >= doorConfig.heroDoneAt * 0.6
  if (heroProgress < doorConfig.heroDoneAt || doorLocked) return
  const doorsClosed = doorAccum <= 0.001 && doorDwell <= 0.001
  const canOpenMore  = doorAccum < doorConfig.wheelTotal || doorDwell < doorConfig.dwellTotal
  const canCloseMore = doorAccum > 0 || doorDwell > 0
  // Forward (wheel down): the moment scroll reaches/passes the entry while the
  // doors are still shut, grab the lock and snap exactly to the entry — even
  // if a fast flick overshot — so the split always plays from the top.
  if (wheelDy > 0 && doorsClosed && canOpenMore && distToEntry >= -DOOR_ENTRY_EPS) {
    snapToDoorEntry(distToEntry)
    doorLocked = true
    return
  }
  // Reverse (wheel up): native scroll first carries the user back up toward the
  // entry; once within range with the doors still open, re-take the lock and
  // snap to the entry so the close animation is anchored to the door stage.
  if (wheelDy < 0 && canCloseMore && distToEntry <= DOOR_ENTRY_EPS) {
    snapToDoorEntry(distToEntry)
    doorLocked = true
  }
}

function onDoorWheel(e: WheelEvent) {
  // Normalize delta first so we can pass direction to engage check.
  let dy = e.deltaY
  if (e.deltaMode === 1) dy *= 16
  else if (e.deltaMode === 2) dy *= window.innerHeight
  if (!doorLocked) maybeEngageDoorLock(dy)
  if (!doorLocked) return
  // Hijack wheel — no page scroll happens during the split.
  e.preventDefault()
  // Two phases while locked:
  //   1) doorAccum 0 → wheelTotal: doors split open
  //   2) doorDwell 0 → dwellTotal: hold lock so user sees the character
  if (doorAccum < doorConfig.wheelTotal) {
    doorAccum = Math.max(0, Math.min(doorConfig.wheelTotal, doorAccum + dy))
    doorProgressTarget = doorAccum / doorConfig.wheelTotal
  } else if (dy > 0) {
    // Doors are fully open — consume wheel into the dwell window.
    doorDwell = Math.min(doorConfig.dwellTotal, doorDwell + dy)
  } else if (dy < 0) {
    // Wheel-up during dwell takes us back toward the split phase.
    if (doorDwell > 0) {
      doorDwell = Math.max(0, doorDwell + dy)
    } else {
      doorAccum = Math.max(0, doorAccum + dy)
      doorProgressTarget = doorAccum / doorConfig.wheelTotal
    }
  }
  characterDoorRef.value = doorProgressTarget > 0.1
  // Release the lock only after the dwell window is fully consumed (down)
  // or the doors are fully closed again (up).
  if (doorDwell >= doorConfig.dwellTotal && dy > 0) {
    doorLocked = false
  }
  if (doorAccum <= 0.001 && dy < 0) {
    doorLocked = false
  }
  if (doorRafId === null) doorRafId = requestAnimationFrame(doorLoop)
}

function onDoorScroll() {
  // Outside the lock, just keep visibility flag fresh + watch for engage.
  maybeEngageDoorLock()
}

function doorLoop() {
  doorRafId = null
  const diff = doorProgressTarget - doorProgress
  if (Math.abs(diff) > 0.0005) {
    doorProgress += diff * doorConfig.smoothing
    // Quintic ease-out on the published progress — gives a heavy, cinematic
    // start and a soft, weighty landing rather than linear travel.
    const t = Math.min(1, Math.max(0, doorProgress))
    const eased = 1 - Math.pow(1 - t, 4)
    doorProgressRef.value = eased
    doorRafId = requestAnimationFrame(doorLoop)
  } else {
    doorProgress = doorProgressTarget
    const t = Math.min(1, Math.max(0, doorProgress))
    doorProgressRef.value = 1 - Math.pow(1 - t, 4)
  }
}

onMounted(() => {
  // scrollRestoration is already pinned to 'manual' by the inline script in
  // index.html (runs before module evaluation) and again at module top above —
  // here we just snap to the top in case the browser still tried to restore.
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  // Belt-and-braces: some browsers restore scroll AFTER mount (image/font
  // layout finishes). Re-snap to 0 on next frames and on window 'load'.
  const pinTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  requestAnimationFrame(pinTop)
  requestAnimationFrame(() => requestAnimationFrame(pinTop))
  setTimeout(pinTop, 0)
  setTimeout(pinTop, 60)
  setTimeout(pinTop, 200)
  if (document.readyState !== 'complete') {
    window.addEventListener('load', pinTop, { once: true })
  }
  heroProgress = 0
  heroProgressTarget = 0

  syncTopbarH()
  requestAnimationFrame(() => requestAnimationFrame(syncTopbarH))
  window.addEventListener('resize', syncTopbarH)

  // Inline-SVG signature — measure each path's length so updateSignatureDraw
  // can sequence stroke-dashoffset. v-html runs synchronously, so the SVG is
  // already in the DOM at this point.
  setupSignaturePaths()

  // Hero zoom-out driver setup.
  const driver = heroDriverRef.value
  if (driver) {
    driver.style.setProperty('--hs-driver-vh', `${heroZoom.driverVh}`)
  }
  // Push the chosen slot aspect ratio into the DOM so the placeholder slot
  // and the cropped page-1 land at the exact same shape.
  const slot = heroSlotRef.value
  if (slot) slot.style.aspectRatio = `${HERO_SLOT_AR}`

  measureHeroSlot()
  // re-measure after layout settles (fonts, async components)
  requestAnimationFrame(() => requestAnimationFrame(measureHeroSlot))
  window.addEventListener('scroll', onHeroScroll, { passive: true })
  window.addEventListener('resize', measureHeroSlot)
  if (heroStickyRef.value) {
    heroResizeObs = new ResizeObserver(measureHeroSlot)
    heroResizeObs.observe(heroStickyRef.value)
    if (heroSlotRef.value) heroResizeObs.observe(heroSlotRef.value)
  }
  onHeroScroll()

  const navLinks = document.querySelectorAll<HTMLAnchorElement>('.portfolio-topbar .nav a[data-section]')
  const linkBySection = new Map<string, HTMLAnchorElement>()
  navLinks.forEach((a) => {
    const s = a.dataset.section
    if (s) linkBySection.set(s, a)
  })

  const targets = Object.keys(sectionToNav)
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el)

  scrollSpy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        const id = entry.target.id
        const wantNav = sectionToNav[id]
        navLinks.forEach((a) => a.classList.remove('is-active'))
        if (wantNav && linkBySection.has(wantNav)) {
          linkBySection.get(wantNav)!.classList.add('is-active')
        }
      })
    },
    { rootMargin: '-32% 0px -60% 0px', threshold: 0 }
  )
  targets.forEach((t) => scrollSpy!.observe(t))

  // HeroCharacter now lives inside .hs-sticky (behind the doors). Mount it
  // as soon as the hero zoom-out commits, so it's warm by the time the user
  // wheels the doors open.
  const reveal = heroStickyRef.value
  if (reveal) {
    revealObs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          characterVisible.value = true
          revealObs?.disconnect()
          revealObs = null
        }
      },
      { rootMargin: '200px 0px' }
    )
    revealObs.observe(reveal)
  }

  // Door transition wiring. Scroll listener watches for the engage point;
  // wheel listener (non-passive) hijacks input while locked.
  window.addEventListener('scroll', onDoorScroll, { passive: true })
  window.addEventListener('resize', onDoorScroll)
  window.addEventListener('resize', invalidateTopbarH)
  window.addEventListener('wheel', onDoorWheel, { passive: false })
  onDoorScroll()
})

onBeforeUnmount(() => {
  scrollSpy?.disconnect()
  scrollSpy = null
  revealObs?.disconnect()
  revealObs = null
  window.removeEventListener('scroll', onHeroScroll)
  window.removeEventListener('scroll', onDoorScroll)
  window.removeEventListener('wheel', onDoorWheel)
  window.removeEventListener('resize', measureHeroSlot)
  window.removeEventListener('resize', onDoorScroll)
  window.removeEventListener('resize', invalidateTopbarH)
  window.removeEventListener('resize', syncTopbarH)
  heroResizeObs?.disconnect()
  heroResizeObs = null
  if (heroRafId !== null) cancelAnimationFrame(heroRafId)
  heroRafId = null
  if (doorRafId !== null) cancelAnimationFrame(doorRafId)
  doorRafId = null
  // Reset door state — module-scope vars otherwise leak across remounts
  // (HMR, route re-entry) and break the next mount's engage gate.
  doorAccum = 0
  doorDwell = 0
  doorLocked = false
  doorProgress = 0
  doorProgressTarget = 0
  doorProgressRef.value = 0
  doorVisibleRef.value = false
  characterDoorRef.value = false
  heroProgress = 0
  heroProgressTarget = 0
  cachedTopbarH = null
})
</script>

<template>
  <header class="topbar portfolio-topbar">
    <a href="#hero" class="brand">
      <span class="brand-dot"></span>
      ADARSH GOLAIT
      <span class="brand-sub">— Portfolio</span>
    </a>
    <nav class="nav" aria-label="Primary">
      <a href="#education" data-section="education"><span class="nav-num">01</span><span class="nav-label">Education</span></a>
      <a href="#experience" data-section="experience"><span class="nav-num">02</span><span class="nav-label">Experience</span></a>
      <a href="#corporate" data-section="corporate"><span class="nav-num">03</span><span class="nav-label">Projects</span></a>
      <a href="#por" data-section="por"><span class="nav-num">04</span><span class="nav-label">Responsibility</span></a>
      <a href="#awards" data-section="awards"><span class="nav-num">05</span><span class="nav-label">Achievements</span></a>
      <a href="#skills" data-section="skills"><span class="nav-num">06</span><span class="nav-label">Skills</span></a>
    </nav>
  </header>

  <main>
    <!-- 00 + 00.b · HERO STACKED OVER INTRO MESSAGE
         Page-1 (HeroSection) sits on top of Page-2 (#intro-message).
         On scroll, Page-1 zooms out and lands inside the 4:5 slot on Page-2,
         desaturating to a mid-tone. -->
    <div ref="heroDriverRef" class="hs-driver" :style="{ '--door-progress': doorProgressRef }">
      <div ref="heroStickyRef" class="hs-sticky">
        <!-- P3 (behind everything) — HeroCharacter + reveal overlay copy.
             Mounts lazily once the signature is mostly done, so it's warm
             behind the doors when they begin to part. -->
        <div class="cr-bg cr-bg--in-stage">
          <BeamsBackground class="cr-beams" intensity="subtle" />
          <HeroCharacter
            v-if="characterVisible || characterDoorRef"
            class="cr-character"
            :camera-zoom="1.25"
          />
          <div v-else class="cr-character-placeholder" aria-hidden="true"></div>
          <div class="cr-overlay">
            <span class="cr-top">— Meet Adarsh</span>
            <div></div>
            <div class="cr-bottom">
              <h2 class="cr-headline">A <em>moving</em><br />operator — not a still one.</h2>
              <p class="cr-meta">Scroll to enter the work →</p>
            </div>
          </div>
        </div>

        <!-- P2 front-stack — wraps the real intro-message + landed HeroSection
             + signature. A single clip-path widens a vertical centre gap as
             --door-progress grows, splitting the real P2 open and revealing
             the HeroCharacter sitting behind. No DOM duplication, no
             snapshot, no ghosting. -->
        <div class="hs-front" aria-hidden="false">
        <!-- Page 2 (behind) -->
        <section id="intro-message" class="hs-page2">
      <header class="im-top">
        <div class="lockup">
          <span class="ll l1">ADARSH</span>
          <span class="ll l2">GOLAIT</span>
        </div>
        <div class="center">
          <span class="mark" aria-hidden="true">AG</span>
          <span class="label">A note from Adarsh</span>
        </div>
        <div class="right">
          <a href="#contact" class="cta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h10" stroke-linecap="square"></path>
            </svg>
            Résumé
          </a>
        </div>
      </header>

      <div class="im-marquee row-1" aria-hidden="true">
        <div class="track">
          <span class="word">Built it from raw stock<span class="dot"></span></span>
          <span class="word">cut the cycle by ninety percent<span class="dot"></span></span>
          <span class="word">held the line solo<span class="dot"></span></span>
          <span class="word">— and shipped it anyway<span class="dot"></span></span>
          <span class="word">Built it from raw stock<span class="dot"></span></span>
          <span class="word">cut the cycle by ninety percent<span class="dot"></span></span>
          <span class="word">held the line solo<span class="dot"></span></span>
          <span class="word">— and shipped it anyway<span class="dot"></span></span>
        </div>
      </div>
      <div class="im-marquee row-2" aria-hidden="true">
        <div class="track">
          <span class="word">REDEFINING LIMITS<span class="dot"></span></span>
          <span class="word">BUILDING SYSTEMS<span class="dot"></span></span>
          <span class="word">HARDWARE-FIRST<span class="dot"></span></span>
          <span class="word">OPERATING SOLO<span class="dot"></span></span>
          <span class="word">REDEFINING LIMITS<span class="dot"></span></span>
          <span class="word">BUILDING SYSTEMS<span class="dot"></span></span>
          <span class="word">HARDWARE-FIRST<span class="dot"></span></span>
          <span class="word">OPERATING SOLO<span class="dot"></span></span>
        </div>
      </div>

      <div class="im-stage">
        <div class="im-frame">
          <div ref="heroSlotRef" class="slot hs-target-slot">
            <div class="slot-body">
              <span class="slot-kind" data-kind="PHOTO">Photo · B/W</span>
              <span class="slot-name">Portrait — desaturated, mid-tone</span>
              <span class="slot-aspect">3 : 2 · landscape</span>
            </div>
          </div>
        </div>
      </div>

      <footer class="im-foot">
        <p class="caption">
          <strong>Mechanical engineer.</strong> Operations &amp; program build, hands-on.<br />
          Mumbai · open to product-ops at hardware-first companies.
        </p>
        <a href="#summary" class="scroll-down" aria-label="Scroll to the next section">
          <span>Keep scrolling</span>
          <span class="arrow"></span>
        </a>
        <p class="timestamp">
          IITGN '23 · Axis Bank '23— · Mumbai<br />
          Portfolio · 2026
        </p>
      </footer>
        </section>

        <!-- Page 1 (on top) — transformed into the 4:5 slot on scroll -->
        <section id="hero" ref="heroPage1Ref" class="hs-page1">
          <HeroSection :show-topbar="false" scroll-cue-target="#character-reveal" />
        </section>

        <!-- Signature pen-draw — sibling of page-1/page-2 so it stacks above
             the collapsing hero plane. Raw SVG injected from assets/signature.svg
             and per-path lengths measured in onMounted to drive scroll-bound draw. -->
        <div ref="signatureRef" class="im-signature" aria-hidden="true" v-html="signatureMarkup"></div>
        </div>

        <!-- Depth shim — sits BETWEEN P2 (z=1) and door-3d slabs (z=3).
             Three stacked sublayers (atmospheric haze + corner vignette +
             radial portal glow) appear only inside the widening centre
             gap, selling volumetric depth as the doors part. Pure CSS,
             driven by --door-progress. -->
        <div class="hs-door-depth" aria-hidden="true">
          <div class="hs-door-depth__haze"></div>
          <div class="hs-door-depth__vignette"></div>
          <div class="hs-door-depth__glow"></div>
        </div>

        <!-- 3D door overlay — sits BEHIND .hs-front (z=3 < z=5) so it only
             shows through the clip-path gap as P2 splits. Two halves rotate
             outward in 3D (rotateY) as --door-progress grows, with a bevel
             on the inner edge faking door thickness. Pure CSS. -->
        <div class="hs-door-3d" aria-hidden="true">
          <div class="hs-door-3d__half hs-door-3d__half--l"></div>
          <div class="hs-door-3d__half hs-door-3d__half--r"></div>
        </div>
      </div>
    </div>

    <!-- Summary -->
    <section id="summary" class="section">
      <div class="body">
        <span class="section-num">·</span>
        <h2 class="section-title">Summary</h2>
        <p>
          Mechanical Engineer from IIT Gandhinagar (Gold Medalist, CPI 8.18) with hands-on hardware build experience — go-kart fabrication from raw stock, control system prototyping, and on-ground vendor sourcing at a consumer hardware startup.
        </p>
        <p>
          As Welfare Secretary at IITGN, served as the sole operational bridge between a 2,000+ student community and the institute administration — coordinating a 25-member council across hostels, mess, health services, and campus outlets, and running a structured trial-based vendor selection process replacing an unstructured legacy approach.
        </p>
        <p>
          Three years at Axis Bank applying that engineering and operations instinct to building infrastructure from zero: designed a <strong>modular production framework (7 reusable modules) adopted unmodified by an external engineering team</strong>, owned an 18-month, 4-team vendor program with TCS as sole internal coordinator, <em>cut a business-critical monthly pipeline turnaround by 90% (2–3 days → 3 hours)</em>, and held 100% production continuity as solo operator through a complete team transition.
        </p>
        <p>
          Transitioning into product operations at hardware-first companies.
        </p>
      </div>
      <div class="stack-right">
        <div class="slot slot-portrait">
          <div class="slot-body">
            <span class="slot-kind" data-kind="PHOTO">Photo</span>
            <span class="slot-name">Portrait / hero-character base</span>
            <span class="slot-aspect">4 : 5 · ≥ 1200px tall</span>
          </div>
        </div>
        <div class="slot" style="aspect-ratio: 4/3; min-height: 220px;">
          <div class="slot-body">
            <span class="slot-kind" data-kind="ANIM">Animation</span>
            <span class="slot-name">Signature / handwriting reveal</span>
            <span class="slot-aspect">4 : 3 · Lottie or SVG path</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Education -->
    <section id="education" class="section">
      <span class="section-num">01 · Education</span>
      <h2 class="section-title">Education</h2>

      <div class="split">
        <div>
          <article class="entry">
            <div class="entry-head">
              <p class="entry-title">Indian Institute of Technology Gandhinagar (IITGN)</p>
              <span class="entry-when">July, 2019 — July, 2023 · Gujarat</span>
            </div>
            <p class="entry-sub">Bachelor of Technology, Mechanical Engineering <span class="pipe">·</span> CPI: 8.18 / 10 <span class="pipe">·</span> Dean's List (Sem 4)</p>
            <p class="entry-sub" style="color: var(--ink);">
              <strong style="font-weight:700;">Gold Medalist — Outstanding Social Service</strong> <span class="pipe">·</span> Convocation 2023
            </p>

            <div class="edu-strip">
              <div class="cell"><span class="k">CPI</span><span class="v">8.18 / 10</span></div>
              <div class="cell"><span class="k">Dean's List</span><span class="v">Sem 4 · 2021</span></div>
              <div class="cell"><span class="k">Honour</span><span class="v">Gold Medal '23</span></div>
              <div class="cell"><span class="k">Duration</span><span class="v">4 years</span></div>
            </div>
          </article>
        </div>

        <div class="visual-rail">
          <div class="slot" style="aspect-ratio: 4/3;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="3D">3D</span>
              <span class="slot-name">IITGN campus / academic block model</span>
              <span class="slot-aspect">4 : 3</span>
            </div>
          </div>
          <div class="slot accent" style="aspect-ratio: 1/1;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="3D">3D</span>
              <span class="slot-name">Gold Medal — Outstanding Social Service</span>
              <span class="slot-aspect">1 : 1 · medallion rotation</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Work Experience -->
    <section id="experience" class="section">
      <span class="section-num">02 · Work Experience</span>
      <h2 class="section-title">Work Experience</h2>

      <div class="split flip">
        <div class="visual-rail">
          <div class="slot dark" style="aspect-ratio: 3/4; min-height: 380px;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="PHOTO">Photo</span>
              <span class="slot-name">Axis Bank Mumbai HQ · workspace</span>
              <span class="slot-aspect">3 : 4 · environmental shot</span>
            </div>
          </div>
          <div class="slot" style="aspect-ratio: 1/1;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="ANIM">Animation</span>
              <span class="slot-name">Forecasting framework — module loop</span>
              <span class="slot-aspect">1 : 1 · looping diagram</span>
            </div>
          </div>
        </div>

        <div>
          <article class="entry">
            <div class="entry-head">
              <p class="entry-title">Financial Modelling Team — Operations &amp; Framework Build, @Axis Bank</p>
            </div>
            <p class="entry-sub">
              <span>Senior Manager (Promoted)</span>
              <span class="pipe">·</span>
              <span>May, 2025 — Present · Mumbai</span>
            </p>
            <p class="entry-sub">
              <span>Manager</span>
              <span class="pipe">·</span>
              <span>July, 2023 — April, 2025 · Mumbai</span>
            </p>
          </article>

          <article class="entry">
            <div class="entry-head">
              <p class="entry-title">Product Development Intern — Prototyping &amp; Vendor Sourcing, @SmartoKids</p>
              <span class="entry-when">May, 2022 — July, 2022 · Ahmedabad</span>
            </div>
          </article>

          <article class="entry">
            <div class="entry-head">
              <p class="entry-title">Vocational Trainee, Industrial Systems Exposure, @Tata Steel</p>
              <span class="entry-when">May, 2021 — July, 2021 · Virtual</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Corporate Projects -->
    <section id="corporate" class="section">
      <span class="section-num">03 · Corporate Projects</span>
      <h2 class="section-title">Corporate<br /><span class="accent-line">Projects</span></h2>
      <p class="section-lede">
        Eight programs across Axis Bank, SmartoKids and Tata Steel — modular forecasting frameworks, multi-team vendor coordination, pipeline rebuilds, and industrial systems study. Every record below uses the role, organisation, dates and bullets as listed on the master résumé.
      </p>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Modular Production Framework — Built from Zero across Retail Asset Models</p>
          <span class="entry-when">July, 2023 — Present</span>
        </div>
        <p class="entry-sub"><span>Manager / Senior Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Architected and shipped a modular PySpark forecasting framework from zero — 7 reusable modules driven by a single parameter file — enabling any product model to run through the same scalable production pipeline with zero structural rework; framework was adopted unmodified by the TCS engineering team, validating the generalised architecture.</li>
            <li>Migrated 3 product models end-to-end (Personal Loan, Auto Loan, Commercial Vehicle) from legacy SAS to PySpark — rebuilt all production logic and historical curves from scratch, eliminated all spreadsheet dependencies, and transitioned every model to governed star-schema tables for repeatable, audit-ready production cycles.</li>
            <li><strong>Compressed end-to-end model upgrade cycles from 2–3 weeks to 2–4 days</strong> (an 80%+ reduction including upstream dependency coordination) through the modular framework, parameter-driven inputs, and standardised data plumbing — once dependencies were pre-sorted, single-day modify-and-release cycles became routine for targeted updates.</li>
            <li>Engineered two recency-adjustment modules and a loss-balance calculator from scratch — the calculator required a novel data-mapping strategy after the upstream reporting dashboard was decommissioned, preserving full system integrity with zero data loss across all downstream outputs.</li>
            <li>Mentored a junior team member to first production deployment on the Education Loan model in ~5 weeks against a typical from-scratch build of 3–4 months — the generic modular framework cut onboarding-to-delivery time by ~75%.</li>
            <li>Owned end-to-end production delivery of 9 quarterly models (4 Retail Asset + 5 Agri products) as the sole accountable owner per cycle — stakeholder management across Business, Analytics, and Finance sign-off; production deployments through Jenkins CI/CD with version control on BitBucket.</li>
            <li>Standardised process design and delivery methodology across all 9 models — logic upgrades rollable across the full portfolio in a single production cycle, eliminating per-model rework and enabling same-cycle updates across all products without regression.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="ANIM">Diagram</span>
                <span class="slot-name">7-module framework — single param file → 9 models</span>
                <span class="slot-aspect">4 : 3 · architecture loop</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Valuation Model &amp; Profit Score Automation with TCS — Program Ownership across 4 Internal Teams</p>
          <span class="entry-when">April, 2024 — December, 2025</span>
        </div>
        <p class="entry-sub"><span>Senior Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <div class="split flip" style="margin-top: 1rem;">
          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 1/1;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D / Diagram</span>
                <span class="slot-name">4 internal teams + TCS engineering — coordination map</span>
                <span class="slot-aspect">1 : 1</span>
              </div>
            </div>
          </div>
          <ul class="bullets">
            <li>Sole internal program owner — no co-owner — across an 18-month multi-team vendor engagement with <strong>TCS</strong>: coordinated 4 internal teams (Business, Analytics, Data Engineering, Financial Modelling) and a 6–8 person external engineering team from requirements through production deployment, running a 1-year valuation model automation track and a 6-month profitability score automation track concurrently without a dedicated program manager role.</li>
            <li>Translated internal modelling logic into precise vendor framework requirements; reviewed every iteration, caught edge cases that would have caused silent downstream errors, and gated production stability before each release — 8 systems delivered under this program (2 valuation models + 6 profit scores: CCPS, ATM, TD, MAB, CVS, Cash Profitability), as sole internal coordinator.</li>
            <li>Supplied 7 reusable PySpark modules from my own migration framework directly to the TCS engineering team — adopted without modification; the generalised architecture of my framework independently converged with TCS's automation design, cutting vendor onboarding time and preserving internal methodology end-to-end across all automated systems.</li>
            <li>Genericised the Personal Loan assumption builder on the vendor framework — reverse-engineered existing business logic across dimensional splits, weighted input derivations, risk factor treatment, and cashflow computation; extended a single-product framework to support Personal Loans with product-level logic isolated and configurable, eliminating recurring manual input steps from every monthly production cycle.</li>
            <li>Designed and enforced a data quality and validation layer across both automation tracks — preventing downstream breakages across 12+ monthly production cycles; extended the system for 2+ years of retro-run capability, enabling full historical back-population at program launch.</li>
            <li>Authored strategic review packs and model performance briefings consumed directly in executive and investor-facing presentations — scenario analysis, output reconciliation, and quantitative backing for senior leadership decisions.</li>
          </ul>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Credit Card Profitability Pipeline — 90% Turnaround Reduction</p>
          <span class="entry-when">May, 2023 — Present</span>
        </div>
        <p class="entry-sub"><span>Manager / Senior Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li><em>Cut monthly delivery turnaround by over 90%</em> (2–3 days → 3 hours) by redesigning the CCPS data pipeline and automating input validation — eliminated a recurring manual bottleneck and compressed the decision cycle for Business Analytics and Finance across 12+ monthly production cycles.</li>
            <li>Owned end-to-end monthly production delivery of the Credit Card Profit Score (CCPS) — an account-level profitability model combining revenue, reward cost, credit cost, and fee components — whose outputs directly drove performance targets for Credit Card leadership and field sales teams.</li>
            <li>Maintained continuous output integrity across 12+ production cycles by tracing and correcting logic failures at source — root causes included zero-output components from source mapping gaps, cost reclassification following upstream booking-method changes, and component corrections preventing output inflation from unrelated data entries; each fix applied in isolation without disrupting downstream outputs or requiring a full pipeline rerun.</li>
            <li>Corrected PBT calculation logic across 2 pipeline migrations (Informatica → TCS framework) — reconciled with Analytics and Data Engineering to prevent output drift; corrections covered credit cost true-up, reward cost bifurcation, fee derecognition, and netting-off components.</li>
            <li>Executed back-corrections across 13+ months of historical data following logic fixes — ran data quality checks at each stage and aligned all downstream consumer teams on output changes before resuming regular production runs; system validated for 2-year retro-run capability.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="ANIM">Animation</span>
                <span class="slot-name">Turnaround compression: 2–3 days → 3 hours</span>
                <span class="slot-aspect">4 : 3 · before/after</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Solo Operational Ownership Through Team Transition</p>
          <span class="entry-when">January, 2025 — April, 2025</span>
        </div>
        <p class="entry-sub"><span>Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <ul class="bullets">
          <li>Held full delivery of the Financial Modelling portfolio as sole owner for 3 months during a team transition — <strong>zero missed deadlines, zero production disruptions, no external ramp-up or support</strong>.</li>
          <li>Managed 10+ concurrent active deliverables simultaneously — production releases for 4 own valuation models, CCPS, and NCL multiplier; handoffs of 4 profit scores to BA teams (ATM, TD, MAB, TRV); ownership transfers of 5 Agri models to incoming team members — while managing stakeholder expectations across Business and Analytics throughout.</li>
          <li>Led the team rebuild end-to-end once new hires arrived — designed a two-directional structured handover, authored SOPs covering production pipeline architecture, and ran knowledge transfer sessions that brought the new team to independent delivery within their first quarter.</li>
        </ul>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">NCL Multiplier — Monthly Pipeline Operations &amp; Root-Cause Debugging</p>
          <span class="entry-when">January, 2025 — Present</span>
        </div>
        <p class="entry-sub"><span>Senior Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <div class="split flip" style="margin-top: 1rem;">
          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 1/1;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="ANIM">Visualisation</span>
                <span class="slot-name">50 lakh+ accounts · 8 products · monthly cycle</span>
                <span class="slot-aspect">1 : 1 · scale visual</span>
              </div>
            </div>
          </div>
          <ul class="bullets">
            <li>Owned end-to-end monthly production execution of a multi-product loss rate pipeline <strong>covering 8 products and processing 50 lakh+ accounts per monthly run</strong> — account-level data pulls, product-bucket standardisation, vintage tracking, fresh slippage identification, overdue balance computation, and derivation of annualised outputs (fresh slippages, post-linkage loss rates, post-recovery loss rates, and bucket multipliers) — with zero missed release cycles across the full ownership period.</li>
            <li>Built a formula-driven validation layer from scratch for retro-run reconciliation — outputs reconcilable line-by-line per product and period rather than treated as a black box; provided the audit trail needed to communicate output changes credibly to downstream teams.</li>
            <li>Traced a recurring output discrepancy to an upstream source-data coverage gap — identified root cause through systematic data tracing, confirmed scope of impact, and delivered a documented root cause analysis that backed stakeholder communication rather than merely flagging the anomaly.</li>
            <li>Identified and corrected a product-specific code error causing downstream report generation failures — isolated the fault, applied targeted logic correction, validated outputs against expected ranges, and restored uninterrupted monthly production delivery without requiring a full system rebuild.</li>
          </ul>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Unified Profitability Infrastructure — Systems Design from Fragmented Sources</p>
          <span class="entry-when">April, 2025 — Present</span>
        </div>
        <p class="entry-sub"><span>Senior Manager</span><span class="pipe">|</span><span>Axis Bank</span></p>

        <ul class="bullets">
          <li>Designed and shipped a unified, account-level profitability master from zero — <strong>processes revenue, cost, PBT, RAROC, and NCL across ~6 crore accounts spanning 30+ products</strong> in a single harmonised structure, replacing a workflow that previously required manual reconciliation across disconnected sources before any cross-product view was possible.</li>
          <li>Diagnosed the structural data problem: profitability outputs existed across disconnected frameworks with inconsistent logic, fragmented customer-base coverage, and no unified account-level view — making cross-product comparison unreliable and consumption-unfriendly for downstream analytics and reporting teams.</li>
          <li>Mapped the customer base across multiple existing profitability frameworks, matched records back to their source frameworks, and connected account populations that fell outside the coverage of any prior framework — improving overall completeness of the profitability universe.</li>
          <li>Built the bridging logic that brings fragmented frameworks together into a single consumption-ready table — standardised revenue, fee, cost, expected loss, and profit components; resolved product-mapping inconsistencies and overlaps at both customer and account level to ensure completeness without double-counting.</li>
          <li>Delivered a consumption-ready output structure that downstream analytics and reporting teams could query directly — eliminated the manual reconciliation step from every cross-product report.</li>
        </ul>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Product Development — Prototyping, Iteration, and On-Ground Vendor Sourcing</p>
          <span class="entry-when">May, 2022 — July, 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1nHJQMDm9WLH55x5v1CwYZo8Knen_4E2s/view" target="_blank" rel="noopener" style="text-decoration:underline;">Internship Certificate</a>
          <span class="pipe">|</span>
          <span>SmartoKids Commerce Pvt. Ltd.</span>
        </p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Reverse-engineered 10+ competing hardware products to extract reusable design patterns (features, materials, assembly approach) and proposed new concepts within explicit cost and production constraints — directly informing the product development roadmap.</li>
            <li>Led rapid prototyping from concept to testable builds — created CAD models and fabricated iterations using laser cutters, MDF sheets, and 3D printing across iteration cycles to validate feasibility before committing any design to production.</li>
            <li>Managed on-ground vendor relationships end-to-end: visited suppliers, assessed capabilities and constraints, compared quotes, and supported negotiations to align cost, quality, and timelines; gained direct exposure to hardware procurement and supply chain decisions that precede production.</li>
            <li>Built a structured competitor SKU catalog by web-scraping e-commerce listings; organised by category, price bands, materials, and feature-set to support ideation and prioritisation decisions.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D</span>
                <span class="slot-name">SmartoKids prototype — CAD / MDF iteration</span>
                <span class="slot-aspect">4 : 3</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Industrial Systems Study — Bulk Material Handling Equipment at Tata Steel</p>
          <span class="entry-when">May, 2021 — July, 2021</span>
        </div>
        <p class="entry-sub">
          <span>Vocational Trainee</span>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1wA0e7VINckpSwxrobc2dkNCyXB_IlRlZ/view" target="_blank" rel="noopener" style="text-decoration:underline;">Certificate</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1FeGPjXIIYyOQgPuM2jX-9NvQTsRHz3r9/view" target="_blank" rel="noopener" style="text-decoration:underline;">Report</a>
        </p>

        <ul class="bullets">
          <li>Studied bulk material handling equipment at a live Tata Steel plant — focused on belt conveyor systems covering construction (carcass, cover layers, splicing methods), idler types (troughing, impact, return), drive arrangements (single drum, snubbed, tandem), and power unit selection for continuous high-load operation.</li>
          <li>Authored a structured technical report translating plant observations into decision-oriented documentation — compared vulcanisation vs. mechanical splicing tradeoffs (installation time, failure modes, operating conditions), analysed belt inclination limits and surcharge angles for different bulk solids, and produced selection guidance grounded in operational reliability criteria.</li>
        </ul>
      </article>
    </section>

    <!-- Academic Projects -->
    <section id="academic" class="section">
      <span class="section-num">03.b · Academic Projects</span>
      <h2 class="section-title">Academic<br /><span class="accent-line">Projects</span></h2>
      <p class="section-lede">
        Six physical hardware builds at IIT Gandhinagar — each one a perfect target for an interactive 3D model alongside the writeup.
      </p>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Go-Kart — Full System Build from Raw Stock to Live Drive</p>
          <span class="entry-when">March, 2022 — April, 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1ISyMh713Xe9EiCL6Ku4CpUzXcwW-FJU1/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Video</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1tHUv4p33o5MtHJyL4L_5K1UbzSbgrafH/view" target="_blank" rel="noopener" style="text-decoration:underline;">Team</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Harish PM</span>
        </p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Built a go-kart from scratch as part of a 10-member team: converted an initial concept into a build-ready design by finalising key dimensions, creating the full CAD, and planning the fabrication and assembly sequence.</li>
            <li>Fabricated the frame and chassis from lab stock using cutting, sanding, welding, lathe work, grinding, and precision fitting — from raw material to a drive-ready structure; sourced engine from Delhi, adapted a bicycle braking system as a cost-effective constraint-driven solution, and procured chain-drive parts and tyres across Gandhinagar/Ahmedabad.</li>
            <li>Evaluated multiple steering and braking setups, selected the most feasible configuration, and integrated it into a working vehicle delivered with a live drive demonstration; debugged system failures iteratively by diagnosing each specific failure point, applying a targeted fix, and re-testing rather than redesigning from scratch.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3; min-height: 360px;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D · Featured</span>
                <span class="slot-name">Go-Kart — full chassis / drivable rig</span>
                <span class="slot-aspect">4 : 3 · orbit + explode</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Energy Efficient Control of Inverted Pendulum</p>
          <span class="entry-when">April, 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1JoBnupwAd_gvdzfio9srCIoMLRYLAzc1/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Video</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1fkPUp6bHTxHULA7tGd3fxiNw31WdLXKy/view" target="_blank" rel="noopener" style="text-decoration:underline;">Report</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/16yHCzBDirX8PIeAXZRM4cfcvIgk45CAs/view" target="_blank" rel="noopener" style="text-decoration:underline;">Testing Rig</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Madhu Vadali</span>
        </p>

        <div class="split flip" style="margin-top: 1rem;">
          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 1/1;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D</span>
                <span class="slot-name">Motor-actuated inverted pendulum rig</span>
                <span class="slot-aspect">1 : 1 · swing-up motion</span>
              </div>
            </div>
          </div>
          <ul class="bullets">
            <li>Designed and fabricated the motor-actuated inverted pendulum test rig from scratch using CAD and laser cutting — prioritised structural robustness so the setup could sustain repeated hard testing across destabilising and stabilising control experiments without mechanical failure at full motor RPM; rig held through complete experimental validation.</li>
            <li>Led motor parameter identification using MATLAB System Identification Toolbox — designed two constrained experiments to isolate electrical (inductance, resistance) and mechanical (inertia, damping) parameters; used identified values to build a cascaded controller (energy-based swing-up sequence + PD position controller with current feedforward) and validated the energy-efficient strategy on the physical rig.</li>
          </ul>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Ball on Beam — Mechanism Design, Hardware Integration &amp; Closed-Loop Control Setup</p>
          <span class="entry-when">January 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1FT_Wzwe9H6jTgkuAspJ2YjaYZ-4z4QHe/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Video</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Harish PM</span>
        </p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Designed the beam-tilting mechanism from first principles through iteration — evaluated linkage, direct-drive, and gear-sector actuation concepts against torque, speed, and fabrication constraints before committing to a gear-sector drive; fabricated the full load-bearing structure from laser-cut MDF with dimensional tolerances selected to match the closed-loop control requirements.</li>
            <li>Integrated a complete multi-subsystem hardware stack from scratch with no reference design — DC motor, motor driver, position sensor, and Arduino controller — into a working closed-loop physical system; handled component selection, inter-subsystem interfacing, wiring, and embedded firmware, taking the build from disparate parts to active closed-loop sensor feedback.</li>
            <li>Diagnosed and characterised a fundamental actuator-speed mismatch that threatened system viability — the supplied motor's 1000 RPM output was far beyond the controllable range required for stable beam actuation; applied gear reduction and iterative calibration to bring the system into an operable range, then documented the residual performance gap as a quantified hardware constraint rather than an unknown.</li>
            <li>Delivered a working closed-loop system with full beam actuation, sensor feedback integration, and controller implementation; systematically characterised closed-loop performance across P and PD controller configurations and a sweep of gain values, generating a documented performance envelope — root cause analysis confirmed the binding constraint was the actuator-speed ceiling, not the control architecture, validating the controller design and isolating the failure to the physical subsystem.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D</span>
                <span class="slot-name">Ball-on-Beam — gear-sector drive + sensor feedback</span>
                <span class="slot-aspect">4 : 3 · live ball tracking</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Oldham Coupling — CNC Machining, Mechanism Design &amp; Variable Offset System</p>
          <span class="entry-when">February, 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1I84sv3gypHiSbgT0E_j8CXTokQ4rwIKe/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Image-1</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1HIvkyE4g3bxuhzvuUYffncRWfb9ItdH4/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Image-2</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Harish PM</span>
        </p>

        <div class="split flip" style="margin-top: 1rem;">
          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 1/1;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D</span>
                <span class="slot-name">Oldham coupling — variable offset rig</span>
                <span class="slot-aspect">1 : 1 · variable offset</span>
              </div>
            </div>
          </div>
          <ul class="bullets">
            <li>Owned end-to-end system design of a functional Oldham coupling prototype — translated the three-disc mechanism concept into a fully integrated assembly, determining how each component (left disc, centre disc, right disc, shafts, bearings, and structural frame) would physically fit together and interface under rotation.</li>
            <li>Designed the variable offset feature from first principles: introduced slotted vertical acrylic panels allowing the shaft mounting position to be adjusted continuously, enabling live demonstration of torque transmission across varying misalignment conditions beyond the minimum 15 mm specified.</li>
            <li>Specified and integrated bearings at the shaft–panel interface to decouple rotational motion from the fixed acrylic frame — the key design decision that eliminated binding and allowed smooth shaft rotation independent of structural loads.</li>
            <li>Iterated on coupling disc geometry and sliding clearances across multiple versions to resolve fit issues arising from tolerance mismatches between CNC-machined metal components and laser-cut acrylic panels.</li>
          </ul>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Shoulder Joint and Harmony Exoskeleton — Mechanism Design &amp; Working Prototype</p>
          <span class="entry-when">February, 2021</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1brWBERTa9KXhCcc-i8ntMxDyh_Oxmw5-/view" target="_blank" rel="noopener" style="text-decoration:underline;">CAD Model Demo</a>
          <span class="pipe">|</span>
          <a href="https://drive.google.com/file/d/1G-dXtOLStOF7FJCXPODBiBZG-QkIXGLP/view" target="_blank" rel="noopener" style="text-decoration:underline;">Prototype</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Harish PM</span>
        </p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Designed a 5-DOF shoulder exoskeleton mechanism that captured scapular rhythm — iterated joint geometry, linkage kinematics, and range-of-motion constraints through CAD across multiple configurations to balance mechanical complexity against anatomical fidelity; produced a working 3D-printed prototype validated through physical range-of-motion testing, with each design decision documented against the alternatives considered.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D · Featured</span>
                <span class="slot-name">5-DOF shoulder exoskeleton — scapular rhythm</span>
                <span class="slot-aspect">4 : 3 · animated ROM</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Umbrella Holder for Specially-abled Individuals</p>
          <span class="entry-when">April, 2022</span>
        </div>
        <p class="entry-sub">
          <a href="https://drive.google.com/file/d/1PMKWuZQ9cRLqbe_ZWzoutWbLmvWdJXxK/view" target="_blank" rel="noopener" style="text-decoration:underline;">Project Video</a>
          <span class="pipe">|</span>
          <span>Advisor: Prof. Harish PM</span>
        </p>

        <div class="split flip" style="margin-top: 1rem;">
          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 1/1;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="3D">3D</span>
                <span class="slot-name">Wearable umbrella holder — anthropometric fit</span>
                <span class="slot-aspect">1 : 1 · linear actuation</span>
              </div>
            </div>
          </div>
          <ul class="bullets">
            <li>Designed and fabricated a wearable, hands-free umbrella holder for individuals with limited arm mobility — applied anthropometric measurements to determine fit parameters across the target user population, created CAD, and fabricated a lightweight mechanism with guided linear actuation; iterated on stability and load distribution within strict weight and wearability constraints imposed by the intended use case.</li>
          </ul>
        </div>
      </article>
    </section>

    <!-- Positions of Responsibility -->
    <section id="por" class="section">
      <span class="section-num">04 · Positions of Responsibility</span>
      <h2 class="section-title">Positions of<br /><span class="accent-line">Responsibility</span></h2>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Welfare Secretary | Interim General Secretary | Interim Cultural Secretary</p>
          <span class="entry-when">May, 2022 — April, 2023</span>
        </div>
        <p class="entry-sub"><span>Student Council, IIT Gandhinagar</span></p>

        <div class="split" style="margin-top: 1rem;">
          <ul class="bullets">
            <li>Held Welfare Secretary, Interim General Secretary, and Interim Cultural Secretary concurrently — the only council member to carry all three; ran day-to-day operations for 2,000+ UG/PG students across hostels, mess, laundry, health services, and commercial outlets; coordinated a 25-member council as sole bridge between students and institute administration.</li>
            <li><em>Designed a trial-based vendor selection system</em> for commercial outlets from scratch — ran 20+ vendor trials and onboarded 6 new outlets based on demonstrated performance and student feedback, not lowest bid; replaced a process that previously had no structured evaluation.</li>
            <li>As Interim General Secretary: owned Convocation operations end-to-end for the Class of 2022 with a 68-member execution team; responsible for full live-day coordination and real-time issue resolution across all workstreams.</li>
            <li>As Interim Cultural Secretary: led a 104-student contingent for the Inter-IIT Cultural Meet; managed logistics, team coordination, participation scheduling, and on-ground safety across the full event.</li>
          </ul>

          <div class="visual-rail">
            <div class="slot" style="aspect-ratio: 4/3;">
              <div class="slot-body">
                <span class="slot-kind" data-kind="PHOTO">Photo</span>
                <span class="slot-name">IITGN Welfare Council / Convocation 2022</span>
                <span class="slot-aspect">4 : 3 · group / event</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Coordinator for Commercial Outlets</p>
          <span class="entry-when">May, 2021 — April, 2022</span>
        </div>
        <p class="entry-sub"><span>Welfare Council, IIT Gandhinagar</span></p>

        <ul class="bullets">
          <li>Built a vendor candidate pipeline of 20+ operators across food and service categories — conducted independent on-ground outreach and capability assessments across national chains and regional operators before any formal trial.</li>
          <li>Designed a competitive trial-and-selection system from scratch: ran simultaneous 1–2 day live campus trials for vendors in the same category, collected structured community feedback, and made selection decisions based on demonstrated performance — replacing a process with no prior evaluation standard.</li>
          <li>Onboarded 6 new permanent and recurring outlets serving a 2,000+ student community — managed end-to-end vendor coordination, scheduling, and logistics across each launch from trial approval to operational go-live.</li>
          <li>Organised multiple blood donation drive end-to-end — coordinated with GCRI and Ahmedabad Civil Hospital, managed 400+ registrations with slot-based crowd control, and collected blood units, the institute's highest post-pandemic yield.</li>
        </ul>
      </article>

      <article class="entry">
        <div class="entry-head">
          <p class="entry-title">Co-Founder — Pegasus'20 (International Online Event)</p>
          <span class="entry-when">September, 2020</span>
        </div>
        <p class="entry-sub"><span>Virtual Event during COVID-19</span></p>

        <ul class="bullets">
          <li>Co-founded and delivered Pegasus'20 end-to-end during COVID with a 30-member team; secured 5 sponsors + 3 gifting partners, managed INR 58K prize pool, and closed at INR 52K profit.</li>
        </ul>
      </article>
    </section>

    <!-- Other Extra-Curricular -->
    <section id="extra" class="section">
      <span class="section-num">04.b · Other Extra-Curricular</span>
      <h2 class="section-title">Other<br /><span class="accent-line">Extra-Curricular</span></h2>

      <ul class="bullets" style="margin-top: 0;">
        <li>Events Coordinator — Amalthea '20, (Annual Technical Summit, IITGN) &nbsp;·&nbsp; <em style="background:none;color:var(--ink-soft);font-weight:500;">September, 2020 — May, 2021</em></li>
        <li>Finance Coordinator — Events Team, Blithchron '21 (Annual Cultural Fest, IITGN) &nbsp;·&nbsp; <em style="background:none;color:var(--ink-soft);font-weight:500;">August, 2020 — February, 2021</em></li>
        <li>Event Management Executive — Blithchron '20 (Annual Cultural Fest, IITGN) &nbsp;·&nbsp; <em style="background:none;color:var(--ink-soft);font-weight:500;">September, 2019 — February, 2020</em></li>
        <li>Event Management Executive — Amalthea '19 (Annual Technical Summit, IITGN) &nbsp;·&nbsp; <em style="background:none;color:var(--ink-soft);font-weight:500;">August, 2019 — October, 2019</em></li>
      </ul>
    </section>

    <!-- Achievements & Recognition -->
    <section id="awards" class="section">
      <span class="section-num">05 · Achievements &amp; Recognition</span>
      <h2 class="section-title">Achievements &amp;<br /><span class="accent-line">Recognition</span></h2>

      <div class="split">
        <ul class="bullets">
          <li><strong>Gold Medalist — Outstanding Social Service (IITGN, Convocation 2023)</strong> — institute Gold Medal for contribution to student welfare, campus operations, and community leadership.</li>
          <li><strong>ANCHORS ELITE (Q2 FY25)</strong> — selected among 51 employees across Axis Bank pan-India for exceptional impact and delivery.</li>
          <li><strong>ANCHORS TEAM PLAYER (Q2 FY25)</strong> — awarded for high-ownership collaboration and cross-team execution under pressure.</li>
          <li><strong>BIU Team Award</strong> — recognised for end-to-end delivery of the profit score automation program with TCS.</li>
          <li><strong>Agile &amp; Jira adoption lead</strong> — part of a 6-member SWAT team driving Jira rollout and Agile project management adoption across the Data Science vertical and cross-functional teams.</li>
          <li><strong>Dean's List</strong> — Semester 4, 2021; awarded to meritorious students.</li>
          <li><strong>Winner — Rube Goldberg Machine Building Competition</strong> (Amalthea, IITGN, 2020) — 1st place for designing and executing a chain-reaction machine under competition constraints.</li>
          <li>Top internal technical assessments — L3 in SQL and PySpark (Q4 FY25); L2 in Functional Assessment.</li>
          <li>Competitive sports medals in Rope Skipping — 3 Gold (State SGFI), 2 Silver (CBSE Nationals), selected for National RSFI championship.</li>
        </ul>

        <div class="visual-rail">
          <div class="slot accent" style="aspect-ratio: 1/1;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="3D">3D</span>
              <span class="slot-name">Gold medal — Outstanding Social Service</span>
              <span class="slot-aspect">1 : 1 · rotating medallion</span>
            </div>
          </div>
          <div class="slot" style="aspect-ratio: 4/3;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="3D">3D</span>
              <span class="slot-name">Medals stack — SGFI / CBSE / RSFI</span>
              <span class="slot-aspect">4 : 3 · stacked grouping</span>
            </div>
          </div>
          <div class="slot dark" style="aspect-ratio: 4/3;">
            <div class="slot-body">
              <span class="slot-kind" data-kind="ANIM">Animation</span>
              <span class="slot-name">Rube Goldberg machine — chain reaction loop</span>
              <span class="slot-aspect">4 : 3 · looping motion</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Skill Summary -->
    <section id="skills" class="section">
      <span class="section-num">06 · Skill Summary</span>
      <h2 class="section-title">Skill<br /><span class="accent-line">Summary</span></h2>

      <div class="skill-group">
        <span class="h">Operations &amp; Program Management</span>
        <div class="tags">
          <span class="skill-tag">Cross-functional Program Management</span>
          <span class="skill-tag">Strategic Planning</span>
          <span class="skill-tag">Vendor Management</span>
          <span class="skill-tag">Process Design &amp; SOPs</span>
          <span class="skill-tag">Change Management</span>
          <span class="skill-tag">Executive Stakeholder Reporting</span>
          <span class="skill-tag">Root Cause Analysis</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">Engineering &amp; Hardware</span>
        <div class="tags">
          <span class="skill-tag">Autodesk Fusion 360</span>
          <span class="skill-tag">Autodesk Inventor Professional</span>
          <span class="skill-tag">MATLAB</span>
          <span class="skill-tag">Arduino</span>
          <span class="skill-tag">LT-Spice</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">Delivery &amp; DevOps</span>
        <div class="tags">
          <span class="skill-tag">Jenkins CI/CD</span>
          <span class="skill-tag">BitBucket</span>
          <span class="skill-tag">Jira (Agile)</span>
          <span class="skill-tag">Microsoft Excel</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">Data &amp; Languages</span>
        <div class="tags">
          <span class="skill-tag">Generative AI Tools</span>
          <span class="skill-tag">SQL</span>
          <span class="skill-tag">PySpark (SparkSQL)</span>
          <span class="skill-tag">Python (data processing &amp; scripting)</span>
        </div>
      </div>
    </section>
  </main>

  <footer id="contact" class="footer">
    <div class="footer-grid">
      <h2>Open to <em>product &amp; program operations</em> at hardware-first companies.</h2>
      <div class="links">
        <a href="mailto:adarsh.g@iitgn.ac.in">
          <span class="k">Email</span>
          <span class="v">adarsh.g@iitgn.ac.in</span>
        </a>
        <a href="tel:+918602772536">
          <span class="k">Phone</span>
          <span class="v">+91 8602 772 536</span>
        </a>
        <a href="https://www.linkedin.com/in/adarsh-golait/" target="_blank" rel="noopener">
          <span class="k">LinkedIn</span>
          <span class="v">adarsh-golait</span>
        </a>
        <a href="#hero">
          <span class="k">Top</span>
          <span class="v">↑ Return to hero</span>
        </a>
      </div>
      <div class="colophon">
        <span>Adarsh Golait · Mumbai, IN</span>
        <span>Portfolio · 2026</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* ============================================================
   PORTFOLIO single-page styles
   Tokens + .section/.entry/.bullets/.tag/.slot/.kicker come from global style.css.
   This file owns: portfolio-topbar overrides, #hero overlay, #intro-message,
   #character-reveal, #summary, .split/.visual-rail, .edu-strip, #skills, .footer,
   .accent-line, .pipe.
   ============================================================ */

/* portfolio topbar — sits on top of hero, gets .is-active underline from scroll-spy */
.portfolio-topbar .nav a.is-active .nav-num,
.portfolio-topbar .nav a.is-active .nav-label { color: var(--ink); }
.portfolio-topbar .nav a.is-active::before {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--accent);
}
.portfolio-topbar .nav a.is-active::after { display: none; }

/* ════════════════════════════════════════════════════════════
   HERO STACK  — Page-1 on top of Page-2, scroll-driven zoom-out
   ════════════════════════════════════════════════════════════ */
.hs-driver {
  position: relative;
  /* Driver height = stickyH (100vh - topbar) + travel runway (100vh).
     Subtract topbar so page-2 content sits cleanly under the sticky topbar. */
  height: calc(var(--hs-driver-vh, 220) * 1vh - var(--topbar-h));
}
.hs-sticky {
  position: sticky;
  top: var(--topbar-h);
  width: 100%;
  height: calc(100vh - var(--topbar-h));
  overflow: hidden;
  isolation: isolate;
  /* 3D stage — gives Page-1's rotateX/Y/Z real depth foreshortening. */
  perspective: 1600px;
  perspective-origin: 50% 45%;
  transform-style: preserve-3d;
}
.hs-page2 {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.hs-page1 {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  transform-origin: 0 0;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  will-change: transform, clip-path, filter, opacity;
  pointer-events: auto;
  --hs-text-fade: 0;
  --hs-bg-dark:   0;
  --hs-depth-shadow: 0;
  /* No frame ring at landing — character should melt into the dark Page-2
     background. Only a soft depth shadow during the 3D mid-flight. */
  box-shadow:
    0 calc(60px * var(--hs-depth-shadow, 0)) calc(140px * var(--hs-depth-shadow, 0))
      rgba(0, 0, 0, calc(0.55 * var(--hs-depth-shadow, 0)));
}
/* Hero overlay text + dot grid + scroll-cue fade out as Page-1 lifts off.
   No CSS transitions — the rAF loop drives the CSS var directly; any
   `transition: opacity` here would fight the rAF and introduce visible jitter. */
.hs-page1 :deep(.hero-stack),
.hs-page1 :deep(.hero-stack-blur),
.hs-page1 :deep(.scroll-cue),
.hs-page1 :deep(.topbar) {
  opacity: calc(1 - var(--hs-text-fade));
  will-change: opacity;
}
.hs-page1 :deep(.dot-field) {
  opacity: calc(1 - var(--hs-dot-fade, 0));
  will-change: opacity;
}
/* Background of HeroSection — rAF writes --hs-bg-color directly so we get
   a single RGB var lerped from white → heroZoom.bgEndR/G/B. No transition
   here (rAF drives it). */
.hs-page1 :deep(.hero) {
  background: var(--hs-bg-color, #fff);
}
/* The target slot — hide its placeholder content during the zoom so Page-1
   replaces it cleanly. No border — character should fade into the bg. */
.im-frame .slot.hs-target-slot {
  background: transparent;
  border: 0;
  filter: none;
}
.im-frame .slot.hs-target-slot::before,
.im-frame .slot.hs-target-slot::after { display: none; }
.hs-target-slot .slot-body {
  opacity: calc(1 - var(--hs-cover-progress, 0));
  transition: opacity 0.2s linear;
}
@media (prefers-reduced-motion: reduce) {
  .hs-page1 { transition: none; }
}

/* Each long-scroll section fills ≥1 viewport (less the sticky topbar) so
   the section's heading sits right under the topbar when scrolled-to and
   no info gets hidden under the header. */
main > section.section {
  min-height: calc(100vh - var(--topbar-h));
  display: flex;
  flex-direction: column;
}

/* ─── hero ─── */
#hero {
  position: relative;
  height: 100vh;
  min-height: 640px;
  padding: 0;
  border-top: 0;
  overflow: hidden;
}
/* When #hero is the Page-1 layer of the hero-stack, override positioning so
   it fills the sticky viewport and can be transformed wholesale. */
#hero.hs-page1 {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* ════════════════════════════════════════════════════════════
   INTRO MESSAGE  — dark editorial transition between hero & body
   ════════════════════════════════════════════════════════════ */
#intro-message {
  position: relative;
  min-height: 100vh;
  padding: 0;
  border-top: 0;
  background: #1A1F12;
  color: #F2F3EC;
  overflow: hidden;
  isolation: isolate;
}
/* When mounted inside the hero-stack, intro-message fills the sticky 100vh
   layer behind Page-1. Flex column so im-stage absorbs remaining height
   between im-top and im-foot — keeps the lockup, label & résumé CTA visible
   right under the topbar. */
#intro-message.hs-page2 {
  position: absolute;
  inset: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
#intro-message.hs-page2 .im-stage { flex: 1 1 auto; min-height: 0; }
#intro-message.hs-page2 .im-foot { position: static; }
#intro-message::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600' preserveAspectRatio='none'><g fill='none' stroke='%23DBFE52' stroke-width='0.6' opacity='0.18'><path d='M0,80 C120,30 220,140 320,90 C420,40 520,140 600,90'/><path d='M0,160 C100,200 200,80 320,160 C440,240 520,80 600,160'/><path d='M0,240 C140,200 240,310 360,260 C480,210 540,300 600,260'/><path d='M0,320 C120,280 240,400 360,340 C480,280 560,400 600,340'/><path d='M0,400 C120,440 220,340 340,420 C460,500 540,360 600,420'/><path d='M0,480 C100,440 220,520 340,480 C460,440 540,540 600,480'/><path d='M0,560 C140,520 260,600 380,560 C500,520 560,600 600,560'/><path d='M-40,60 C80,10 200,120 300,70 C400,20 500,120 580,70' opacity='0.6'/><path d='M-40,140 C80,180 200,60 300,140 C400,220 500,60 580,140' opacity='0.6'/></g></svg>");
  background-size: 1200px 1200px;
  background-position: center;
  mix-blend-mode: screen;
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
}
#intro-message::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 55%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 100%);
  pointer-events: none;
  z-index: 1;
}

.im-top {
  position: relative;
  z-index: 5;
  padding: clamp(1.25rem, 3vh, 2rem) clamp(1.5rem, 3vw, 2.5rem);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 1rem;
}
.im-top .lockup {
  font: 900 clamp(0.95rem, 1.1vw, 1.05rem)/0.95 var(--f-sans);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.im-top .lockup .l1 { color: #F2F3EC; }
.im-top .lockup .l2 { color: #F2F3EC; opacity: 0.8; }
.im-top .lockup .ll { display: block; }
.im-top .center {
  display: flex; flex-direction: column; align-items: center; gap: 0.65rem;
}
.im-top .center .mark {
  width: 36px; height: 36px;
  display: grid; place-items: center;
  font: 900 1rem/1 var(--f-sans);
  letter-spacing: -0.02em;
  color: var(--accent);
  border: 1.5px solid var(--accent);
  transform: rotate(-3deg);
}
.im-top .center .label {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.78);
}
.im-top .right { display: flex; justify-content: flex-end; }
.im-top .cta {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 1.1rem;
  background: var(--accent);
  color: var(--accent-ink);
  font: 800 0.75rem/1 var(--f-sans);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border-radius: 4px;
  transition: transform 0.25s ease, filter 0.25s ease;
}
.im-top .cta:hover { transform: translateY(-2px); filter: brightness(1.05); }
.im-top .cta svg { width: 14px; height: 14px; }
@media (max-width: 720px) {
  .im-top { grid-template-columns: auto auto auto; }
  .im-top .center .label { display: none; }
}

.im-stage {
  position: relative;
  z-index: 3;
  /* Fill remaining sticky viewport between im-top header & im-foot. */
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
}
.im-frame {
  position: relative;
  width: clamp(360px, 46vw, 640px);
  aspect-ratio: 3/2;
  z-index: 4;
}
.im-frame :deep(.slot) {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: rgba(35,40,28,0.55);
  border: 1px dashed rgba(242,243,236,0.32);
  color: rgba(242,243,236,0.72);
  filter: grayscale(100%) contrast(0.95);
}
.im-frame :deep(.slot)::before {
  background-image: repeating-linear-gradient(-45deg, transparent 0, transparent 22px, rgba(242,243,236,0.04) 22px, rgba(242,243,236,0.04) 44px);
}
.im-frame :deep(.slot) .slot-kind {
  background: rgba(255,255,255,0.08);
  border-color: rgba(242,243,236,0.35);
  color: rgba(242,243,236,0.9);
}
.im-frame :deep(.slot) .slot-name { color: #F2F3EC; }
.im-frame :deep(.slot)::after { color: rgba(242,243,236,0.35); }

.im-marquee {
  position: absolute;
  left: 0; right: 0;
  pointer-events: none;
  z-index: 2;
  overflow: hidden;
  white-space: nowrap;
  mask-image: linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%);
}
.im-marquee.row-1 {
  top: calc(50% - clamp(2rem, 3.4vw, 3.4rem));
  transform: translateY(-50%);
}
.im-marquee.row-2 {
  top: calc(50% + clamp(2rem, 3.4vw, 3.4rem));
  transform: translateY(-50%);
}
.im-marquee .track {
  display: inline-flex;
  align-items: center;
  gap: clamp(1rem, 2.4vw, 2.6rem);
  will-change: transform;
}
.im-marquee.row-1 .track { animation: marquee-left 38s linear infinite; }
.im-marquee.row-2 .track { animation: marquee-right 44s linear infinite; }
.im-marquee .word {
  font: 900 clamp(2.4rem, 6.8vw, 6.6rem)/0.9 var(--f-sans);
  letter-spacing: -0.02em;
  text-transform: uppercase;
  display: inline-block;
}
/* Row-1 = editorial italic serif, fluorescent accent. Tight inner glow only
   — no wide bleed past the letter shapes. */
.im-marquee.row-1 .word {
  font-family: 'Times New Roman', 'Playfair Display', Georgia, serif;
  font-weight: 500;
  font-style: italic;
  color: rgba(219,254,82,0.88);
  letter-spacing: 0.01em;
  text-shadow:
    0 0 4px rgba(219, 254, 82, 0.45),
    0 0 10px rgba(219, 254, 82, 0.22);
}
/* Row-2 = clean sans bold, soft cream. */
.im-marquee.row-2 .word {
  color: #F2F3EC;
  letter-spacing: -0.02em;
}
.im-marquee .word .dot {
  display: inline-block;
  width: 0.28em; height: 0.28em;
  border-radius: 50%;
  background: currentColor;
  vertical-align: 0.36em;
  margin: 0 0.18em 0 0.35em;
  opacity: 0.5;
}
@keyframes marquee-left  { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes marquee-right { from { transform: translateX(-50%); } to { transform: translateX(0); } }
@media (prefers-reduced-motion: reduce) {
  .im-marquee.row-1 .track, .im-marquee.row-2 .track { animation: none; }
}

.im-signature {
  position: absolute;
  inset: 0;
  /* Sits above .hs-page1 (z:5) so the stroke is visible while page-1
     collapses into the slot underneath. */
  z-index: 6;
  /* Match reference: signature is oversized, scrawled across the portrait,
     biased slightly lower than image centre. */
  padding-top: clamp(2.5rem, 10vh, 8rem);
  padding-left: clamp(2rem, 6vw, 5rem);
  display: grid;
  place-items: center;
  pointer-events: none;
}
.im-signature :deep(svg) {
  width: clamp(260px, 28vw, 460px);
  height: auto;
  overflow: visible;
  /* Subtle neon-marker glow — restrained inner halo, no wide bleed. */
  filter:
    drop-shadow(0 0 4px rgba(219, 254, 82, 0.45))
    drop-shadow(0 0 14px rgba(219, 254, 82, 0.2));
}
/* Stroke style for every path; stroke-dasharray + stroke-dashoffset are set
   inline by setupSignaturePaths() and updateSignatureDraw(). */
.im-signature :deep(svg path),
.im-signature :deep(svg g) {
  stroke: var(--accent) !important;
  fill: none !important;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.im-signature :deep(svg path.sig-stroke) {
  stroke-width: 15;
}

.im-foot {
  position: absolute;
  left: 0; right: 0;
  bottom: 0;
  z-index: 5;
  padding: 0 clamp(1.5rem, 3vw, 2.5rem) clamp(1.25rem, 3vh, 2rem);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  gap: 1rem;
}
.im-foot .caption {
  font: 500 0.7rem/1.5 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.55);
  max-width: 26ch;
}
.im-foot .caption strong { color: #F2F3EC; font-weight: 600; }
.im-foot .scroll-down {
  display: inline-flex; flex-direction: column; align-items: center; gap: 0.6rem;
  color: rgba(242,243,236,0.78);
  pointer-events: auto;
}
.im-foot .scroll-down span {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.3em;
  text-transform: uppercase;
}
.im-foot .scroll-down .arrow {
  width: 1px; height: 48px;
  background: rgba(242,243,236,0.35);
  position: relative;
  overflow: hidden;
}
.im-foot .scroll-down .arrow::after {
  content: '';
  position: absolute;
  left: -1.5px; top: 0;
  width: 4px; height: 14px;
  background: var(--accent);
  animation: im-scroll-bead 2.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes im-scroll-bead {
  0%   { transform: translateY(-110%); opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateY(460%); opacity: 0; }
}
.im-foot .timestamp {
  justify-self: end;
  font: 500 0.62rem/1.5 var(--f-mono);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.5);
  text-align: right;
}
@media (max-width: 720px) {
  .im-foot { grid-template-columns: 1fr; gap: 1rem; }
  .im-foot .caption, .im-foot .timestamp { text-align: left; }
  .im-foot .scroll-down { align-items: flex-start; }
}

/* ════════════════════════════════════════════════════════════
   DOOR TRANSITION  — Page 2 splits like a door inside the hero
   sticky stage, revealing the 3D HeroCharacter sitting behind.
   Layer order inside .hs-sticky (bottom → top):
     z=0  .cr-bg--in-stage  (HeroCharacter + Meet Adarsh copy)
     z=1  #intro-message    (Page 2 base)
     z=5  #hero.hs-page1    (landed HeroSection inside P2 slot)
     z=6  .im-signature     (drawn signature)
     z=20 .door-layer       (P2 visual clones; split apart on wheel)
   When doorProgress > 0, the real P2 stack (1/5/6) fades to invisible
   so only the splitting clones are seen, and the HeroCharacter behind
   reveals through the widening gap.
   ════════════════════════════════════════════════════════════ */

/* HeroCharacter background behind P2 — fills the sticky viewport. */
.hs-sticky .cr-bg--in-stage {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(180deg, #1A1F12 0%, #0E1109 100%);
  overflow: hidden;
  /* Character starts slightly zoomed-in and behind, settles to neutral as
     doors fully open — feels like a controlled push-in past the threshold. */
  transform:
    scale(calc(1.14 - var(--door-progress, 0) * 0.14))
    translateY(calc((1 - var(--door-progress, 0)) * 32px));
  transform-origin: center 55%;
  transition: none;
  will-change: transform;
}
.hs-sticky .cr-bg--in-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  /* Neon glow grows from a tiny dot at door-open start to a wide halo
     once the user sees the full character — adds magic to the reveal. */
  background: radial-gradient(
    ellipse calc(30% + var(--door-progress, 0) * 40%) calc(30% + var(--door-progress, 0) * 40%)
    at 50% 58%,
    rgba(219, 254, 82, calc(0.05 + var(--door-progress, 0) * 0.16)) 0%,
    transparent 70%
  );
  pointer-events: none;
}
.hs-sticky .cr-beams {
  position: absolute;
  inset: 0;
  z-index: 0;
  /* Subtle ambient drift — barely-there glow that strengthens as doors part. */
  opacity: calc(0.12 + var(--door-progress, 0) * 0.22);
  mix-blend-mode: screen;
  pointer-events: none;
  transition: none;
}
.hs-sticky .cr-character,
.hs-sticky .cr-character-placeholder {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.hs-sticky .cr-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  padding: clamp(2rem, 6vh, 5rem) clamp(1.5rem, 4vw, 4rem);
  display: grid;
  grid-template-rows: auto 1fr auto;
  color: #F2F3EC;
  opacity: clamp(0, calc(var(--door-progress, 0) * 2 - 0.6), 1);
  transform: translateY(calc((1 - var(--door-progress, 0)) * 20px));
}
.hs-sticky .cr-top {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.7);
}
.hs-sticky .cr-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 1rem;
}
.hs-sticky .cr-headline {
  font: 900 clamp(2rem, 5vw, 4.5rem)/0.95 var(--f-sans);
  letter-spacing: -0.045em;
  text-transform: uppercase;
  max-width: 18ch;
  text-wrap: balance;
}
.hs-sticky .cr-headline em {
  font-style: normal;
  color: var(--accent);
}
.hs-sticky .cr-meta {
  font: 500 0.68rem/1.5 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.55);
  text-align: right;
}

/* ────────────────────────────────────────────────────────────
   Page-2 front-stack wrapper — wraps the real intro-message +
   landed HeroSection + signature. A single clip-path widens a
   vertical centre gap as --door-progress grows, splitting the
   real P2 open and revealing the HeroCharacter sitting behind.
   No DOM duplication. No snapshot. No ghosting.

   Gap calc: at progress 0 the two rectangles join at 50% (no
   gap). At progress 1 the gap is the full viewport width so the
   whole front-stack is clipped away.
   ──────────────────────────────────────────────────────────── */
.hs-sticky .hs-front {
  position: absolute;
  inset: 0;
  z-index: 5;
  /* Two rectangles separated by a centre gap of width = progress * 100%.
     Polygon points (clockwise):
       LEFT rect:  (0,0) → (50% - gap/2, 0) → (50% - gap/2, 100%) → (0,100%)
       RIGHT rect: (50% + gap/2, 0) → (100%, 0) → (100%, 100%) → (50% + gap/2, 100%) */
  --gap: calc(var(--door-progress, 0) * 100%);
  clip-path: polygon(
    0% 0%,
    calc(50% - var(--gap) / 2) 0%,
    calc(50% - var(--gap) / 2) 100%,
    0% 100%,
    0% 0%,
    100% 0%,
    100% 100%,
    calc(50% + var(--gap) / 2) 100%,
    calc(50% + var(--gap) / 2) 0%,
    100% 0%
  );
  /* Shadow on the cut edges to sell depth as the gap widens.
     Filter drop-shadow follows the clip-path shape — no extra layer. */
  filter: drop-shadow(
    calc(var(--door-progress, 0) * -10px) 0 calc(var(--door-progress, 0) * 24px)
    rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.55))
  );
  will-change: clip-path, filter;
  transition: none;
}

/* ────────────────────────────────────────────────────────────
   3D DOOR OVERLAY — fakes door thickness + outward swing.
   Sits above .hs-front (z=6) so it covers the seam of the clip
   gap. Two halves are positioned at the centre seam, each as
   wide as half the viewport. As --door-progress grows:
     · each half translates outward (matches clip-path gap)
     · each half rotates outward on Y axis (perspective on parent
       .hs-sticky gives real foreshortening)
     · inner edge carries a bevel gradient (door thickness) +
       cast shadow that grows with angle
   Pointer-events off — purely visual.
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   DEPTH SHIM (z=2) — volumetric depth between P2 and 3D slabs.
   Masked to the widening centre band (gap width = progress*100%)
   so it only paints inside the door split. Three sublayers:
     · haze     — far atmospheric fade
     · vignette — top/bottom darkening = receding tunnel
     · glow     — soft accent portal pulse from centre
   ──────────────────────────────────────────────────────────── */
.hs-sticky .hs-door-depth {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  /* Mask to the centre gap band so depth FX only show where doors
     have parted — never bleed over intact P2. Band width tracks
     --door-progress exactly. */
  --depth-band: calc(var(--door-progress, 0) * 100%);
  -webkit-mask: linear-gradient(
    to right,
    transparent 0,
    transparent calc(50% - var(--depth-band) / 2),
    #000 calc(50% - var(--depth-band) / 2 + 2%),
    #000 calc(50% + var(--depth-band) / 2 - 2%),
    transparent calc(50% + var(--depth-band) / 2),
    transparent 100%
  );
          mask: linear-gradient(
    to right,
    transparent 0,
    transparent calc(50% - var(--depth-band) / 2),
    #000 calc(50% - var(--depth-band) / 2 + 2%),
    #000 calc(50% + var(--depth-band) / 2 - 2%),
    transparent calc(50% + var(--depth-band) / 2),
    transparent 100%
  );
  opacity: clamp(0, calc(var(--door-progress, 0) * 4), 1);
  will-change: opacity;
}
.hs-sticky .hs-door-depth > * {
  position: absolute;
  inset: 0;
}
/* (a) edge-only haze — darkens TOP and BOTTOM bands of the gap,
   leaving the centre (where character sits) crystal clear. Sells
   depth at the door frame without fogging the subject. */
.hs-sticky .hs-door-depth__haze {
  background: linear-gradient(
    to bottom,
    rgba(8, 10, 14, 0.55) 0%,
    rgba(8, 10, 14, 0.18) 18%,
    rgba(0, 0, 0, 0) 38%,
    rgba(0, 0, 0, 0) 62%,
    rgba(8, 10, 14, 0.18) 82%,
    rgba(8, 10, 14, 0.55) 100%
  );
}
/* (b) side vignette — darker at LEFT/RIGHT inner walls of gap
   (next to door slabs), transparent over centre. Reads as
   recessed frame. No blend mode to avoid tinting character. */
.hs-sticky .hs-door-depth__vignette {
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.18) 14%,
    rgba(0, 0, 0, 0) 32%,
    rgba(0, 0, 0, 0) 68%,
    rgba(0, 0, 0, 0.18) 86%,
    rgba(0, 0, 0, 0.5) 100%
  );
}
/* (c) faint rim glow at TOP edge only — accent kiss that hints
   at light spill from the doorway, doesn't sit over character. */
.hs-sticky .hs-door-depth__glow {
  background: radial-gradient(
    ellipse 50% 22% at 50% 0%,
    rgba(219, 254, 82, calc(0.08 + var(--door-progress, 0) * 0.06)) 0%,
    rgba(219, 254, 82, 0) 70%
  );
}

.hs-sticky .hs-door-3d {
  position: absolute;
  inset: 0;
  /* Sit BEHIND .hs-front (z=5) so slabs only show through the
     clip-path gap as P2 splits — never overlay the intact P2. */
  z-index: 3;
  pointer-events: none;
  transform-style: preserve-3d;
}
.hs-sticky .hs-door-3d__half {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Wider band — more visible door slab catching light, more
     foreshortening as it tilts. */
  width: 22%;
  opacity: clamp(0, calc(min(var(--door-progress, 0) * 8, (1 - var(--door-progress, 0)) * 3)), 1);
  will-change: transform, opacity;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.hs-sticky .hs-door-3d__half--l {
  /* Right edge of band sits at screen centre when closed; translates
     left with the split, pushes deeper (translateZ -) and tilts
     hard so it reads as a swinging slab. */
  right: 50%;
  transform-origin: right center;
  transform:
    translateX(calc(var(--door-progress, 0) * -110vw))
    translateZ(calc(var(--door-progress, 0) * -180px))
    rotateY(calc(var(--door-progress, 0) * 65deg));
  /* Inner edge dark, sweeping to subtle highlight band mid-slab,
     then transparent — sells curvature + light catch. */
  background: linear-gradient(
    to left,
    rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.75)) 0%,
    rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.45)) 18%,
    rgba(255, 255, 255, calc(var(--door-progress, 0) * 0.06)) 55%,
    rgba(0, 0, 0, 0) 100%
  );
  box-shadow:
    inset calc(var(--door-progress, 0) * -2px) 0 0 rgba(255, 255, 255, calc(var(--door-progress, 0) * 0.35)),
    calc(var(--door-progress, 0) * 28px) 0 calc(var(--door-progress, 0) * 64px)
      rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.65));
}
.hs-sticky .hs-door-3d__half--r {
  left: 50%;
  transform-origin: left center;
  transform:
    translateX(calc(var(--door-progress, 0) * 110vw))
    translateZ(calc(var(--door-progress, 0) * -180px))
    rotateY(calc(var(--door-progress, 0) * -65deg));
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.75)) 0%,
    rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.45)) 18%,
    rgba(255, 255, 255, calc(var(--door-progress, 0) * 0.06)) 55%,
    rgba(0, 0, 0, 0) 100%
  );
  box-shadow:
    inset calc(var(--door-progress, 0) * 2px) 0 0 rgba(255, 255, 255, calc(var(--door-progress, 0) * 0.35)),
    calc(var(--door-progress, 0) * -28px) 0 calc(var(--door-progress, 0) * 64px)
      rgba(0, 0, 0, calc(var(--door-progress, 0) * 0.65));
}

@media (prefers-reduced-motion: reduce) {
  .hs-sticky .hs-door-3d { display: none; }
  .hs-sticky .hs-door-depth { display: none; }
  .hs-sticky .hs-front {
    clip-path: none;
    opacity: calc(1 - var(--door-progress, 0));
  }
  .hs-sticky .cr-bg--in-stage,
  .hs-sticky .cr-overlay {
    transform: none !important;
  }
}

/* ─── summary ─── */
#summary {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: start;
}
@media (max-width: 980px) { #summary { grid-template-columns: 1fr; } }
#summary .body p {
  font: 400 clamp(1.05rem, 1.3vw, 1.18rem)/1.65 var(--f-sans);
  color: var(--ink);
  max-width: 60ch;
  text-wrap: pretty;
  margin-bottom: 1.25rem;
}
#summary .body p strong { color: var(--ink); font-weight: 600; }
#summary .body p em { font-style: normal; background: var(--accent); color: var(--accent-ink); padding: 0 0.16em; }
#summary .stack-right {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  position: sticky;
  top: 6rem;
}
#summary .slot-portrait { aspect-ratio: 4/5; min-height: 380px; }

/* ─── two-column layouts ─── */
.split {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}
@media (max-width: 980px) { .split { grid-template-columns: 1fr; } }
.split.flip { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
.split .visual-rail {
  position: sticky;
  top: 6rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
@media (max-width: 980px) {
  .split .visual-rail { position: static; }
}

/* education tagline strip */
.edu-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--rule);
  margin-top: 1.5rem;
}
.edu-strip .cell {
  padding: 1.1rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.edu-strip .cell + .cell { border-left: 1px solid var(--rule); }
@media (max-width: 720px) {
  .edu-strip { grid-template-columns: 1fr 1fr; }
  .edu-strip .cell:nth-child(3) { border-left: 0; border-top: 1px solid var(--rule); }
  .edu-strip .cell:nth-child(4) { border-top: 1px solid var(--rule); }
}
.edu-strip .k {
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.edu-strip .v {
  font: 800 1.05rem/1.2 var(--f-sans);
  letter-spacing: -0.015em;
}

/* skill summary */
#skills .skill-group {
  padding: clamp(1.5rem, 3vh, 2rem) 0;
  border-top: 1px solid var(--rule);
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  gap: clamp(1rem, 2vw, 2rem);
  align-items: baseline;
}
@media (max-width: 720px) { #skills .skill-group { grid-template-columns: 1fr; gap: 0.5rem; } }
#skills .skill-group:first-of-type { border-top: 0; padding-top: 0; }
#skills .skill-group .h {
  font: 700 0.85rem/1.3 var(--f-sans);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--ink);
}
#skills .skill-group .tags {
  display: flex; flex-wrap: wrap; gap: 0.4rem 0.5rem;
}
#skills .skill-group .skill-tag {
  font: 500 0.72rem/1 var(--f-mono);
  letter-spacing: 0.04em;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--rule);
  color: var(--ink-soft);
}

/* shared section title accent */
.section-title :deep(.accent-line),
.section-title .accent-line { color: var(--ink-soft); }

.pipe { color: var(--ink-faint); }

/* footer / contact */
.footer {
  padding: clamp(3rem, 8vh, 6rem) var(--gutter-x);
  background: var(--ink);
  color: var(--paper);
  border-top: 1px solid var(--ink);
}
.footer .footer-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: end;
}
@media (max-width: 880px) { .footer .footer-grid { grid-template-columns: 1fr; align-items: start; gap: 2rem; } }
.footer h2 {
  font: 900 clamp(2.4rem, 6vw, 5rem)/0.9 var(--f-sans);
  letter-spacing: -0.04em;
  text-transform: uppercase;
  max-width: 14ch;
}
.footer h2 em { font-style: normal; color: var(--accent); }
.footer .links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.18);
}
@media (max-width: 520px) { .footer .links { grid-template-columns: 1fr; } }
.footer .links a {
  background: var(--ink);
  padding: 1.1rem 1.25rem;
  display: flex; flex-direction: column; gap: 0.4rem;
  transition: background 0.25s ease;
}
.footer .links a:hover { background: var(--accent); color: var(--accent-ink); }
.footer .links .k {
  font: 500 0.58rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.55;
}
.footer .links a:hover .k { opacity: 0.85; }
.footer .links .v {
  font: 600 0.92rem/1.3 var(--f-mono);
  letter-spacing: 0.02em;
}
.footer .colophon {
  grid-column: 1 / -1;
  padding-top: 2rem;
  margin-top: 2rem;
  border-top: 1px solid rgba(255,255,255,0.18);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
</style>
