<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import HeroSection from '../HeroSection.vue'
import BeamsBackground from '../components/BeamsBackground.vue'
import CorporateSlider from '../components/portfolio/CorporateSlider.vue'
import TimedCards from '../components/portfolio/TimedCards.vue'
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

const JourneyCharacter = defineAsyncComponent(() => import('../character/JourneyCharacter.vue'))
const SummaryCharacter = defineAsyncComponent(() => import('../character/SummaryCharacter.vue'))

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
// ────────────────────────────────────────────────────────────────────
// Slot aspect for landed Page-1. Landscape on desktop; portrait on compact
// (phone) viewports, where a landscape crop of the portrait hero photo
// reduces to an eye-strip. Must match the .im-frame aspect-ratio media query.
const HERO_SLOT_AR_WIDE    = 24 / 14
const HERO_SLOT_AR_COMPACT = 3 / 4

function isCompactViewport() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 720px)').matches
}

function heroSlotAR() {
  return isCompactViewport() ? HERO_SLOT_AR_COMPACT : HERO_SLOT_AR_WIDE
}

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
  // without losing the lerp blend.
  smoothing:     0.12,
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
// — same stage as the existing P2 + landed P1 + signature. The split is
// scroll-scrubbed, exactly like the hero zoom: the driver reserves a
// runway segment after the hero budget, and door progress is a pure
// function of how far the user has scrolled into that segment. No wheel
// hijack, no scroll lock — every input method (wheel, trackpad, touch,
// keyboard, scrollbar, anchor jump) lands on a deterministic state, and
// a fast flick can never outrun the stage because the sticky pin covers
// the entire runway.
//
// Runway layout (vh of scroll travel):
//   0 ──────────── HERO_BUDGET_VH ──────── +DOOR_BUDGET_VH ── +DOOR_DWELL_VH
//   hero zoom + signature │ doors split open │ hold on character │ release
// ────────────────────────────────────────────────────────────────────
const doorProgressRef = ref(0)         // 0 = doors closed, 1 = fully open
const characterDoorRef = ref(false)    // pre-mount HeroCharacter behind doors

const doorConfig = {
  smoothing: 0.16,
}
let doorRafId: number | null = null
let doorProgress = 0
let doorProgressTarget = 0

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
  }
}

let scrollSpy: IntersectionObserver | null = null
let warmIdleId: number | null = null
let warmTimerId: number | null = null
let warmLoadListener: (() => void) | null = null
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

  const targetAR = heroSlotAR()
  const cropW = Math.min(heroVpW, heroVpH * targetAR)
  const cropH = cropW / targetAR

  const slotW = heroSlotRect.w * heroZoom.sizeScale

  // visibleW/H = the trimmed window that lands exactly inside the slot.
  // Dividing by characterSize > 1 enlarges the character at landing (smaller
  // visible source × larger scale = bigger image inside the slot). On compact
  // viewports the source render is already a tight portrait crop, so the
  // desktop zoom factor over-magnifies — keep it near 1 there.
  const charSize = isCompactViewport() ? 1.05 : heroZoom.characterSize
  const visibleW = cropW / charSize
  const visibleH = cropH / charSize

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

// Scroll runway segments (vh of driver travel). Hero zoom + signature
// consume the first segment, the door split scrubs through the second,
// and the dwell holds the open-door character stage for ~one wheel notch
// before the sticky releases into the summary. Total driver height =
// segments + one sticky viewport (100vh).
const HERO_BUDGET_VH = 240
const DOOR_BUDGET_VH = 150
// Longer dwell than the original one-notch hold: viewers were flicking
// straight past the character stage without ever discovering that the
// head follows the cursor. ~4 wheel notches of pinned hold + the cursor
// hint overlay give the interaction a chance to be seen.
const DOOR_DWELL_VH  = 70
const DRIVER_VH = 100 + HERO_BUDGET_VH + DOOR_BUDGET_VH + DOOR_DWELL_VH

// Shared scroll geometry for the sticky hero/door stage. `scrolled` is how
// far into the pinned runway we are (0 = stage just pinned). `heroBudgetPx`
// is where hero-zoom completes and the door split begins.
function stageGeom() {
  const driver = heroDriverRef.value
  const sticky = heroStickyRef.value
  if (!driver) return null
  const rect = driver.getBoundingClientRect()
  const stickyH = sticky?.clientHeight || window.innerHeight
  const travel = Math.max(1, driver.clientHeight - stickyH)
  const scrolled = Math.min(travel, Math.max(0, -rect.top))
  // Budgets are RATIOS of the rendered travel, not window.innerHeight units.
  // On mobile the URL bar collapse changes innerHeight mid-scroll; deriving
  // budgets from it would shift the segment boundaries under the user's
  // finger and make the stage jump. The driver is sized in svh (stable),
  // so travel only changes on real resizes.
  const TRAVEL_VH = HERO_BUDGET_VH + DOOR_BUDGET_VH + DOOR_DWELL_VH
  const heroBudgetPx = travel * (HERO_BUDGET_VH / TRAVEL_VH)
  const doorBudgetPx = Math.max(1, travel * (DOOR_BUDGET_VH / TRAVEL_VH))
  return { scrolled, heroBudgetPx, doorBudgetPx, travel }
}

function onHeroScroll() {
  const g = stageGeom()
  if (!g) return
  heroProgressTarget = Math.min(1, g.scrolled / Math.max(1, g.heroBudgetPx))
  // Door split scrubs through the runway segment right after the hero
  // budget. Pure position → progress mapping; reverse scroll closes them.
  doorProgressTarget = Math.min(1, Math.max(0, (g.scrolled - g.heroBudgetPx) / g.doorBudgetPx))
  characterDoorRef.value = doorProgressTarget > 0.05
  if (heroRafId === null) {
    heroRafId = requestAnimationFrame(heroLoop)
  }
  if (doorRafId === null) {
    doorRafId = requestAnimationFrame(doorLoop)
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

// ────────────────────────────────────────────────────────────────────
// Pinned staged sections (Education / Experience) + scroll-entrance
// reveal choreography. Ported from the claude.ai/design prototype
// (portfolio.html + reveal.js). Each setup returns a cleanup fn.
// ────────────────────────────────────────────────────────────────────
const eduRef = ref<HTMLElement | null>(null)
const xpRef = ref<HTMLElement | null>(null)
const sectionCleanups: (() => void)[] = []

// Education: section is 240vh tall; content pins for the extra scroll.
// Progress through the pin drives the stages — scrolling back reverses.
function setupEducationPin(): (() => void) | null {
  const sec = eduRef.value
  if (!sec) return null
  const mqMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0

  function update() {
    raf = 0
    if (!sec!.classList.contains('edu-staged')) return
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    sec!.classList.toggle('head-in', rect.top < innerHeight * 0.92)
    sec!.classList.toggle('stage-name', p >= 0.14)
    sec!.classList.toggle('stage-details', p >= 0.48)
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(update) }

  function apply() {
    const on = !mqMotion.matches
    sec!.classList.toggle('edu-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      update()
    } else {
      removeEventListener('scroll', onScroll)
      sec!.classList.remove('stage-name', 'stage-details', 'head-in')
    }
  }
  mqMotion.addEventListener?.('change', apply)
  apply()
  return () => {
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
  }
}

// Work Experience: section is 320vh tall; content pins for the extra
// scroll. Progress picks the active employer — name fills with the accent
// mark, its role panel rises in. Small screens / reduced motion fall back
// to stacked entries with every company highlighted.
function setupExperiencePin(): (() => void) | null {
  const sec = xpRef.value
  if (!sec) return null
  const cos = Array.from(sec.querySelectorAll<HTMLElement>('.xp-co'))
  const panels = Array.from(sec.querySelectorAll<HTMLElement>('.xp-panel'))
  const mqMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0

  function setActive(i: number) {
    cos.forEach((el, j) => el.classList.toggle('is-active', j === i))
    panels.forEach((el, j) => el.classList.toggle('is-active', j === i))
    sec!.dataset.xpActive = String(i)
  }
  function update() {
    raf = 0
    if (!sec!.classList.contains('xp-staged')) return
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    sec!.classList.toggle('head-in', rect.top < innerHeight * 0.92)
    sec!.classList.toggle('stage-in', rect.top < innerHeight * 0.55)
    setActive(p < 0.38 ? 0 : p < 0.72 ? 1 : 2)
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(update) }

  function apply() {
    const on = !mqMotion.matches && innerWidth > 880 && innerHeight > 620
    sec!.classList.toggle('xp-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      update()
    } else {
      removeEventListener('scroll', onScroll)
      sec!.classList.remove('stage-in', 'head-in')
      cos.forEach((el) => el.classList.add('is-active'))
      panels.forEach((el) => el.classList.add('is-active'))
    }
  }
  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', apply, { passive: true })
  apply()
  return () => {
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('resize', apply)
    removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
  }
}

// Summary: the character's journey destination. On desktop the SAME
// character (same canvas — see JourneyCharacter.vue) breaks out of the door
// stage the moment the runway releases: a scroll tween carries the page to
// the summary while he flies from his on-stage position to the slot beside
// the text. While pinned, icon buttons play one-shot clips; the final pin
// segment scrubs a contact-locked push-out — he walks INTO the text block
// first, then text and character travel off the left edge together at the
// same speed, like a real shove.
const summaryRef = ref<HTMLElement | null>(null)
const summarySlotRef = ref<HTMLElement | null>(null)
const summaryCharRef = ref<any>(null) // non-staged fallback component
const journeyRef = ref<any>(null)
const sumStaged = ref(false)

// Live character state, emitted by JourneyCharacter — drives button states.
const charState = reactive({ ready: false, busy: false, phase: 'stage', pushing: false })
function onCharState(s: { ready: boolean; busy: boolean; phase: string; pushing: boolean }) {
  charState.ready = s.ready
  charState.busy = s.busy
  charState.phase = s.phase
  charState.pushing = s.pushing
}
function playCharAction(name: string) {
  journeyRef.value?.playAction?.(name)
}

// rAF scroll tween — deterministic timing so the flight and the page move
// as one. Any real user input (wheel / touch / keys) cancels it; the flight
// still lands correctly because it tracks the live slot rect.
let scrollTweenRaf = 0
function cancelScrollTween() {
  if (scrollTweenRaf) cancelAnimationFrame(scrollTweenRaf)
  scrollTweenRaf = 0
}
function tweenScrollTo(targetY: number, dur: number) {
  cancelScrollTween()
  const startY = window.scrollY
  const dist = targetY - startY
  if (Math.abs(dist) < 2) return
  const t0 = performance.now()
  const step = (now: number) => {
    scrollTweenRaf = 0
    const t = Math.min(1, (now - t0) / dur)
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    window.scrollTo({ top: startY + dist * e, behavior: 'instant' as ScrollBehavior })
    if (t < 1) scrollTweenRaf = requestAnimationFrame(step)
  }
  scrollTweenRaf = requestAnimationFrame(step)
}
const cancelTweenOnInput = () => cancelScrollTween()

// Stage CTA — "send him down": tween the page to the summary; the scroll
// handler below fires the breakout on the way, exactly as a manual scroll
// would. One code path, no special cases.
function sendHimDown() {
  const sec = summaryRef.value
  if (!sec) return
  const target = window.scrollY + sec.getBoundingClientRect().top
  tweenScrollTo(target, 1450)
}

const PUSH_START = 0.5   // pin progress where the push-out segment begins
const PUSH_CONTACT = 0.22 // share of the push spent walking to the text

function setupSummaryStage(): (() => void) | null {
  const sec = summaryRef.value
  if (!sec) return null
  const mqMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0
  let brokeOut = false
  let pushOn = false
  let lastY = window.scrollY

  function update() {
    raf = 0
    const goingDown = window.scrollY > lastY
    lastY = window.scrollY
    if (!sumStaged.value) return
    const rect = sec!.getBoundingClientRect()

    // Breakout: runway released, summary sliding in — fly the character out
    // of the stage and glide the page so the landing is framed. The tween
    // duration matches the flight so both settle together.
    if (!brokeOut && goingDown && rect.top > 0 && rect.top < innerHeight * 0.92) {
      brokeOut = true
      journeyRef.value?.breakout?.(summarySlotRef.value)
      tweenScrollTo(window.scrollY + rect.top, 1400)
    }

    // Entered the pin without the flight (anchor jump past the summary,
    // then scrolled back into it) — he still has to show up, flying in
    // from wherever the stage is (off-screen above).
    if (!brokeOut && rect.top <= 0 && rect.bottom >= innerHeight) {
      brokeOut = true
      journeyRef.value?.breakout?.(summarySlotRef.value)
    }

    // Reverse: user scrolled back up toward the stage — fly him home.
    if (brokeOut && !goingDown && rect.top > innerHeight * 0.45) {
      brokeOut = false
      journeyRef.value?.returnToStage?.()
    }

    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0
    const q = Math.min(1, Math.max(0, (p - PUSH_START) / (1 - PUSH_START)))
    // Contact-locked choreography: `appr` walks him to the text block,
    // `exit` moves him AND the text at the same speed once touching.
    const appr = Math.min(1, q / PUSH_CONTACT)
    const exit = Math.max(0, (q - PUSH_CONTACT) / (1 - PUSH_CONTACT))
    sec!.style.setProperty('--sum-appr', appr.toFixed(4))
    sec!.style.setProperty('--sum-exit', exit.toFixed(4))
    const wantPush = q > 0.01
    if (wantPush !== pushOn) {
      pushOn = wantPush
      journeyRef.value?.setPushing?.(pushOn)
    }
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(update) }

  // Non-staged fallback (mobile / reduced motion): SummaryCharacter handles
  // itself — just fire its entrance jump once it scrolls into view.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      if (!sumStaged.value && !mqMotion.matches) summaryCharRef.value?.enter?.()
      io.disconnect()
    }
  }, { threshold: 0.35 })
  io.observe(sec)

  function apply() {
    const on = !mqMotion.matches && innerWidth > 980 && innerHeight > 560
    sumStaged.value = on
    sec!.classList.toggle('sum-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      update()
    } else {
      removeEventListener('scroll', onScroll)
      sec!.style.setProperty('--sum-appr', '0')
      sec!.style.setProperty('--sum-exit', '0')
      pushOn = false
      if (brokeOut) {
        brokeOut = false
        journeyRef.value?.returnToStage?.()
      }
    }
  }
  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', apply, { passive: true })
  addEventListener('wheel', cancelTweenOnInput, { passive: true })
  addEventListener('touchstart', cancelTweenOnInput, { passive: true })
  addEventListener('keydown', cancelTweenOnInput)
  apply()
  return () => {
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('resize', apply)
    removeEventListener('scroll', onScroll)
    removeEventListener('wheel', cancelTweenOnInput)
    removeEventListener('touchstart', cancelTweenOnInput)
    removeEventListener('keydown', cancelTweenOnInput)
    cancelScrollTween()
    io.disconnect()
    if (raf) cancelAnimationFrame(raf)
  }
}

// Scroll-entrance choreography — auto-decorates common content blocks with
// .rv classes and reveals them as they enter the viewport (one-shot).
// Elements inside a [data-no-reveal] subtree are left alone — sections with
// their own scroll engines (hero stack, pinned Education / Experience,
// sliders) opt out there.
function setupReveal(): (() => void) | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null

  /* [selector, variant, per-sibling stagger (s)] */
  const GROUPS: [string, string, number][] = [
    ['.section-num', 'rv-left', 0],
    ['.section-title', 'rv-left', 0],
    ['.section-lede', 'rv-left', 0],
    ['#summary .body p', 'rv', 0.07],
    ['.visual-rail .slot', 'rv-right', 0.1],
    ['.entry-head', 'rv', 0],
    ['.entry-sub', 'rv', 0.06],
    ['.bullets > li', 'rv-pop', 0.05],
    ['.edu-strip .cell', 'rv', 0.07],
    ['.skill-group .h', 'rv-left', 0],
    ['.skill-group .skill-tag', 'rv-pop', 0.025],
    ['.footer h2', 'rv-left', 0],
    ['.footer .links a', 'rv-fade', 0.07],
    ['.footer .colophon', 'rv-fade', 0],
  ]
  const CAP = 0.45 /* max stagger delay, seconds */

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('rv-in')
      io.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 })

  const seen = new Set<Element>()
  GROUPS.forEach(([sel, variant, step]) => {
    const perParent = new Map<Element | null, number>()
    document.querySelectorAll(sel).forEach((el) => {
      if (seen.has(el) || el.closest('[data-no-reveal]')) return
      seen.add(el)
      const parent = el.parentElement
      const idx = perParent.get(parent) || 0
      perParent.set(parent, idx + 1)
      el.classList.add('rv')
      if (variant !== 'rv') el.classList.add(variant)
      const d = Math.min(idx * step, CAP)
      if (d > 0) (el as HTMLElement).style.setProperty('--rvd', d.toFixed(3) + 's')
      io.observe(el)
    })
  })
  return () => io.disconnect()
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
    driver.style.setProperty('--hs-driver-vh', `${DRIVER_VH}`)
  }
  // Slot shape comes from .im-frame's aspect-ratio (CSS, with a portrait
  // media-query override on compact viewports) — the slot fills the frame,
  // and applyHeroTransform reads the same heroSlotAR() so the crop and the
  // placeholder always land at the same shape.

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

  // HeroCharacter lives inside .hs-sticky (behind the doors). Warm it up
  // early so it's ready when the doors part — but AFTER first paint and the
  // hero's own assets. The old IntersectionObserver fired immediately (the
  // sticky stage is in the viewport from load), so the ~4MB GLB download +
  // shader compile competed with the hero photos and fonts during initial
  // load. The doors are still hundreds of vh of scroll away; if the user
  // outruns the idle timer, characterDoorRef mounts it instantly anyway.
  const warmCharacter = () => { characterVisible.value = true }
  const scheduleWarm = () => {
    if (typeof window.requestIdleCallback === 'function') {
      warmIdleId = window.requestIdleCallback(warmCharacter, { timeout: 4000 })
    } else {
      warmTimerId = window.setTimeout(warmCharacter, 1500)
    }
  }
  if (document.readyState === 'complete') {
    scheduleWarm()
  } else {
    window.addEventListener('load', scheduleWarm, { once: true })
    warmLoadListener = scheduleWarm
  }

  // Pinned Education / Experience stages + scroll-entrance reveals.
  for (const setup of [setupSummaryStage, setupEducationPin, setupExperiencePin, setupReveal]) {
    const cleanup = setup()
    if (cleanup) sectionCleanups.push(cleanup)
  }
})

onBeforeUnmount(() => {
  sectionCleanups.forEach((fn) => fn())
  sectionCleanups.length = 0
  scrollSpy?.disconnect()
  scrollSpy = null
  if (warmIdleId !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(warmIdleId)
  }
  warmIdleId = null
  if (warmTimerId !== null) clearTimeout(warmTimerId)
  warmTimerId = null
  if (warmLoadListener) window.removeEventListener('load', warmLoadListener)
  warmLoadListener = null
  window.removeEventListener('scroll', onHeroScroll)
  window.removeEventListener('resize', measureHeroSlot)
  window.removeEventListener('resize', syncTopbarH)
  heroResizeObs?.disconnect()
  heroResizeObs = null
  if (heroRafId !== null) cancelAnimationFrame(heroRafId)
  heroRafId = null
  if (doorRafId !== null) cancelAnimationFrame(doorRafId)
  doorRafId = null
  // Reset stage state — module-scope vars otherwise leak across remounts
  // (HMR, route re-entry).
  doorProgress = 0
  doorProgressTarget = 0
  doorProgressRef.value = 0
  characterDoorRef.value = false
  heroProgress = 0
  heroProgressTarget = 0
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
    <div ref="heroDriverRef" class="hs-driver" data-no-reveal :style="{ '--door-progress': doorProgressRef }">
      <div ref="heroStickyRef" class="hs-sticky">
        <!-- P3 (behind everything) — HeroCharacter + reveal overlay copy.
             Mounts lazily once the signature is mostly done, so it's warm
             behind the doors when they begin to part. -->
        <div class="cr-bg cr-bg--in-stage">
          <!-- :paused while the doors are fully shut — everything in .cr-bg
               is occluded by .hs-front, so beams/character skip GPU work
               until their first potentially-visible pixel. -->
          <BeamsBackground class="cr-beams" intensity="subtle" :paused="doorProgressRef < 0.001" />
          <JourneyCharacter
            v-if="characterVisible || characterDoorRef"
            ref="journeyRef"
            class="cr-character"
            :camera-zoom="1.25"
            :paused="doorProgressRef < 0.001"
            @state="onCharState"
          />
          <div v-else class="cr-character-placeholder" aria-hidden="true"></div>
          <div class="cr-overlay">
            <span class="cr-top">— Meet Adarsh</span>
            <div></div>
            <div class="cr-bottom">
              <h2 class="cr-headline">A <em>moving</em><br />operator — not a still one.</h2>
              <div class="cr-meta-stack">
                <p class="cr-hint"><span class="cr-hint-dot" aria-hidden="true"></span>Move your cursor — he follows</p>
                <button v-if="sumStaged" type="button" class="cr-cta" @click="sendHimDown">
                  Send him down<span class="cr-cta-arrow" aria-hidden="true">↓</span>
                </button>
                <p v-else class="cr-meta">Scroll to enter the work →</p>
              </div>
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
          <HeroSection :show-topbar="false" :scroll-cue-link="false" />
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

    <!-- Summary — pinned stage: text left, interactive character right.
         The character jumps in from the door stage, takes action-button
         requests while pinned, then pushes the text off-screen left during
         the final runway segment to hand over to Education. -->
    <section id="summary" ref="summaryRef" class="section summary-driver">
      <div class="summary-pin">
      <div class="summary-grid">
      <div class="body">
        <span class="section-num">00 · Summary</span>
        <h2 class="section-title">Summary</h2>
        <p>
          Mechanical Engineer from IIT Gandhinagar (Gold Medalist, CPI 8.18) with hands-on hardware build experience — a concept-to-drive petrol go-kart, an energy-efficient control-system prototype, and on-ground vendor sourcing and pre-production for a consumer hardware startup.
        </p>
        <p>
          As Welfare Secretary at IITGN, held operational and financial responsibility for initiatives serving a <strong>3,600+ student community</strong> — overseeing <strong>₹80L+ budgets</strong>, procurement and vendor evaluations, and teams of up to 104 members across large-scale campus programs.
        </p>
        <p>
          Three years at Axis Bank applying the same first-principles, systems-thinking approach to business-critical infrastructure: architected a <strong>modular PySpark framework adopted across multiple production systems</strong>, <em>cut a key profitability pipeline turnaround by 90% (2–3 days → 3 hours)</em>, and built a unified profitability layer spanning ~6 crore accounts and 30+ products. Led an 18-month automation program across four internal teams and an external engineering team, and sustained the full modelling portfolio solo through a complete team transition with zero delivery disruptions.
        </p>
        <p>
          Seeking to apply systems-thinking, operational execution, and cross-functional leadership to build and scale product-driven businesses.
        </p>
      </div>
      <div class="summary-char" data-no-reveal>
        <!-- Staged: an empty slot the flying character lands on (the canvas
             is the fixed overlay from JourneyCharacter — it projects him
             onto this rect every frame, so CSS transforms drag him along).
             Non-staged (mobile / reduced motion): self-contained fallback. -->
        <div ref="summarySlotRef" class="char-slot">
          <div class="char-shadow" aria-hidden="true"></div>
          <SummaryCharacter v-if="!sumStaged" ref="summaryCharRef" />
        </div>
        <div
          v-if="sumStaged"
          class="summary-actions"
          :class="{ 'is-live': charState.ready && charState.phase === 'summary' }"
          aria-label="Character actions"
        >
          <button type="button" class="sum-act" :disabled="charState.busy || charState.pushing" @click="playCharAction('jump')">
            <span class="sum-act-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
              </svg>
            </span>
            <span class="sum-act-label">Jump</span>
          </button>
          <button type="button" class="sum-act" :disabled="charState.busy || charState.pushing" @click="playCharAction('back_flip')">
            <span class="sum-act-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 1 3.6 7.2" /><path d="M3 22v-6h6" />
              </svg>
            </span>
            <span class="sum-act-label">Flip</span>
          </button>
          <button type="button" class="sum-act" :disabled="charState.busy || charState.pushing" @click="playCharAction('dancing')">
            <span class="sum-act-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </span>
            <span class="sum-act-label">Dance</span>
          </button>
          <button type="button" class="sum-act" :disabled="charState.busy || charState.pushing" @click="playCharAction('push_ups')">
            <span class="sum-act-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 14h2l2-3 3 5 3-7 2 5h4" /><path d="M3 19h18" />
              </svg>
            </span>
            <span class="sum-act-label">Push-ups</span>
          </button>
        </div>
      </div>
      </div>
      </div>
    </section>

    <!-- Education — pinned staged reveal -->
    <section id="education" ref="eduRef" class="section" data-no-reveal>
      <div class="edu-pin">
        <span class="section-num">01 · Education</span>
        <h2 class="section-title">Education</h2>

        <div class="edu-name">
          <p class="edu-name-line"><mark class="iit-mark">Indian Institute of Technology</mark></p>
          <p class="edu-name-line"><mark class="iit-mark">Gandhinagar</mark></p>
          <p class="edu-name-meta"><span class="edu-abbr">IITGN</span><span>July, 2019 — July, 2023 · Gujarat</span></p>
          <p class="entry-sub edu-detail edu-degree" style="--d: 0;">Bachelor of Technology, Mechanical Engineering</p>
          <p class="entry-sub edu-detail edu-gold" style="--d: 1;">
            <strong>Gold Medalist — Outstanding Social Service</strong>
          </p>
        </div>

        <div class="edu-details">
          <div>
            <div class="edu-strip edu-detail" style="--d: 2;">
              <div class="cell"><span class="k">CPI</span><span class="v">8.18 / 10</span></div>
              <div class="cell"><span class="k">Dean's List</span><span class="v">Sem 4 · 2021</span></div>
              <div class="cell"><span class="k">Honour</span><span class="v">Gold Medal '23</span></div>
              <div class="cell"><span class="k">Duration</span><span class="v">4 years</span></div>
            </div>
          </div>

          <div class="edu-visuals edu-detail" style="--d: 3;">
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
      </div>
    </section>

    <!-- Work Experience — pinned company spotlight -->
    <section id="experience" ref="xpRef" class="section" data-no-reveal>
      <div class="xp-pin">
        <div class="xp-head-row">
          <div class="xp-head-titles">
            <span class="section-num">02 · Work Experience</span>
            <h2 class="section-title">Work<br /><span class="accent-line">Experience</span></h2>
          </div>
          <div class="xp-progress" aria-hidden="true">
            <span class="xp-prog-meta">2021 — Present · 03 Employers</span>
            <div class="xp-prog-track">
              <span class="xp-tick"></span>
              <span class="xp-tick"></span>
              <span class="xp-tick"></span>
            </div>
          </div>
        </div>

        <div class="xp-stage">
          <ol class="xp-companies" aria-hidden="true">
            <li class="xp-co">
              <span class="xp-co-num">01 — 2023 · Present</span>
              <p class="xp-co-name"><mark class="co-mark">Axis Bank</mark></p>
            </li>
            <li class="xp-co">
              <span class="xp-co-num">02 — 2022</span>
              <p class="xp-co-name"><mark class="co-mark">SmartoKids</mark></p>
            </li>
            <li class="xp-co">
              <span class="xp-co-num">03 — 2021</span>
              <p class="xp-co-name"><mark class="co-mark">Tata Steel</mark></p>
            </li>
          </ol>

          <div class="xp-panels">
            <article class="xp-panel">
              <span class="xp-index" aria-hidden="true">01</span>
              <p class="xp-panel-co"><mark class="co-mark">Axis Bank</mark></p>
              <header class="xp-head">
                <span class="xp-badge live">Current · Valuation Modelling Team</span>
                <h3 class="xp-role">Operations &amp; Framework Build</h3>
              </header>
              <div class="xp-datelines">
                <div class="row">
                  <span class="who">Senior Manager <em class="promo">Promoted</em></span>
                  <span class="when">May, 2025 — Present</span>
                </div>
                <div class="row">
                  <span class="who">Manager</span>
                  <span class="when">July, 2023 — April, 2025 · Mumbai</span>
                </div>
              </div>
              <p class="xp-summary">Sole accountable owner of 9 quarterly production models. Architected the modular PySpark forecasting framework adopted unmodified by an external TCS engineering team.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">CCPS turnaround</span><span class="v">−90% · 3 hrs</span></div>
                <div class="cell"><span class="k">Models owned</span><span class="v">9 quarterly</span></div>
              </div>
              <div class="slot xp-slot">
                <div class="slot-body">
                  <span class="slot-kind" data-kind="PHOTO">Photo</span>
                  <span class="slot-name">Axis Bank Mumbai HQ · workspace</span>
                  <span class="slot-aspect">wide · environmental shot</span>
                </div>
              </div>
            </article>

            <article class="xp-panel">
              <span class="xp-index" aria-hidden="true">02</span>
              <p class="xp-panel-co"><mark class="co-mark">SmartoKids</mark></p>
              <header class="xp-head">
                <span class="xp-badge">Internship · Product Development</span>
                <h3 class="xp-role">Prototyping &amp; Vendor Sourcing</h3>
              </header>
              <div class="xp-datelines">
                <div class="row">
                  <span class="who">Product Development Intern</span>
                  <span class="when">May, 2022 — July, 2022 · Ahmedabad</span>
                </div>
              </div>
              <p class="xp-summary">Reverse-engineered 10+ competing hardware products, ran rapid prototyping concept-to-build (CAD, laser, MDF, 3D print), and managed on-ground vendor sourcing end-to-end.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">Competitor SKUs</span><span class="v">10+ analysed</span></div>
                <div class="cell"><span class="k">Prototyping</span><span class="v">Concept → build</span></div>
              </div>
              <div class="slot xp-slot">
                <div class="slot-body">
                  <span class="slot-kind" data-kind="PHOTO">Photo</span>
                  <span class="slot-name">Prototype bench — CAD · laser · 3D print</span>
                  <span class="slot-aspect">wide · workshop shot</span>
                </div>
              </div>
            </article>

            <article class="xp-panel">
              <span class="xp-index" aria-hidden="true">03</span>
              <p class="xp-panel-co"><mark class="co-mark">Tata Steel</mark></p>
              <header class="xp-head">
                <span class="xp-badge">Vocational Training · Live Plant</span>
                <h3 class="xp-role">Industrial Systems Exposure</h3>
              </header>
              <div class="xp-datelines">
                <div class="row">
                  <span class="who">Vocational Trainee</span>
                  <span class="when">May, 2021 — July, 2021 · Virtual</span>
                </div>
              </div>
              <p class="xp-summary">Studied bulk-material handling at a live plant — belt-conveyor construction, drive arrangements, power-unit selection — and authored a decision-oriented technical report.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">Focus</span><span class="v">Bulk handling</span></div>
                <div class="cell"><span class="k">Output</span><span class="v">Technical report</span></div>
              </div>
              <div class="slot xp-slot">
                <div class="slot-body">
                  <span class="slot-kind" data-kind="PHOTO">Photo</span>
                  <span class="slot-name">Plant line — belt conveyors</span>
                  <span class="slot-aspect">wide · industrial shot</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- Corporate Projects (5) — modular animated slider -->
    <section id="corporate" class="cs-wrap">
      <div class="stage-head">
        <span class="section-num">03 · Corporate Projects</span>
        <h2 class="section-title">Corporate<br /><span class="accent-line">Projects</span></h2>
        <p class="section-lede">5 programs · Axis Bank &amp; SmartoKids · 2022 – Present</p>
      </div>
      <CorporateSlider />
    </section>

    <!-- Academic Projects (6) — timed-cards showcase -->
    <section id="academic" class="section tc-section">
      <span class="section-num">03.b · Academic Projects</span>
      <h2 class="section-title">Academic<br /><span class="accent-line">Projects</span></h2>
      <p class="section-lede tc-lede">6 projects · IIT Gandhinagar · 2021 – 2022</p>

      <TimedCards />
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
            <li>Represented a <strong>3,600+ student community</strong> on institute decisions spanning food services, laundry, healthcare, commercial establishments, hostels and student affairs — coordinating with administration, external vendors, and a 25-member council as the sole bridge between students and the institute.</li>
            <li>Student representative in <strong>procurement and tender evaluations</strong> for campus mess and laundry contracts — conducted operational due diligence across vendor facilities in Gujarat, Rajasthan and Delhi before contributing to institute-wide provider selection.</li>
            <li><em>Designed a trial-based vendor selection system</em> via the Commercial Establishment &amp; Management Committee — engaged 20+ national chains and regional players, ran live campus trials, and onboarded outlets on demonstrated performance rather than lowest-cost bids.</li>
            <li>Owned planning and governance of student initiatives with cumulative budgets exceeding <strong>₹80+ lakh</strong> as a student signing authority; led Convocation 2022 through a 68-member team and IITGN's 104-member Inter-IIT Cultural Meet contingent end-to-end.</li>
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
          <li>Identified and assessed <strong>20+ vendor operators</strong> across food and service categories through independent on-ground outreach and capability assessments spanning national chains and regional operators.</li>
          <li>Designed and implemented a <em>data-driven vendor evaluation framework</em> — ran multiple 1–2 day campus trials and collected structured community feedback to replace ad-hoc vendor selection with an evidence-based process.</li>
          <li>Onboarded and launched <strong>6 food and service outlets</strong> serving a 3,600+ student community — managing end-to-end negotiations, approvals, scheduling, and operational go-live.</li>
          <li>Hosted an institute-wide ice cream social for <strong>4,500+ students, faculty, staff and service personnel</strong> — from vendor selection and procurement to on-ground execution.</li>
          <li>Led multiple blood donation drives with GCRI and Ahmedabad Civil Hospital — coordinated 400+ registrations via slot-based crowd management, the institute's highest post-pandemic collection.</li>
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
        <span class="h">Hardware &amp; Product Development</span>
        <div class="tags">
          <span class="skill-tag">Design for Manufacturing (DFM)</span>
          <span class="skill-tag">Autodesk Fusion 360</span>
          <span class="skill-tag">Fabrication &amp; Machining</span>
          <span class="skill-tag">AutoCAD</span>
          <span class="skill-tag">Hardware Systems Integration</span>
          <span class="skill-tag">Control-System Design</span>
          <span class="skill-tag">Reverse Engineering &amp; BOM Analysis</span>
          <span class="skill-tag">Hardware Sourcing &amp; Pre-Production</span>
          <span class="skill-tag">MATLAB</span>
          <span class="skill-tag">Arduino</span>
          <span class="skill-tag">LT-Spice</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">Data, Modelling &amp; Automation</span>
        <div class="tags">
          <span class="skill-tag">Model Architecture &amp; Framework Design</span>
          <span class="skill-tag">Process Automation</span>
          <span class="skill-tag">Unit Economics Modelling</span>
          <span class="skill-tag">Account-level P&amp;L</span>
          <span class="skill-tag">Data Reconciliation &amp; Quality</span>
          <span class="skill-tag">SQL</span>
          <span class="skill-tag">PySpark (SparkSQL)</span>
          <span class="skill-tag">Python</span>
          <span class="skill-tag">Jenkins CI/CD</span>
          <span class="skill-tag">BitBucket</span>
          <span class="skill-tag">Jira (Agile)</span>
          <span class="skill-tag">Microsoft Excel</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">Operations &amp; Program Leadership</span>
        <div class="tags">
          <span class="skill-tag">Cross-functional Program Management</span>
          <span class="skill-tag">Operational Ownership</span>
          <span class="skill-tag">Vendor &amp; Partner Management</span>
          <span class="skill-tag">Executive Stakeholder Reporting</span>
          <span class="skill-tag">Process Design &amp; SOPs</span>
          <span class="skill-tag">Procurement &amp; Tender Evaluation</span>
          <span class="skill-tag">Budget &amp; Event Governance</span>
          <span class="skill-tag">Operating Cadence</span>
          <span class="skill-tag">Root Cause Analysis</span>
        </div>
      </div>

      <div class="skill-group">
        <span class="h">AI-Assisted Workflows</span>
        <div class="tags">
          <span class="skill-tag">Prompt Engineering</span>
          <span class="skill-tag">Claude</span>
          <span class="skill-tag">ChatGPT</span>
          <span class="skill-tag">GitHub Copilot</span>
          <span class="skill-tag">Cursor</span>
        </div>
      </div>
    </section>
  </main>

  <footer id="contact" class="footer">
    <div class="footer-grid">
      <h2>Open to <em>product &amp; program operations</em> at hardware-first companies.</h2>
      <div class="links">
        <a href="mailto:golaitadarsh@gmail.com">
          <span class="k">Email</span>
          <span class="v">golaitadarsh@gmail.com</span>
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
   the door/character stage, #summary, .split/.visual-rail, .edu-strip, #skills, .footer,
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
@media (max-width: 720px) {
  /* Six section links wrap to three rows at phone width and eat a third of
     the screen. Hide them — the page is a single scroll on mobile and the
     brand mark stays as the home anchor. (Scoped to the portfolio topbar;
     the standalone hero route keeps its 4-link nav.) */
  .portfolio-topbar .nav { display: none; }
}

/* ════════════════════════════════════════════════════════════
   HERO STACK  — Page-1 on top of Page-2, scroll-driven zoom-out
   ════════════════════════════════════════════════════════════ */
.hs-driver {
  position: relative;
  /* Driver height = stickyH (100svh - topbar) + scroll travel runway
     (hero zoom + door split + dwell segments — see DRIVER_VH in script).
     Subtract topbar so page-2 content sits cleanly under the sticky topbar.
     Fallback matches DRIVER_VH so first paint pre-JS has correct height.
     svh (not vh): on mobile, vh tracks the URL-bar collapse and resizes the
     stage mid-scroll — svh is the stable small-viewport height. Plain-vh
     line kept first as fallback for browsers without svh support. */
  height: calc(var(--hs-driver-vh, 505) * 1vh - var(--topbar-h));
  height: calc(var(--hs-driver-vh, 505) * 1svh - var(--topbar-h));
}
.hs-sticky {
  position: sticky;
  top: var(--topbar-h);
  width: 100%;
  height: calc(100vh - var(--topbar-h));
  height: calc(100svh - var(--topbar-h));
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
  min-height: calc(100svh - var(--topbar-h));
  display: flex;
  flex-direction: column;
}

/* ─── hero ─── */
#hero {
  position: relative;
  height: 100vh;
  height: 100svh;
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
  min-height: 100svh;
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
@media (max-width: 720px) {
  /* Portrait frame on phones — must stay in sync with HERO_SLOT_AR_COMPACT
     in the script, which drives the matching page-1 crop. */
  .im-frame {
    width: min(68vw, 320px);
    aspect-ratio: 3/4;
  }
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
@media (max-width: 720px) {
  /* Centre the signature over the portrait frame — the desktop left/top
     padding bias pushes it off the smaller mobile slot. */
  .im-signature {
    padding-left: 0;
    padding-top: clamp(1.5rem, 6vh, 4rem);
  }
  .im-signature :deep(svg) {
    width: clamp(180px, 55vw, 260px);
  }
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
     z=20 .door-layer       (P2 visual clones; split apart on scroll)
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
.hs-sticky .cr-meta-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.65rem;
}
/* cursor-follow hint — the reason the dwell exists. Accent-coloured and
   gently pulsing so a passing eye catches it before scrolling on. */
.hs-sticky .cr-hint {
  display: flex;
  align-items: center;
  gap: 0.55em;
  font: 600 0.68rem/1.5 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  /* Warm white, not accent: the CTA below is the corner's one accent
     element — the hint informs, the button invites. Dot stays accent. */
  color: rgba(242, 243, 236, 0.78);
  animation: cr-hint-pulse 2.4s ease-in-out infinite;
}
.hs-sticky .cr-hint-dot {
  width: 0.5em;
  height: 0.5em;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 0 var(--accent);
  animation: cr-hint-dot 2.4s ease-in-out infinite;
}
@keyframes cr-hint-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@keyframes cr-hint-dot {
  0%, 100% { transform: scale(0.8); }
  50% { transform: scale(1.15); }
}
/* Breakout CTA — the invitation to send the character down to the summary.
   .cr-overlay is pointer-events:none, so the button re-enables itself. */
.hs-sticky .cr-cta {
  pointer-events: auto;
  appearance: none;
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.6em;
  background: var(--accent);
  color: var(--accent-ink, #10130A);
  font: 700 0.68rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.85em 1.35em;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 0 0 0 rgba(219, 254, 82, 0);
}
.hs-sticky .cr-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(219, 254, 82, 0.35);
}
.hs-sticky .cr-cta:active { transform: translateY(0); }
.hs-sticky .cr-cta-arrow {
  display: inline-block;
  animation: cr-cta-arrow 1.5s ease-in-out infinite;
}
@keyframes cr-cta-arrow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}
@media (prefers-reduced-motion: reduce) {
  .hs-sticky .cr-hint, .hs-sticky .cr-hint-dot, .hs-sticky .cr-cta-arrow { animation: none; }
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

/* ─── summary — pinned character stage ───
   Staged (desktop, motion OK): section grows to 240vh, inner pin holds one
   viewport. --push (0..1, scroll-scrubbed) drives the push-out: the body
   text slides off the left edge while the character follows it, playing
   the pushing clip. Non-staged: plain stacked flow, character below text. */
#summary { --sum-appr: 0; --sum-exit: 0; }
#summary.sum-staged { height: 240vh; padding: 0; }
#summary .summary-pin { min-height: 0; }
#summary.sum-staged .summary-pin {
  position: sticky;
  top: var(--topbar-h, 56px);
  height: calc(100vh - var(--topbar-h, 56px));
  padding: clamp(1.5rem, 4vh, 2.75rem) var(--gutter-x) clamp(1rem, 3vh, 2rem);
  overflow: hidden;
  display: flex;
  align-items: center;
}
#summary .summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: clamp(2rem, 4vw, 4.5rem);
  align-items: center;
  width: 100%;
}
/* minmax(0,1fr), not bare 1fr: a 1fr track's min is auto, so wide children
   blow the track past the viewport on phones. minmax(0,1fr) compresses. */
@media (max-width: 980px) { #summary .summary-grid { grid-template-columns: minmax(0, 1fr); } }
#summary .body p {
  font: 400 clamp(1rem, 1.25vw, 1.14rem)/1.62 var(--f-sans);
  color: var(--ink);
  max-width: 60ch;
  text-wrap: pretty;
  margin-bottom: 1.15rem;
}
#summary .body p strong { color: var(--ink); font-weight: 600; }
#summary .body p em { font-style: normal; background: var(--accent); color: var(--accent-ink); padding: 0 0.16em; }
#summary .summary-char {
  height: min(72vh, 640px);
  min-height: 360px;
  display: flex;
  flex-direction: column;
}
#summary .char-slot {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
#summary.sum-staged .summary-char {
  height: calc(100vh - var(--topbar-h, 56px) - clamp(3rem, 8vh, 5.5rem));
  min-height: 0;
}
/* Grounding shadow under the landed character. --char-lift (0 grounded →
   1 airborne) is written by JourneyCharacter every frame: it thins and
   fades while he's in the air (flight arc, jump clips) and blooms on
   landing. Default 1 = hidden until he has actually arrived. */
#summary .char-shadow {
  position: absolute;
  left: 50%;
  bottom: 3.5%;
  width: 46%;
  height: clamp(10px, 2.6vh, 20px);
  transform: translateX(-50%) scaleX(calc(1 - var(--char-lift, 1) * 0.45));
  background: radial-gradient(ellipse at center, rgba(10, 12, 6, 0.3) 0%, rgba(10, 12, 6, 0) 68%);
  /* Fades with the push-out too, so no shadow smear lingers on the empty
     pin after he has shoved everything off the left edge. */
  opacity: calc((1 - var(--char-lift, 1)) * 0.9 * (1 - var(--sum-exit, 0)));
  pointer-events: none;
}
/* Push-out — contact-locked, scrubbed, no transitions.
   Phase 1 (--sum-appr 0→1): he walks from his slot to the text block.
   Phase 2 (--sum-exit 0→1): character and text travel off the left edge
   TOGETHER at the same speed — a shove, not two things sliding apart.
   The text leans back a touch as it goes, like it took the hit. */
#summary.sum-staged .body {
  transform:
    translate3d(calc(var(--sum-exit, 0) * -68vw), 0, 0)
    rotate(calc(var(--sum-exit, 0) * -1.5deg));
  transform-origin: 100% 65%;
  will-change: transform;
}
/* -68vw clears the text's right edge (~55vw) and the character's own body
   exactly at exit=1 — he stays on screen pushing until the very end
   instead of vanishing halfway through the scrub. */
#summary.sum-staged .summary-char {
  transform: translate3d(calc(var(--sum-appr, 0) * -11vw + var(--sum-exit, 0) * -68vw), 0, 0);
  will-change: transform;
}
/* Action buttons — icon circles with tiny mono labels. Rise in once the
   character has landed; fade as the push-out begins. */
#summary .summary-actions {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  gap: clamp(1rem, 1.8vw, 1.7rem);
  padding-top: clamp(0.7rem, 1.6vh, 1.2rem);
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.45s ease, transform 0.45s ease;
  pointer-events: none;
}
#summary .summary-actions.is-live {
  opacity: calc(1 - var(--sum-appr, 0));
  transform: none;
  pointer-events: auto;
}
.sum-act {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: var(--ink);
}
.sum-act-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  /* A hair darker than --rule: 1px hairlines on white read as decoration,
     not buttons. These must pass the obviously-clickable test at a glance. */
  border: 1px solid rgba(16, 19, 10, 0.28);
  background: #fff;
  display: grid;
  place-items: center;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease,
    transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(16, 19, 10, 0.07);
}
.sum-act-btn svg {
  width: 19px;
  height: 19px;
}
.sum-act-label {
  font: 600 0.58rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  transition: color 0.2s ease;
}
.sum-act:hover:not(:disabled) .sum-act-btn {
  background: var(--ink);
  color: var(--accent);
  border-color: var(--ink);
  transform: translateY(-3px);
}
.sum-act:hover:not(:disabled) .sum-act-label { color: var(--ink); }
.sum-act:active:not(:disabled) .sum-act-btn { transform: translateY(-1px) scale(0.96); }
.sum-act:disabled { cursor: default; opacity: 0.35; }

/* ─── two-column layouts ─── */
.split {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}
.split.flip { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
/* minmax(0,1fr), not bare 1fr: a 1fr track's min is auto, so slot children
   (aspect-ratio × min-height ⇒ wide min-content) blow the track past the
   viewport on phones. Must come AFTER .split.flip to win the cascade. */
@media (max-width: 980px) { .split, .split.flip { grid-template-columns: minmax(0, 1fr); } }
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

/* ─── audit fix (from design review) ───
   section-num was sticky — floated over body text mid-scroll; now static */
.section-num { position: static; }

/* ─── company highlight mark (employer names) ─── */
.co-mark {
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.04em 0.22em 0.08em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

/* ════════════════════════════════════════════════════════════
   EDUCATION — pinned staged reveal
   Section pins for ~1.4 viewports of scroll. Scrubbing back reverses.
   Stage 0 · only the "Education" heading
   Stage 1 · institute name slides in from the left, display-sized
   Stage 2 · degree, records strip, visuals rise in below
   ════════════════════════════════════════════════════════════ */
#education.edu-staged { height: 240vh; padding: 0; min-height: 0; }
#education .edu-pin { display: flex; flex-direction: column; min-height: 0; }
#education.edu-staged .edu-pin {
  position: sticky;
  /* pin BELOW the sticky topbar (not behind it) so the heading keeps
     a comfortable gap from the bar while pinned */
  top: var(--topbar-h, 56px);
  height: calc(100vh - var(--topbar-h, 56px));
  padding: clamp(1.5rem, 4vh, 2.75rem) var(--gutter-x) clamp(1rem, 3.5vh, 2.5rem);
  overflow: hidden;
}

/* the name — display type on accent blocks, the section's centrepiece.
   Sized against BOTH axes so the pinned stack always fits the viewport. */
#education .edu-name { margin: 0 0 clamp(1rem, 3.5vh, 2.5rem); }
#education .edu-name-line {
  font: 900 clamp(1.3rem, min(3.9vw, 5.4vh), 3.8rem)/1.12 var(--f-sans);
  letter-spacing: -0.04em;
  text-transform: uppercase;
  width: max-content;
  max-width: 100%;
}
#education .edu-name-line + .edu-name-line { margin-top: 0.14em; }
#education .edu-name-line .iit-mark {
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.05em 0.2em 0.09em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
#education .edu-name-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: clamp(0.6rem, 2vh, 1.1rem);
  font: 500 0.72rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
#education .edu-abbr {
  background: var(--ink);
  color: var(--accent);
  font: 700 0.72rem/1 var(--f-mono);
  letter-spacing: 0.24em;
  padding: 0.55em 0.5em 0.55em 0.8em;
}
#education .edu-degree {
  font: 700 28px/32.45px var(--f-sans);
  letter-spacing: 0;
  color: #09090B;
  margin-top: clamp(0.9rem, 2.5vh, 1.5rem);
}
#education .edu-gold {
  color: var(--ink);
  font-size: 20px;
}
#education .edu-gold strong { font-weight: 700; font-size: 20px; }

#education .edu-details {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: end;
}
#education .edu-visuals {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 0.75rem;
  align-items: end;
}
#education .edu-visuals .slot { max-height: 26vh; min-height: 0; }
@media (max-width: 980px) {
  #education .edu-details { grid-template-columns: minmax(0, 1fr); }
  #education .edu-visuals { align-items: start; }
}
/* short or cramped viewports: drop the visual slots while pinned so
   every stage fits inside the 100vh pin without clipping */
@media (max-height: 660px), (max-width: 700px) {
  #education.edu-staged .edu-visuals { display: none; }
  #education.edu-staged .edu-details { grid-template-columns: minmax(0, 1fr); }
}

/* stage motion — JS adds .edu-staged only when pinning is active */
@media (prefers-reduced-motion: no-preference) {
  #education.edu-staged .edu-name-line,
  #education.edu-staged .edu-name-meta {
    opacity: 0;
    transform: translateX(-72px);
    transition: opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.75s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform, opacity;
  }
  #education.edu-staged .edu-name-line:nth-child(2) { transition-delay: 0.08s; }
  #education.edu-staged .edu-name-meta { transition-delay: 0.16s; }
  #education.edu-staged.stage-name .edu-name-line,
  #education.edu-staged.stage-name .edu-name-meta {
    opacity: 1;
    transform: none;
  }
  #education.edu-staged .edu-detail {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--d, 0) * 0.1s),
                transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) calc(var(--d, 0) * 0.1s);
  }
  #education.edu-staged.stage-details .edu-detail {
    opacity: 1;
    transform: none;
  }
}

/* ════════════════════════════════════════════════════════════
   WORK EXPERIENCE — pinned company spotlight
   Section pins for ~2.2 viewports. Scroll scrubs through the three
   employers — the active company's name fills with the accent mark
   while its role panel rises in on the right. Reverses on scroll-back.
   Fallback (small screens / reduced motion): stacked entries with
   every company name highlighted.
   ════════════════════════════════════════════════════════════ */
#experience.xp-staged { height: 320vh; padding: 0; min-height: 0; }
#experience .xp-pin {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: clamp(1.25rem, 3vh, 2rem);
}
#experience.xp-staged .xp-pin {
  position: sticky;
  top: var(--topbar-h, 56px);
  height: calc(100vh - var(--topbar-h, 56px));
  padding: clamp(1.5rem, 4vh, 2.75rem) var(--gutter-x) clamp(1rem, 3.5vh, 2.5rem);
  overflow: hidden;
}

/* header row — title left, scrub progress right */
#experience .xp-head-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
}
#experience .xp-progress {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.7rem;
  padding-bottom: 0.5rem;
}
#experience:not(.xp-staged) .xp-progress { display: none; }
#experience .xp-prog-meta {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
#experience .xp-prog-track { display: flex; gap: 6px; }
#experience .xp-tick {
  width: clamp(30px, 3.4vw, 54px);
  height: 4px;
  background: var(--ink-trace);
  transition: background 0.4s ease;
}
#experience[data-xp-active="0"] .xp-tick:nth-child(1) { background: var(--ink); }
#experience[data-xp-active="1"] .xp-tick:nth-child(1) { background: var(--ink-faint); }
#experience[data-xp-active="1"] .xp-tick:nth-child(2) { background: var(--ink); }
#experience[data-xp-active="2"] .xp-tick:nth-child(1),
#experience[data-xp-active="2"] .xp-tick:nth-child(2) { background: var(--ink-faint); }
#experience[data-xp-active="2"] .xp-tick:nth-child(3) { background: var(--ink); }

#experience .xp-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: stretch;
}

/* company roster (left) — timeline rail with node markers */
#experience .xp-companies {
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(1rem, 3.2vh, 2rem);
  margin: 0;
  padding: 0;
}
#experience.xp-staged .xp-companies {
  --xp-railpad: clamp(1.7rem, 2.6vw, 2.6rem);
  position: relative;
  padding-left: var(--xp-railpad);
  align-self: center;
  width: 100%;
}
#experience.xp-staged .xp-companies::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 1px;
  background: var(--rule);
}
#experience.xp-staged .xp-co { position: relative; }
#experience.xp-staged .xp-co::before {
  content: '';
  position: absolute;
  left: calc(-1 * var(--xp-railpad));
  top: 0;
  width: 11px;
  height: 11px;
  background: var(--paper);
  border: 1px solid var(--rule);
  transition: background 0.45s ease, border-color 0.45s ease;
}
#experience.xp-staged .xp-co.is-active::before {
  background: var(--accent);
  border-color: var(--ink);
}
#experience .xp-co-num {
  display: block;
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 0.45rem;
  transition: color 0.45s ease;
}
#experience .xp-co.is-active .xp-co-num { color: var(--ink); }
#experience .xp-co-name {
  font: 900 clamp(1.8rem, min(4.4vw, 6.8vh), 4.6rem)/1.05 var(--f-sans);
  letter-spacing: -0.045em;
  text-transform: uppercase;
  width: max-content;
  max-width: 100%;
}
/* inactive names sit faint; the active employer fills with the mark */
#experience.xp-staged .xp-co .co-mark {
  background: transparent;
  color: var(--ink-faint);
  transition: background 0.5s ease, color 0.5s ease;
}
#experience.xp-staged .xp-co.is-active .co-mark {
  background: var(--accent);
  color: var(--accent-ink);
}

/* role panels (right) — framed spotlight card */
#experience .xp-panels { min-width: 0; }
#experience.xp-staged .xp-panels {
  display: grid;
  align-self: stretch;
  align-items: stretch;
  min-height: 0;
}
#experience .xp-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(0.85rem, 2vh, 1.2rem);
  min-width: 0;
  background: var(--paper-2);
  border: 1px solid var(--rule);
  padding: clamp(1.3rem, 2.4vh, 1.9rem) clamp(1.3rem, 1.8vw, 1.9rem);
}
#experience.xp-staged .xp-panel {
  grid-area: 1 / 1;
  height: 100%;
  min-height: 0;
  opacity: 0;
  transition: opacity 0.45s ease;
  pointer-events: none;
}
#experience.xp-staged .xp-panel.is-active {
  opacity: 1;
  pointer-events: auto;
}
/* content rises in a soft stagger as the panel takes the spotlight */
#experience.xp-staged .xp-panel > * {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}
#experience.xp-staged .xp-panel.is-active > * {
  opacity: 1;
  transform: none;
}
#experience.xp-staged .xp-panel.is-active > *:nth-child(3) { transition-delay: 0.05s; }
#experience.xp-staged .xp-panel.is-active > *:nth-child(4) { transition-delay: 0.1s; }
#experience.xp-staged .xp-panel.is-active > *:nth-child(5) { transition-delay: 0.14s; }
#experience.xp-staged .xp-panel.is-active > *:nth-child(6) { transition-delay: 0.18s; }
#experience.xp-staged .xp-panel.is-active > *:nth-child(7) { transition-delay: 0.22s; }
/* oversized outline index anchoring the card's top-right corner */
#experience .xp-index {
  position: absolute;
  top: clamp(0.9rem, 1.8vh, 1.3rem);
  right: clamp(1.1rem, 1.6vw, 1.6rem);
  font: 900 clamp(2.4rem, 4.6vh, 3.4rem)/1 var(--f-sans);
  letter-spacing: -0.03em;
  color: transparent;
  -webkit-text-stroke: 1.5px var(--ink-trace);
  pointer-events: none;
  user-select: none;
}
/* company name inside the panel — visually replaced by the roster while
   pinned (kept for screen readers); shown as the entry title in fallback */
#experience.xp-staged .xp-panel-co {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
/* panel head — badge + role, one tight cluster */
#experience .xp-head {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-right: clamp(3rem, 5vw, 4.5rem);
}
#experience .xp-badge {
  font: 500 0.64rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
#experience .xp-badge.live { color: var(--ink); }
#experience .xp-badge.live::before {
  content: '';
  display: inline-block;
  width: 7px; height: 7px;
  background: var(--accent);
  margin-right: 0.5rem;
  vertical-align: middle;
}
#experience .xp-role {
  font: 800 clamp(1.2rem, min(1.9vw, 2.8vh), 1.55rem)/1.2 var(--f-sans);
  letter-spacing: -0.02em;
}
/* dateline ledger — role rows with right-aligned dates, ruled top & bottom */
#experience .xp-datelines {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: clamp(0.6rem, 1.6vh, 0.85rem) 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
#experience .xp-datelines .row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.35rem 1.25rem;
}
#experience .xp-datelines .who {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55rem;
  font: 600 0.85rem/1.35 var(--f-sans);
  letter-spacing: -0.005em;
  color: var(--ink);
}
#experience .xp-datelines .when {
  font: 500 0.72rem/1.35 var(--f-mono);
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  white-space: nowrap;
}
#experience .xp-datelines .promo {
  font: 500 0.56rem/1 var(--f-mono);
  font-style: normal;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.22rem 0.4rem;
}
#experience .xp-summary {
  font: 400 clamp(0.92rem, 1.05vw, 1rem)/1.55 var(--f-sans);
  color: var(--ink-soft);
  max-width: 52ch;
  text-wrap: pretty;
}
#experience .xp-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
}
#experience .xp-stats .cell {
  background: var(--paper);
  padding: clamp(0.75rem, 1.8vh, 1.05rem) 1.1rem;
  display: flex; flex-direction: column; gap: 0.45rem;
}
#experience .xp-stats .k {
  font: 500 0.6rem/1.3 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
#experience .xp-stats .v {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font: 800 clamp(1rem, min(1.4vw, 2.4vh), 1.15rem)/1.15 var(--f-sans);
  letter-spacing: -0.015em;
}
#experience .xp-stats .v::before {
  content: '';
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  background: var(--accent);
  outline: 1px solid var(--ink-trace);
}
#experience .xp-slot {
  flex: 1 1 auto;
  min-height: clamp(96px, 14vh, 220px);
  width: 100%;
  aspect-ratio: auto;
  max-height: none;
  padding: 0.75rem;
  background: var(--paper);
}
@media (max-width: 480px) {
  #experience .xp-stats { grid-template-columns: 1fr; }
}

/* pinned-section entrances — headings mirror the shared .rv-left reveal
   every other section gets; the roster slides in as the pin engages */
@media (prefers-reduced-motion: no-preference) {
  #education.edu-staged .section-num,
  #education.edu-staged .section-title,
  #experience.xp-staged .section-num,
  #experience.xp-staged .section-title {
    opacity: 0;
    transform: translateX(-44px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #education.edu-staged .section-title,
  #experience.xp-staged .section-title { transition-delay: 0.08s; }
  #education.edu-staged.head-in .section-num,
  #education.edu-staged.head-in .section-title,
  #experience.xp-staged.head-in .section-num,
  #experience.xp-staged.head-in .section-title {
    opacity: 1;
    transform: none;
  }
  #experience.xp-staged .xp-co {
    opacity: 0;
    transform: translateX(-64px);
    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #experience.xp-staged .xp-co:nth-child(2) { transition-delay: 0.07s; }
  #experience.xp-staged .xp-co:nth-child(3) { transition-delay: 0.14s; }
  #experience.xp-staged.stage-in .xp-co { opacity: 1; transform: none; }
  #experience.xp-staged .xp-progress {
    opacity: 0;
    transform: translateX(28px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.12s,
                transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.12s;
  }
  #experience.xp-staged.head-in .xp-progress { opacity: 1; transform: none; }
  #experience.xp-staged .xp-panels {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.1s,
                transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.1s;
  }
  #experience.xp-staged.stage-in .xp-panels { opacity: 1; transform: none; }
}

/* fallback — no pin: stacked cards, every employer highlighted */
#experience:not(.xp-staged) .xp-stage { display: block; }
#experience:not(.xp-staged) .xp-companies { display: none; }
#experience:not(.xp-staged) .xp-panel + .xp-panel {
  margin-top: clamp(1.1rem, 3vw, 1.6rem);
}
#experience:not(.xp-staged) .xp-panel-co {
  display: block;
  font: 900 clamp(1.5rem, 4vw, 2.6rem)/1.15 var(--f-sans);
  letter-spacing: -0.04em;
  text-transform: uppercase;
  width: max-content;
  max-width: 100%;
  padding-right: clamp(3rem, 5vw, 4.5rem);
}
#experience:not(.xp-staged) .xp-datelines { max-width: 620px; }
#experience:not(.xp-staged) .xp-slot {
  flex: 0 0 auto;
  aspect-ratio: 16 / 9;
  max-height: none;
  min-height: 200px;
  max-width: 620px;
}
#experience:not(.xp-staged) .xp-stats { max-width: 620px; }

/* short viewports while pinned: shed the slot (then summary) so the
   panel always fits inside the 100vh pin without clipping */
@media (max-height: 760px) {
  #experience.xp-staged .xp-slot { display: none; }
}
@media (max-height: 620px) {
  #experience.xp-staged .xp-summary { display: none; }
}

/* ════════════════════════════════════════════════════════════
   CORPORATE (slider host) + ACADEMIC (timed cards host)
   ════════════════════════════════════════════════════════════ */
#corporate.cs-wrap {
  position: relative;
  padding: 0;
  border-top: 1px solid var(--rule);
  background: var(--paper);
}
/* paper header above the dark stage — same rhythm as every other .section
   (top padding, title→lede gap, lede→stage gap) so Corporate and Academic
   headers read identically */
#corporate .stage-head {
  padding: clamp(4rem, 12vh, 8rem) var(--gutter-x) clamp(2rem, 5vh, 3rem);
}
#corporate .stage-head .section-lede {
  font: 500 0.72rem/1.6 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  max-width: none;
  margin-bottom: 0;
}
#academic.tc-section { padding-bottom: 0; }
#academic .tc-lede {
  font: 500 0.72rem/1.6 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  max-width: none;
}

/* skill tags — subtle hover sharpen */
#skills .skill-group .skill-tag { transition: border-color 0.25s ease, color 0.25s ease; }
#skills .skill-group .skill-tag:hover { border-color: var(--ink); color: var(--ink); }

/* ─── scroll-entrance reveal (paired with setupReveal) ───
   .rv is added by JS only — reduced-motion / no-JS renders fully visible. */
@media (prefers-reduced-motion: no-preference) {
  .rv {
    opacity: 0;
    transform: translateY(30px);
    transition:
      opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--rvd, 0s),
      transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--rvd, 0s);
  }
  .rv.rv-left  { transform: translateX(-44px); }
  .rv.rv-right { transform: translateX(44px); }
  .rv.rv-pop   { transform: translateY(16px); }
  .rv.rv-fade  { transform: none; }
  .rv.rv-in    { opacity: 1; transform: none; }
}
@media print {
  .rv { opacity: 1 !important; transform: none !important; }
}
</style>
