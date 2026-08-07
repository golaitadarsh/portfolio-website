<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import HeroSection from '../HeroSection.vue'
import BeamsBackground from '../components/BeamsBackground.vue'
import CorporateSlider from '../components/portfolio/CorporateSlider.vue'
import MedalScrub from '../components/portfolio/MedalScrub.vue'
import PorPhotoWall from '../components/portfolio/PorPhotoWall.vue'
import type { WallPhoto } from '../components/portfolio/PorPhotoWall.vue'
import TimedCards from '../components/portfolio/TimedCards.vue'
import { useMobileNav } from '../composables/useMobileNav'
import signatureSvgRaw from '../../assets/signature.svg?raw'

// Phone-width nav sheet. Same <nav> markup as the desktop row — the scroll-spy
// observer and the pin-landing click handler both bind to `.portfolio-topbar
// .nav a[data-section]`, so collapsing it into a sheet changes nothing for them.
const { open: navOpen, toggle: toggleNav, close: closeNav } = useMobileNav()

import porConvocationImg from '../../assets/por/01-convocation-2022.jpg'
import porTenderVisitImg from '../../assets/por/03-tender-visit-mess.jpg'
import porAmritMahotsavImg from '../../assets/por/10-azadi-amrit-mahotsav.jpg'
import porOutletLaunchImg from '../../assets/por/04-bringing-food-vendors.jpg'
import porGarbaNightImg from '../../assets/por/11-campus-events-garba.jpg'
import porSmartLaundryImg from '../../assets/por/06-smart-laundry.jpg'
import porTreePlantationImg from '../../assets/por/14-tree-plantation-drive.jpg'
import porPromNightImg from '../../assets/por/12-organised-prom.jpg'
import porRunYourCafeImg from '../../assets/por/13-run-your-own-cafe.jpg'

// PoR photo wall — 3×3 flip grid on the flagship council entry.
const POR_WALL_PHOTOS: WallPhoto[] = [
  { src: porConvocationImg, cap: 'Convocation 2022' },
  { src: porTenderVisitImg, cap: 'Mess Tender Visit' },
  { src: porAmritMahotsavImg, cap: 'Amrit Mahotsav' },
  { src: porOutletLaunchImg, cap: 'Outlet Launch' },
  { src: porGarbaNightImg, cap: 'Garba Night' },
  { src: porSmartLaundryImg, cap: 'Smart Laundry' },
  { src: porTreePlantationImg, cap: 'Tree Plantation Drive' },
  { src: porPromNightImg, cap: 'Prom Night' },
  { src: porRunYourCafeImg, cap: 'Run Your Own Café' },
]

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
const SummaryCharacter = defineAsyncComponent(() => import('../character/SummaryCharacter.vue'))
const FluidCursor = defineAsyncComponent(() => import('../components/fluid-cursor/FluidCursor.vue'))

const characterVisible = ref(false)

// The fluid trail belongs to the hero plate (the dot-field reveal), not to the
// whole page. It fades out with the hero overlay text and is fully gone before
// the signature pen-draw begins at hero progress 0.42 — see applyHeroTransform.
const FLUID_CURSOR_OFF_AT = 0.30
const fluidCursorActive = ref(true)

// …and only where there is a cursor. The sim also listens to touchmove, so on
// a phone every scroll swipe splats dye and drags a colour smear up the page —
// a cursor trail with no cursor, painting during the one gesture you make most.
// Gating the mount (not just `active`) also keeps its chunk and its second
// WebGL context off touch devices entirely.
const pointerFine = ref(false)
const finePointerMq = typeof window !== 'undefined'
  ? window.matchMedia('(hover: hover) and (pointer: fine)')
  : null
const onFinePointer = (e: MediaQueryList | MediaQueryListEvent) => { pointerFine.value = e.matches }
if (finePointerMq) onFinePointer(finePointerMq)

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
  hero: null,
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
  // Landing progress for the sticky-level résumé CTA: it fades in near the
  // end of the hero zoom and is inert to the door phase (t holds at 1).
  const driverEl = heroDriverRef.value
  driverEl?.style.setProperty('--hs-hero-t', t.toFixed(3))
  driverEl?.style.setProperty('--hs-resume-pe', t > 0.8 ? 'auto' : 'none')

  // Same window as the hero overlay text: the trail reads as part of page 1,
  // so it leaves when page 1 stops being the page you're on.
  fluidCursorActive.value = t < FLUID_CURSOR_OFF_AT

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
  // Rect READ happens in the scroll event, class WRITE in the rAF — reading
  // after another section's rAF has written styles forces a synchronous
  // layout, and with four scroll-driven sections that thrash repeats every
  // scrolled frame.
  let headIn = false, stageName = false, stageDetails = false

  function readScroll() {
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    headIn = rect.top < innerHeight * 0.92
    stageName = p >= 0.14
    stageDetails = p >= 0.48
  }
  function write() {
    raf = 0
    if (!sec!.classList.contains('edu-staged')) return
    sec!.classList.toggle('head-in', headIn)
    sec!.classList.toggle('stage-name', stageName)
    sec!.classList.toggle('stage-details', stageDetails)
  }
  function onScroll() {
    readScroll()
    if (!raf) raf = requestAnimationFrame(write)
  }

  function apply() {
    const on = !mqMotion.matches
    sec!.classList.toggle('edu-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      onScroll()
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
  // Same read/write split as the other pinned sections — rect read in the
  // scroll event, class writes in the rAF.
  let headIn = false, stageIn = false, active = 0

  function readScroll() {
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    headIn = rect.top < innerHeight * 0.92
    stageIn = rect.top < innerHeight * 0.55
    active = p < 0.38 ? 0 : p < 0.72 ? 1 : 2
  }
  function write() {
    raf = 0
    if (!sec!.classList.contains('xp-staged')) return
    sec!.classList.toggle('head-in', headIn)
    sec!.classList.toggle('stage-in', stageIn)
    setActive(active)
  }
  function onScroll() {
    readScroll()
    if (!raf) raf = requestAnimationFrame(write)
  }

  function apply() {
    const on = !mqMotion.matches && innerWidth > 880 && innerHeight > 620
    sec!.classList.toggle('xp-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      onScroll()
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

// Achievements: section is 280vh tall; content pins while the scroll
// scrubs the medal presentation to its end (MedalScrub reads the same
// section rect via [data-medal-driver]). A beam runs down the list and
// lights each recognition row in sync; a gold aura swells behind the
// medal while it is presented. Small screens / reduced motion fall back
// to the normal in-flow section with every row lit.
const awRef = ref<HTMLElement | null>(null)

function setupAwardsPin(): (() => void) | null {
  const sec = awRef.value
  if (!sec) return null
  const rows = Array.from(sec.querySelectorAll<HTMLElement>('.aw-bullets > li'))
  const mqMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0

  // First row lights at LIT_T0, the rest follow evenly — the last one
  // lands just before the medal is boxed back up (frames end at p=0.92).
  const LIT_T0 = 0.1
  const LIT_STEP = rows.length > 1 ? 0.72 / (rows.length - 1) : 1

  // Same read/write split as the other pinned sections — rect read in the
  // scroll event, class/var writes in the rAF.
  let headIn = false, p = 0

  function readScroll() {
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    headIn = rect.top < innerHeight * 0.92
  }
  function write() {
    raf = 0
    if (!sec!.classList.contains('aw-staged')) return
    sec!.classList.toggle('head-in', headIn)
    sec!.style.setProperty('--awp', p.toFixed(4))
    // gold aura behind the medal — swells to its peak mid-presentation,
    // fades out as the box closes
    const glow = Math.sin(Math.min(1, p / 0.92) * Math.PI)
    sec!.style.setProperty('--aw-glow', glow.toFixed(3))
    rows.forEach((li, i) => {
      li.classList.toggle('is-lit', p >= LIT_T0 + i * LIT_STEP)
    })
  }
  function onScroll() {
    readScroll()
    if (!raf) raf = requestAnimationFrame(write)
  }

  function apply() {
    const on = !mqMotion.matches && innerWidth > 980 && innerHeight > 620
    sec!.classList.toggle('aw-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      onScroll()
    } else {
      removeEventListener('scroll', onScroll)
      sec!.classList.remove('head-in')
      sec!.style.removeProperty('--awp')
      sec!.style.removeProperty('--aw-glow')
      rows.forEach((li) => li.classList.add('is-lit'))
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

// Summary: self-contained interactive character (own canvas, own scene —
// completely separate from the hero stage character). He jumps in when the
// section scrolls into view, takes icon-button action requests while
// pinned, and during the final pin segment scrubs a contact-locked
// push-out — he walks INTO the text block, struggles against it for a beat
// (pushing visibly before anything moves), then shoves the text off the
// left edge while HOLDING his ground — only the text leaves the stage; he
// stays put, relaxing back to idle once it has fully cleared.
// The whole push-out is scroll-SCRUBBED with a short damping tail: scroll
// position sets the choreography target (and the pushing clip's playhead,
// via setPushTravel), and the displayed timeline eases toward it over
// ~160ms — so a wheel flick reads as a quick glide instead of a teleport,
// while a slow scroll still tracks essentially 1:1, retrace plays it
// backwards, and everything settles exactly where the scroll sits.
const summaryRef = ref<HTMLElement | null>(null)
const summaryCharRef = ref<any>(null)
const sumStaged = ref(false)
// Gates the SummaryCharacter mount — flipped by an IntersectionObserver when
// the user is within ~two viewports of the section, so the 4MB rig never
// competes with the hero's first-paint assets.
const summaryNear = ref(false)

// Set by setupSummaryStage — lets late-arriving facts (web fonts, the rig's
// own geometry) re-run the push measurement instead of living with whatever
// was true at setup time.
let remeasureSummary: (() => void) | null = null

// Live character state, emitted by SummaryCharacter — drives button states.
const charState = reactive({ ready: false, busy: false, pushing: false })
function onCharState(s: { ready: boolean; busy: boolean; pushing: boolean }) {
  charState.ready = s.ready
  charState.busy = s.busy
  charState.pushing = s.pushing
}
// The rig has measured its own reach — swap the fallback constants out for
// the real numbers and re-place him against the text.
function onCharMetrics() {
  remeasureSummary?.()
}
function playCharAction(name: string) {
  summaryCharRef.value?.playAction?.(name)
}

// Push-out levers. The runway lives inside the pin's progress p (0..1):
// nothing moves before `start`, everything is done and settled by `end` so
// the pin never releases mid-motion.
const PUSH = {
  start: 0.11,     // pin progress where the push runway begins. Tuned as a
                   // PAIR with the section's 600vh height: start*pinRange is
                   // the absolute dead scroll before he moves (~500px — same
                   // as the old 240vh stage), while the taller pin stretches
                   // the runway itself, so the whole animation plays ~5×
                   // slower per scroll px without adding dead time up front.
  end: 0.945,      // pin progress where the exit is fully complete (settle buffer)
  contact: 0.164,  // MANUAL LEVER — share of the runway spent walking in.
                   // Re-paired with the 600vh height so the walk-in keeps the
                   // same absolute scroll (~615px) it had at 510vh/0.21.
  slide: 0.36,     // MANUAL LEVER — share of the runway where the text starts
                   // to move. The gap [contact, slide) is the STRUGGLE phase:
                   // he's at the text, visibly pushing (the clip strides), but
                   // nothing budges yet — so the viewer reads the push before
                   // the slide answers it. Scrubbed like everything else.
                   // Re-paired with the 600vh height to keep the struggle at
                   // ~730px. The height went 510→600vh because exitPx grew
                   // (the character must now clear the viewport too, not just
                   // the text — ~1215px vs ~795px of travel); the taller pin
                   // gives the exit leg ~2400px of scroll so the text slide
                   // KEEPS the same px-per-scroll speed as before.
  strugSecs: 1.96, // seconds of pushing clip fed during the struggle so his
                   // legs drive against the ground while he holds position.
                   // In CLIP time, not px: px would mean a different number of
                   // strides per display, which is the bug this whole block
                   // was rewritten to kill. 1.96s is the old 1020px at the old
                   // 520px/sec cadence, so the struggle reads as it always did.
  clearPad: 48,    // extra px past the left edge so nothing peeks back in
  // Contact overlap — how far PAST the bare hand-meets-ink point he walks, as
  // a fraction of the canvas HEIGHT (same frame of reference as reach/extent,
  // so the closeness reads identically on every display). Zero looks like he
  // is reaching at the text from arm's length; a small positive value plants
  // the hand ON it. Kept well under reachFrac so the hand never crosses into
  // the glyphs.
  contactFrac: 0.035,
  // ── fallbacks, used only until the rig reports its own geometry (and
  //    forever if WebGL is unavailable, in which case nothing renders in the
  //    slot anyway). Both are fractions of the CANVAS HEIGHT — see
  //    SummaryCharacter's PushMetrics for why height is the only frame of
  //    reference that survives a change of display.
  reachFrac: 0.54,  // lead hand, left of canvas centre  (rig-measured 0.535)
  extentFrac: 0.30, // trailing heel, right of centre    (rig-measured 0.302)
}

function setupSummaryStage(): (() => void) | null {
  const sec = summaryRef.value
  if (!sec) return null
  const body = sec.querySelector<HTMLElement>('.summary-grid .body')
  const slot = sec.querySelector<HTMLElement>('.char-slot')
  const pin = sec.querySelector<HTMLElement>('.summary-pin')
  if (!body || !slot || !pin) return null
  const mqMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let raf = 0
  let pushOn = false

  // ONE runway scalar: `sTarget` is a PURE function of scroll position;
  // the displayed `s` chases it with a ~160ms exponential tail. Wheel and
  // smooth-scroll inputs move the scroll in discrete jumps, and a raw scrub
  // turns each jump into a teleport of the whole choreography — the tail
  // stretches those jumps into a brief glide while keeping every guarantee
  // that matters: slow scroll tracks essentially 1:1, scroll back plays in
  // reverse, and `s` converges onto (then snaps to) exactly where the
  // scroll sits, so nothing free-runs once input stops.
  let s = 0
  let sTarget = 0
  let lastT = 0
  const SCRUB_TAU = 160 // ms — bigger = softer/laggier, smaller = snappier
  // Travel distances in px, measured from the real layout + the real rig.
  let apprPx = 0, exitPx = 0, strugPx = 0

  function choreo(v: number) {
    // Contact-locked choreography in three scrubbed phases: eased walk-in
    // (a stride, not a glide), a struggle at the text (pushing with nothing
    // moving yet), then the shove — text and character slide off TOGETHER,
    // his hands stay on it the whole way. `strug` never touches position —
    // it only feeds clip travel; `exit` moves both columns in lockstep.
    const appr = smoothstep(0, 1, Math.min(1, v / PUSH.contact))
    const strug = Math.min(1, Math.max(0, (v - PUSH.contact) / (PUSH.slide - PUSH.contact)))
    const exit = Math.max(0, (v - PUSH.slide) / (1 - PUSH.slide))
    return { appr, strug, exit }
  }

  function publish() {
    const { appr, exit } = choreo(s)
    sec!.style.setProperty('--sum-appr', appr.toFixed(4))
    sec!.style.setProperty('--sum-exit', exit.toFixed(4))
    sec!.style.setProperty('--sum-body-x', `${(-exit * exitPx).toFixed(1)}px`)
    // Character position: walk-in, then the exit term IN LOCKSTEP with the
    // text (same exitPx) — his hands stay planted on the block while he
    // shoves it off. Set dressing counter-translates against the walk-in
    // only, so it needs the walk term published separately.
    sec!.style.setProperty('--sum-walk-x', `${(-(appr * apprPx)).toFixed(1)}px`)
    sec!.style.setProperty('--sum-char-x', `${(-(appr * apprPx + exit * exitPx)).toFixed(1)}px`)
  }

  // Right edge of the rendered INK, not of the grid track.
  //
  // This one line is why the push looked right on an external monitor and
  // drove his hand through the text on a laptop. `.body` is a `fr` track, so
  // its width follows the viewport; the paragraphs inside are capped at
  // `max-width: 58ch` and their font-size clamp tops out at 1.14rem around
  // 1546px — past that the track keeps growing and the text does not.
  // Measured dead band between the last glyph and the track edge: 56px at
  // 1440x900, 267px at 1920x1080, 612px at 2560x1310. Walking to the track
  // edge meant the wide screen had a cushion to absorb his reach and the
  // laptop had none.
  function textRightEdge(): number {
    let right = -Infinity
    const walk = document.createTreeWalker(body!, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue
      range.selectNodeContents(n)
      const rects = range.getClientRects()
      for (let i = 0; i < rects.length; i++) {
        // Ragged right: every line box is its own rect, so this lands on the
        // longest line rather than on the paragraph's nominal width.
        if (rects[i].width > 0 && rects[i].right > right) right = rects[i].right
      }
    }
    return right === -Infinity ? body!.getBoundingClientRect().right : right
  }

  function measure() {
    // Rects include the live transforms — subtract what we applied to
    // recover layout positions, so mid-push resizes re-measure correctly.
    const { appr, exit } = choreo(s)
    const bodyX = -exit * exitPx
    const charX = -(appr * apprPx + exit * exitPx)

    // The character's rendered size is a fixed multiple of his canvas HEIGHT
    // (the camera frames him by height), so his column has to be height-driven
    // too. As a width-driven `0.92fr` track it was 69px narrower than his
    // outstretched arm on 1440x900 — the canvas clipped the pushing hand — and
    // ~600px wider than he needs on a 2560 monitor, stranding him mid-stage.
    // Written before the reads below so the reflow is already settled.
    const m = summaryCharRef.value?.getPushMetrics?.() ?? null
    const reachR = m?.reachRatio ?? PUSH.reachFrac
    const extentR = m?.extentRatio ?? PUSH.extentFrac
    const slotH = slot!.getBoundingClientRect().height
    sec!.style.setProperty(
      '--sum-char-col',
      `${Math.round(2 * Math.max(reachR, extentR) * slotH)}px`
    )

    // Fit the copy to the pin, by measurement. The type used to step down on
    // `@media (max-height: 840px)` — a proxy that knows nothing about how WIDE
    // the text column ended up, which is what actually decides how tall the
    // copy wraps. Result: the last paragraph fell out of the pin's
    // overflow:hidden box at 1440x900, and 1371x796 / 1512x860 / 1920x1080 all
    // sat within 1px of doing the same. Three passes because scaling the type
    // re-wraps it, so line count (and therefore height) moves in steps.
    const pinCS = getComputedStyle(pin!)
    const availH =
      pin!.clientHeight - parseFloat(pinCS.paddingTop) - parseFloat(pinCS.paddingBottom)
    let fit = 1
    sec!.style.setProperty('--sum-fit', '1')
    for (let i = 0; i < 3 && availH > 0; i++) {
      const need = body!.scrollHeight
      if (need <= availH) break
      // 0.7 floor: past that the copy is unreadable and clipping is the lesser
      // evil — but nothing we can render on a staged desktop gets near it.
      fit = Math.max(0.7, (fit * availH * 0.995) / need)
      sec!.style.setProperty('--sum-fit', fit.toFixed(4))
    }

    const slotR = slot!.getBoundingClientRect()
    // The canvas fills the slot exactly (its sibling action row is display:none
    // while staged), and the camera centres him in it — so the slot's centre
    // IS his body centre, and its height IS the canvas height.
    const charCenter = (slotR.left + slotR.right) / 2 - charX
    const reach = reachR * slotR.height
    const extent = extentR * slotR.height
    const textRight = textRightEdge() - bodyX

    // Walk-in ends with his lead hand at the text's right edge; the shove then
    // carries text AND character together (same exitPx) far enough that BOTH
    // fully clear the viewport's left edge at exit = 1 — he pushes the text off
    // and follows it out before the pin releases.
    apprPx = Math.max(0, charCenter - reach - textRight + PUSH.contactFrac * slotR.height)
    // His trailing heel is the rightmost ink in the character column at the
    // contact position; that, not the empty track edge, is what has to clear.
    const charRightAtContact = charCenter - apprPx + extent
    exitPx = Math.max(textRight, charRightAtContact) + PUSH.clearPad
    // Clip travel during the struggle, in the same px the scrub speaks — the
    // rig reports how many px map to one second of its timeline, so the number
    // of strides is identical on every display.
    strugPx = PUSH.strugSecs * (m?.pxPerClipSec ?? slotR.height * 0.62)
  }

  // Layout READ — runs in the scroll event (before this frame's rAF writes)
  // so the rect never forces a layout against freshly written styles.
  function readScroll() {
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0
    sTarget = Math.min(1, Math.max(0, (p - PUSH.start) / (PUSH.end - PUSH.start)))
  }

  // Clip travel (px, positive) along the runway at scalar v. SummaryCharacter
  // scrubs the pushing clip's playhead from it, so stride and columns share
  // one timeline. The `appr` and `exit` terms move his position (--sum-char-x);
  // only the struggle is treadmill.
  function travelOf(v: number) {
    // The struggle term is travel the CLIP sees but the columns don't —
    // strides against a text block that hasn't budged yet. The exit term is
    // REAL travel: he slides with the text at the same exitPx, so the clip
    // playhead matches his actual ground displacement — no skating.
    const { appr, strug, exit } = choreo(v)
    return appr * apprPx + strug * strugPx + exit * exitPx
  }

  // Style WRITE — CSS-var publish + character scrub, no layout reads.
  // Eases `s` toward `sTarget` (frame-rate independent) and keeps its own
  // rAF alive ONLY until it converges — it snaps at an epsilon and the loop
  // goes back to sleep, so nothing runs once the scrub has settled.
  function tick(now: number) {
    raf = 0
    if (!sumStaged.value) return
    const dt = lastT ? Math.min(100, now - lastT) : 16.7
    lastT = now
    s += (sTarget - s) * (1 - Math.exp(-dt / SCRUB_TAU))
    if (Math.abs(sTarget - s) < 0.001) s = sTarget
    publish()
    // Pushing pose spans the whole runway EXCEPT the settled end: once the
    // text has fully cleared (s snaps to 1) he relaxes back to idle instead
    // of holding a frozen mid-stride pose; any retrace re-engages the clip.
    const wantPush = s > 0.005 && s < 0.999
    if (wantPush !== pushOn) {
      pushOn = wantPush
      summaryCharRef.value?.setPushing?.(pushOn)
    }
    // Absolute travel px, not a velocity — the clip's playhead is a pure
    // function of it, so the stride is frame-locked to the columns.
    summaryCharRef.value?.setPushTravel?.(travelOf(s))
    if (s !== sTarget) raf = requestAnimationFrame(tick)
    else lastT = 0
  }
  function onScroll() {
    readScroll()
    if (!raf) raf = requestAnimationFrame(tick)
  }

  // Entrance: fire his jump-in once the section scrolls into view. Trigger
  // is viewport-based (top crosses 65% of the viewport), not a ratio
  // threshold — the section is several viewports tall, so its max
  // intersection ratio is well under any useful threshold value.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      if (!mqMotion.matches) summaryCharRef.value?.enter?.()
      io.disconnect()
    }
  }, { rootMargin: '0px 0px -35% 0px' })
  io.observe(sec)

  // Mount the (heavy) summary character only when the user is within ~two
  // viewports of the section — keeps the 4MB rig + its parse/skin work out
  // of the initial page load entirely.
  const nearIo = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      summaryNear.value = true
      nearIo.disconnect()
    }
  }, { rootMargin: '200% 0px 200% 0px' })
  nearIo.observe(sec)

  function apply() {
    const on = !mqMotion.matches && innerWidth > 980 && innerHeight > 560
    sumStaged.value = on
    sec!.classList.toggle('sum-staged', on)
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      measure()
      readScroll()
      // Snap, don't glide: on (re)enable — first load mid-section, resize —
      // the stage must sit exactly where the scroll is, not fast-forward
      // the choreography to get there.
      s = sTarget
      onScroll()
    } else {
      removeEventListener('scroll', onScroll)
      s = 0
      sTarget = 0
      lastT = 0
      publish()
      if (pushOn) {
        pushOn = false
        summaryCharRef.value?.setPushing?.(false)
      }
      summaryCharRef.value?.setPushTravel?.(0)
    }
  }
  // Anything that changes the layout or the rig's reported geometry after
  // setup re-runs the measurement through here.
  const remeasure = () => {
    if (!sumStaged.value) return
    measure()
    onScroll()
  }
  remeasureSummary = remeasure

  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', apply, { passive: true })
  apply()
  // Web-font swap reflows the text column — re-measure once fonts settle.
  document.fonts?.ready?.then(remeasure)
  return () => {
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('resize', apply)
    removeEventListener('scroll', onScroll)
    io.disconnect()
    nearIo.disconnect()
    if (remeasureSummary === remeasure) remeasureSummary = null
    if (raf) cancelAnimationFrame(raf)
  }
}

// ────────────────────────────────────────────────────────────────────
// PoR "Rail" treatment (design handoff) — a vertical progress rail whose
// fill tracks a playhead at 72% of viewport height. Entries ignite, bullet
// node-dots pop, and .cnt numbers count up as the fill passes them; all
// reversible on scroll-up. The rAF loop only runs while the rail is near
// the viewport. Extra-Curricular year clusters reveal via the same IO.
// ────────────────────────────────────────────────────────────────────
const porSecRef = ref<HTMLElement | null>(null)
const extraSecRef = ref<HTMLElement | null>(null)
const porRailWrapRef = ref<HTMLElement | null>(null)
const porRailTipRef = ref<HTMLElement | null>(null)

function setupPorRail(): (() => void) | null {
  const porSec = porSecRef.value
  const extraSec = extraSecRef.value
  const wrap = porRailWrapRef.value
  const tip = porRailTipRef.value
  if (!porSec || !extraSec || !wrap || !tip) return null

  const motionOK = matchMedia('(prefers-reduced-motion: no-preference)').matches
  let alive = true
  let raf: number | null = null

  // Hidden pre-animation states are gated behind .anim so reduced-motion
  // (and print) render fully visible and static.
  if (motionOK) {
    porSec.classList.add('anim')
    extraSec.classList.add('anim')
  }

  /* count-up: parses prefix / number / suffix from the text
     (₹80+ lakh, 3,600+, 58K all work); restores exact original at end */
  function runCounters(scope: HTMLElement) {
    scope.querySelectorAll<HTMLElement>('.cnt').forEach((el) => {
      if (el.dataset.done) return
      el.dataset.done = '1'
      const orig = el.dataset.orig || (el.dataset.orig = el.textContent || '')
      if (!motionOK) {
        el.textContent = orig
        return
      }
      const m = orig.match(/^([^0-9]*)([\d,]+)(.*)$/s)
      if (!m) return
      const target = parseInt(m[2].replace(/,/g, ''), 10)
      const commas = m[2].includes(',')
      const t0 = performance.now()
      const dur = 850
      const tick = (t: number) => {
        if (!alive) return
        const p = Math.min(1, (t - t0) / dur)
        const e = 1 - Math.pow(1 - p, 3)
        if (p < 1) {
          const n = Math.round(target * e)
          el.textContent = m[1] + (commas ? n.toLocaleString('en-US') : String(n)) + m[3]
          requestAnimationFrame(tick)
        } else {
          el.textContent = orig
        }
      }
      requestAnimationFrame(tick)
    })
  }

  /* rewind counters so they replay on next reveal */
  function resetCounters(scope: HTMLElement) {
    scope.querySelectorAll<HTMLElement>('.cnt').forEach((el) => {
      delete el.dataset.done
      if (el.dataset.orig) el.textContent = el.dataset.orig
    })
  }

  /* section titles + year clusters reveal; rewind when they exit below */
  const revealIO = new IntersectionObserver(
    (es) => {
      es.forEach((en) => {
        if (en.isIntersecting) en.target.classList.add('on')
        else if (en.boundingClientRect.top > 0) en.target.classList.remove('on')
      })
    },
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  )
  ;[porSec, extraSec].forEach((sec) => {
    sec.querySelectorAll('.section-num, .section-title, .yr-group').forEach((el) => revealIO.observe(el))
  })

  /* scroll-scrubbed rail: fill tracks a playhead at 72% viewport height */
  const entries = Array.from(wrap.querySelectorAll<HTMLElement>('.entry'))
  const lis = Array.from(wrap.querySelectorAll<HTMLElement>('.bullets > li'))

  const frame = () => {
    const r = wrap.getBoundingClientRect()
    const t = motionOK
      ? Math.max(0, Math.min(r.height, window.innerHeight * 0.72 - r.top))
      : r.height
    tip.style.height = `${t}px`

    entries.forEach((e) => {
      e.classList.toggle('on', t >= e.getBoundingClientRect().top - r.top + 8)
    })
    lis.forEach((li) => {
      const nd = li.querySelector('.nd')
      const y = li.getBoundingClientRect().top - r.top + 12
      if (t >= y) {
        if (!li.classList.contains('on')) {
          li.classList.add('on')
          runCounters(li)
        }
        nd?.classList.add('lit')
      } else {
        if (li.classList.contains('on')) {
          li.classList.remove('on')
          resetCounters(li)
        }
        nd?.classList.remove('lit')
      }
    })
  }
  const loop = () => {
    frame()
    raf = requestAnimationFrame(loop)
  }

  /* run the rAF loop only while the rail is near the viewport */
  const railIO = new IntersectionObserver(
    (es) => {
      const en = es[es.length - 1]
      if (en.isIntersecting) {
        if (raf == null) raf = requestAnimationFrame(loop)
      } else {
        if (raf != null) {
          cancelAnimationFrame(raf)
          raf = null
        }
        frame() /* settle state once when leaving */
      }
    },
    { rootMargin: '30% 0px 45% 0px' },
  )
  railIO.observe(wrap)

  return () => {
    alive = false
    if (raf != null) cancelAnimationFrame(raf)
    raf = null
    revealIO.disconnect()
    railIO.disconnect()
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
  // Input can change under a live page (iPad gaining a trackpad, a laptop
  // folding into tablet mode) — follow it so the trail appears/disappears
  // with the cursor rather than only on reload.
  finePointerMq?.addEventListener?.('change', onFinePointer)
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

  // Nav → pinned-section landing. A plain anchor lands at the pin's START,
  // where the staged reveal is still blank (header only) — the viewer has to
  // scroll another full viewport before any content appears, so the jump
  // reads as broken. Land inside the pin instead, at the first progress
  // where the stage is fully readable. Non-staged fallbacks (mobile nav is
  // hidden anyway, reduced motion) keep the native anchor behavior.
  const NAV_PIN_LANDING: Record<string, { cls: string; p: number }> = {
    education:  { cls: 'edu-staged', p: 0.52 },
    experience: { cls: 'xp-staged',  p: 0.16 },
    awards:     { cls: 'aw-staged',  p: 0.22 },
  }
  const onNavClick = (e: Event) => {
    const a = e.currentTarget as HTMLAnchorElement
    const id = a.hash ? a.hash.slice(1) : ''
    const conf = NAV_PIN_LANDING[id]
    if (!conf) return
    const sec = document.getElementById(id)
    if (!sec || !sec.classList.contains(conf.cls)) return
    e.preventDefault()
    const extra = Math.max(0, sec.offsetHeight - window.innerHeight) * conf.p
    const top = sec.getBoundingClientRect().top + window.scrollY + extra
    history.replaceState(history.state, '', `#${id}`)
    window.scrollTo({ top, behavior: 'smooth' })
  }
  navLinks.forEach((a) => a.addEventListener('click', onNavClick))
  sectionCleanups.push(() => {
    navLinks.forEach((a) => a.removeEventListener('click', onNavClick))
  })

  // "Return to hero" / brand → top of document.
  //
  // #hero is the Page-1 layer INSIDE .hs-sticky — `position: absolute` in a
  // sticky box — so its document offset is wherever the sticky element is
  // parked at that moment, which while the stage is pinned is the current
  // scroll position. A native anchor jump therefore resolves to "here" and
  // the link does nothing. The hero IS the top of the page, so scroll there
  // explicitly. Covers the footer link, the topbar brand and any nav link
  // pointing at #hero.
  const heroLinks = document.querySelectorAll<HTMLAnchorElement>('a[href="#hero"]')
  const onHeroLink = (e: Event) => {
    e.preventDefault()
    history.replaceState(history.state, '', '#hero')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  heroLinks.forEach((a) => a.addEventListener('click', onHeroLink))
  sectionCleanups.push(() => {
    heroLinks.forEach((a) => a.removeEventListener('click', onHeroLink))
  })

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
  // Isolated per-section: one failing stage must not take down the scroll
  // engines mounted after it (they gate hidden pre-states behind .anim).
  for (const setup of [setupSummaryStage, setupEducationPin, setupExperiencePin, setupAwardsPin, setupPorRail, setupReveal]) {
    try {
      const cleanup = setup()
      if (cleanup) sectionCleanups.push(cleanup)
    } catch (err) {
      console.error('[portfolio] section setup failed:', err)
    }
  }
})

onBeforeUnmount(() => {
  finePointerMq?.removeEventListener?.('change', onFinePointer)
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
    <a href="#hero" class="brand" @click="closeNav">
      <span class="brand-dot"></span>
      ADARSH GOLAIT
      <span class="brand-sub">— Portfolio</span>
    </a>
    <button
      type="button"
      class="nav-toggle"
      :aria-expanded="navOpen"
      aria-controls="primary-nav"
      :aria-label="navOpen ? 'Close menu' : 'Open menu'"
      @click="toggleNav"
    >
      <span class="bars" aria-hidden="true"></span>
      <span>{{ navOpen ? 'Close' : 'Menu' }}</span>
    </button>
    <nav id="primary-nav" class="nav" :class="{ 'is-open': navOpen }" aria-label="Primary" @click="closeNav">
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
          <HeroCharacter
            v-if="characterVisible || characterDoorRef"
            class="cr-character"
            :camera-zoom="1.25"
            :paused="doorProgressRef < 0.001"
          />
          <div v-else class="cr-character-placeholder" aria-hidden="true"></div>
          <div class="cr-overlay">
            <span class="cr-top">— Meet Adarsh</span>
            <div></div>
            <div class="cr-bottom">
              <h2 class="cr-headline">A <em>moving</em> operator — on a mission to fuel the next generation of builders.</h2>
              <div class="cr-meta-stack">
                <p class="cr-hint"><span class="cr-hint-dot" aria-hidden="true"></span>Move your cursor — he follows</p>
                <p class="cr-meta">Scroll to enter the work →</p>
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
        <!-- Résumé CTA lives at .hs-resume (top layer of .hs-sticky) so the
             one button persists unchanged through the door-open transition;
             this cell stays as the grid's right-column filler. -->
        <div class="right"></div>
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

        <!-- Résumé CTA — top layer of the sticky stage, above hs-front and
             the door halves. Fades in once as Page-1 commits to landing
             (--hs-hero-t), then sits untouched: the gate opening animates
             beneath it while the button holds position and brightness. -->
        <a
          class="hs-resume"
          href="https://drive.google.com/file/d/1YwbA4hQ8tMp-VhoR3a5jC72Qx2hOLKUD/view?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" stroke-linecap="square"></path>
          </svg>
          Résumé
        </a>
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
        <!-- Self-contained interactive character (own canvas). Staged
             (desktop): icon buttons below drive his one-shot clips; the
             component hides its internal text buttons. Non-staged (mobile /
             reduced motion): the component shows its own buttons. -->
        <div class="char-slot">
          <SummaryCharacter v-if="summaryNear" ref="summaryCharRef" :show-actions="!sumStaged" @state="onCharState" @metrics="onCharMetrics" />
        </div>
        <div
          v-if="sumStaged"
          class="summary-actions"
          :class="{ 'is-live': charState.ready }"
          aria-label="Character actions"
        >
          <!-- Bordered control surface: four loose icon circles on white paper
               read as decoration. A panel with a lime edge reads as something
               you operate. -->
          <div class="sum-act-panel">
            <span class="sum-act-hint"><span class="sum-act-bar" aria-hidden="true"></span>Make him move — pick one</span>
            <div class="sum-act-row">
              <button type="button" class="sum-act" style="--i: 0" :disabled="charState.busy || charState.pushing" @click="playCharAction('jump')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
                  </svg>
                </span>
                <span class="sum-act-label">Jump</span>
              </button>
              <button type="button" class="sum-act" style="--i: 1" :disabled="charState.busy || charState.pushing" @click="playCharAction('back_flip')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 1 3.6 7.2" /><path d="M3 22v-6h6" />
                  </svg>
                </span>
                <span class="sum-act-label">Flip</span>
              </button>
              <button type="button" class="sum-act" style="--i: 2" :disabled="charState.busy || charState.pushing" @click="playCharAction('dancing')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </span>
                <span class="sum-act-label">Dance</span>
              </button>
              <button type="button" class="sum-act" style="--i: 3" :disabled="charState.busy || charState.pushing" @click="playCharAction('push_ups')">
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
              <p class="xp-summary">Architected a modular PySpark framework adopted across multiple production systems, reduced a key profitability pipeline turnaround by 90%, and developed a unified profitability layer spanning 6 crore accounts and 30+ products. Led an 18-month automation program involving four internal teams and an external engineering team, and independently sustained the full modelling portfolio through a complete team transition with zero delivery disruptions.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">CCPS turnaround</span><span class="v">−90% · 3 hrs</span></div>
                <div class="cell"><span class="k">Models owned</span><span class="v">9 quarterly</span></div>
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
              <p class="xp-summary">Reverse-engineered 10+ competing STEM and consumer hardware products, managed 4+ concurrent hardware development workstreams from concept to physical prototype, and coordinated external vendors across laser cutting, 3D printing, packaging, and manufacturing — on-ground vendor sourcing and pre-production execution for a consumer hardware company.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">Competitor SKUs</span><span class="v">10+ analysed</span></div>
                <div class="cell"><span class="k">Workstreams</span><span class="v">4+ concurrent</span></div>
              </div>
            </article>

            <article class="xp-panel">
              <span class="xp-index" aria-hidden="true">03</span>
              <p class="xp-panel-co"><mark class="co-mark">Tata Steel</mark></p>
              <header class="xp-head">
                <span class="xp-badge">Vocational Training · Industrial Systems</span>
                <h3 class="xp-role">Industrial Systems Exposure</h3>
              </header>
              <div class="xp-datelines">
                <div class="row">
                  <span class="who">Vocational Trainee</span>
                  <span class="when">May, 2021 — July, 2021 · Virtual</span>
                </div>
              </div>
              <p class="xp-summary">Industrial systems exposure through a virtual programme — bulk-material handling, belt-conveyor construction, drive arrangements and power-unit selection — closed with a decision-oriented technical report.</p>
              <div class="xp-stats">
                <div class="cell"><span class="k">Focus</span><span class="v">Bulk handling</span></div>
                <div class="cell"><span class="k">Output</span><span class="v">Technical report</span></div>
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
    <section id="por" ref="porSecRef" class="section" data-no-reveal>
      <span class="section-num">04 · Positions of Responsibility</span>
      <h2 class="section-title">Positions of<br /><span class="accent-line">Responsibility</span></h2>

      <div class="rail-wrap" ref="porRailWrapRef">
        <div class="rail" aria-hidden="true"><div class="rail-tip" ref="porRailTipRef"></div></div>

        <article class="entry">
          <span class="bix"><i></i>Student Council, IIT Gandhinagar</span>
          <div class="entry-head">
            <p class="entry-title">Welfare Secretary | Interim General Secretary | Interim Cultural Secretary</p>
            <span class="entry-when">May 2022 – April 2023</span>
          </div>

          <div class="split">
            <ul class="bullets">
              <li><span class="nd"></span><span class="tx">Represented a <strong><span class="cnt">3600+</span> student community</strong> on institute decisions spanning food services, laundry, healthcare, commercial establishments, hostel accommodations, and student affairs; coordinated with institute administration, external vendors, and a <span class="cnt">25</span>-member council to drive campus-wide initiatives and address operational needs at scale.</span></li>
              <li><span class="nd"></span><span class="tx">Served as the student representative in <strong>procurement and tender evaluations</strong> for campus mess and laundry contracts. Conducted operational due diligence across vendor facilities in Gujarat, Rajasthan, and Delhi, assessing service quality, execution capability, hygiene standards, and scalability before contributing to institute-wide provider selection decisions.</span></li>
              <li><span class="nd"></span><span class="tx"><em>Led expansion of campus commercial services</em> through the Commercial Establishment &amp; Management Committee (CEMC), engaging with <span class="cnt">20+</span> national chains and regional players, running live campus trials, gathering structured student feedback, and supporting the onboarding of new outlets based on demonstrated performance rather than lowest-cost bids.</span></li>
              <li><span class="nd"></span><span class="tx">Helped design and roll out a <strong>pay-as-you-use laundry model in partnership with Haier</strong>, introducing washer and dryer facilities for the student community and defining the student-facing commercial and fee structure alongside institute stakeholders.</span></li>
              <li><span class="nd"></span><span class="tx">Owned planning and governance of student initiatives with cumulative budgets exceeding <strong><span class="cnt">₹80+ lakh</span></strong>, serving as a student signing authority across programmes ranging from institute events to large-scale student activities. Also led execution of Convocation 2022 through a <span class="cnt">68</span>-member team and managed IIT Gandhinagar's <span class="cnt">104</span>-member contingent for the Inter-IIT Cultural Meet, overseeing budgeting, logistics, travel, accommodation, and end-to-end on-ground coordination.</span></li>
            </ul>

            <div class="visual-rail">
              <PorPhotoWall :photos="POR_WALL_PHOTOS" label="Photo wall — Student Council, IIT Gandhinagar" />
            </div>
          </div>
        </article>

        <article class="entry">
          <span class="bix"><i></i>Welfare Council, IIT Gandhinagar</span>
          <div class="entry-head">
            <p class="entry-title">Coordinator for Commercial Outlets</p>
            <span class="entry-when">May, 2021 – April, 2022</span>
          </div>

          <ul class="bullets">
            <li><span class="nd"></span><span class="tx">Identified and assessed <strong><span class="cnt">20+</span> vendor operators</strong> across food and service categories through independent on-ground outreach and capability assessments spanning national chains and regional operators.</span></li>
            <li><span class="nd"></span><span class="tx">Designed and implemented a <em>data-driven vendor evaluation framework</em>, running multiple 1–2 day campus trials and collecting structured community feedback to replace ad-hoc vendor selection with an evidence-based evaluation process.</span></li>
            <li><span class="nd"></span><span class="tx">Onboarded and launched <strong><span class="cnt">6</span> food and service outlets</strong> serving a <span class="cnt">3600+</span> student community by managing end-to-end vendor negotiations, approvals, scheduling, and operational go-live for campus commercial outlets.</span></li>
            <li><span class="nd"></span><span class="tx">Hosted an institute-wide ice cream social for <strong><span class="cnt">4,500+</span> students, faculty, staff, and service personnel</strong>, managing everything from vendor selection and procurement to on-ground execution and seamless service for the entire community.</span></li>
            <li><span class="nd"></span><span class="tx">Led multiple blood donation drives in partnership with GCRI and Ahmedabad Civil Hospital, coordinating <span class="cnt">400+</span> registrations through slot-based crowd management and resulting in the institute's highest post-pandemic blood collection.</span></li>
          </ul>
        </article>

        <article class="entry">
          <span class="bix"><i></i>Virtual Event during COVID-19</span>
          <div class="entry-head">
            <p class="entry-title">Co-Founder — Pegasus'20 (International Online Event)</p>
            <span class="entry-when">September, 2020</span>
          </div>

          <ul class="bullets">
            <li><span class="nd"></span><span class="tx">Co-founded and delivered Pegasus'20 end-to-end during COVID with a <span class="cnt">30</span>-member team; secured 5 sponsors + 3 gifting partners, managed INR <span class="cnt">58K</span> prize pool, and closed at INR <span class="cnt">52K</span> profit.</span></li>
          </ul>
        </article>
      </div>
    </section>

    <!-- Other Extra-Curricular — year clusters -->
    <section id="extra" ref="extraSecRef" class="section" data-no-reveal>
      <span class="section-num">04.b · Other Extra-Curricular</span>
      <h2 class="section-title">Other<br /><span class="accent-line">Extra-Curricular</span></h2>

      <div class="yrs">
        <div class="yr-group">
          <div class="yr-col">
            <div class="yr" aria-label="2020"><span>2</span><span>0</span><span>2</span><span>0</span></div>
          </div>
          <div class="yr-roles">
            <div class="yr-role"><p class="r">Events Coordinator <span class="o">— Amalthea '20 (Annual Technical Summit, IITGN)</span></p><span class="d">September, 2020 — May, 2021</span></div>
            <div class="yr-role"><p class="r">Finance Coordinator, Events Team <span class="o">— Blithchron '21 (Annual Cultural Fest, IITGN)</span></p><span class="d">August, 2020 — February, 2021</span></div>
          </div>
        </div>

        <div class="yr-group">
          <div class="yr-col">
            <div class="yr" aria-label="2019"><span>2</span><span>0</span><span>1</span><span>9</span></div>
          </div>
          <div class="yr-roles">
            <div class="yr-role"><p class="r">Event Management Executive <span class="o">— Blithchron '20 (Annual Cultural Fest, IITGN)</span></p><span class="d">September, 2019 — February, 2020</span></div>
            <div class="yr-role"><p class="r">Event Management Executive <span class="o">— Amalthea '19 (Annual Technical Summit, IITGN)</span></p><span class="d">August, 2019 — October, 2019</span></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Achievements & Recognition — pinned; scroll scrubs the medal
         presentation to its end before the section releases -->
    <section id="awards" ref="awRef" class="section" data-no-reveal data-medal-driver>
      <div class="aw-stick">
        <span class="section-num">05 · Achievements &amp; Recognition</span>
        <h2 class="section-title">Achievements &amp;<br /><span class="accent-line">Recognition</span></h2>

        <div class="split aw-split">
          <div class="aw-list">
            <div class="aw-beam" aria-hidden="true"><i></i><b></b></div>
            <ul class="bullets aw-bullets">
              <li><strong><em>Gold Medalist — Outstanding Social Service (IITGN, Convocation 2023)</em></strong> — institute Gold Medal for contribution to student welfare, campus operations, and community leadership.</li>
              <li><strong>Anchors Elite (Q2 FY25)</strong> — selected among 51 employees across Axis Bank pan-India for exceptional impact and delivery.</li>
              <li><strong>Anchors Team Player (Q2 FY25)</strong> — awarded for high-ownership collaboration and cross-team execution under pressure.</li>
              <li><strong>BIU Team Award</strong> — recognised for end-to-end delivery of the profit score automation program with TCS.</li>
              <li><strong>Agile &amp; Jira adoption lead</strong> — part of a 6-member SWAT team driving Jira rollout and Agile project management adoption across the Data Science vertical and cross-functional teams.</li>
              <li><strong>Dean's List</strong> — Semester 4, 2021; awarded to meritorious students.</li>
              <li><strong>Winner — Rube Goldberg Machine Building Competition</strong> (Amalthea, IITGN, 2020) — 1st place for designing and executing a chain-reaction machine under competition constraints.</li>
              <li>Top internal technical assessments — L3 in SQL and PySpark (Q4 FY25); L2 in Functional Assessment.</li>
              <li>Competitive sports medals in Rope Skipping — 3 Gold (State SGFI), 2 Silver (CBSE Nationals), selected for National RSFI championship.</li>
            </ul>
          </div>

          <div class="visual-rail">
            <MedalScrub />
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
      <h2>Open to <em>Business operations</em> at hardware-first companies.</h2>
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

  <!-- Hero-only pointer trail. Fixed overlay, pointer-events:none — gated so
       it disappears once the hero plate has zoomed away. -->
  <FluidCursor v-if="pointerFine" :active="fluidCursorActive" />
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
  /* Six section links wrap to three rows at phone width, so below 720px the
     nav is presented as a sheet behind the .nav-toggle button (rules live in
     style.css, shared with the detail-route topbar). The scroll-spy underline
     is an absolutely-positioned ::before against a baseline row — in the
     stacked sheet it draws across the link, so the sheet marks the active
     item with the accent chip on .nav-num instead. */
  .portfolio-topbar .nav a.is-active::before { display: none; }
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
  /* Manual size knob — scales the whole signature reveal. 1 = original,
     smaller < 1. Tweak this one value only. */
  --sig-scale: 0.92;
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
  width: calc(clamp(260px, 28vw, 460px) * var(--sig-scale));
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
    width: calc(clamp(180px, 55vw, 260px) * var(--sig-scale));
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
/* Sized for the long form of the line ("…on a mission to fuel the next
   generation of builders", ~73 chars): the old 18ch/4.5rem setting was tuned
   for a 33-char line and pushed this one to five oversized lines that
   overflowed the overlay's bottom row. 24ch + a lower clamp ceiling lands it
   at three balanced lines on desktop without shrinking it into body copy. */
.hs-sticky .cr-headline {
  font: 900 clamp(1.5rem, 3.1vw, 2.9rem)/1 var(--f-sans);
  letter-spacing: -0.04em;
  text-transform: uppercase;
  max-width: 24ch;
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
@media (prefers-reduced-motion: reduce) {
  .hs-sticky .cr-hint, .hs-sticky .cr-hint-dot { animation: none; }
}
/* Résumé CTA — single element on the sticky stage's top layer (above
   hs-front z5 and the door halves z3). Position mirrors im-top's old CTA
   cell: its top/right offsets equal im-top's padding, so it sits exactly
   where the button always lived on the intro page. Fades in once near the
   end of the hero landing (--hs-hero-t, which holds at 1 through the door
   scrub and dwell) — the gate animates beneath it while the button never
   moves, dims, or re-renders. */
.hs-sticky .hs-resume {
  position: absolute;
  top: clamp(1.25rem, 3vh, 2rem);
  right: clamp(1.5rem, 3vw, 2.5rem);
  z-index: 10;
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
  text-decoration: none;
  transition: transform 0.25s ease, filter 0.25s ease;
  opacity: clamp(0, (var(--hs-hero-t, 0) - 0.72) * 5, 1);
  pointer-events: var(--hs-resume-pe, none);
}
.hs-sticky .hs-resume:hover { transform: translateY(-2px); filter: brightness(1.05); }
.hs-sticky .hs-resume svg { width: 14px; height: 14px; }
/* Touch devices have no cursor to move — the hint is wrong copy there, and
   on phone widths it collides with the headline. Head-follow still works
   via touch-drag; the stage just doesn't advertise it with cursor copy. */
@media (hover: none) {
  .hs-sticky .cr-hint { display: none; }
}
/* Narrow viewports: the two-column bottom row (headline 1fr | meta auto)
   runs out of room — the meta stack lands on top of the headline's last
   line. Stack them instead. */
@media (max-width: 720px) {
  .hs-sticky .cr-bottom {
    grid-template-columns: 1fr;
    justify-items: start;
    gap: 1.1rem;
  }
  .hs-sticky .cr-meta-stack { align-items: flex-start; }
  .hs-sticky .cr-meta { text-align: left; }
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
   Staged (desktop, motion OK): section grows to 600vh (tall on purpose —
   the pin range IS the animation's scroll gain; shorter = the whole push
   blows through in a flick), inner pin holds one viewport. JS publishes
   smoothed scroll-scrub vars:
     --sum-appr    0..1  walk-in phase (fades the actions + ghost numeral)
     --sum-exit    0..1  shove phase (text lean + ground-line fade)
     --sum-body-x  px    text column travel — measured to clear the viewport
     --sum-char-x  px    character travel — walk-in, then lockstep with the
                         text during the shove (he rides the push out)
     --sum-walk-x  px    walk-in term alone — set dressing counter-translates
                         against this so the set stays put under his stride
     --sum-char-col px   width of the character column — rig-derived, see the
                         grid rule below
     --sum-fit     0..1  measured type multiplier that keeps the copy inside
                         the pin whatever width the character column left it
   Non-staged: plain stacked flow, character below text. */
#summary {
  --sum-appr: 0; --sum-exit: 0; --sum-body-x: 0px; --sum-char-x: 0px; --sum-walk-x: 0px;
  /* First-paint estimate only; JS overwrites it with the exact rig width on
     the first measure. 82vh approximates 1.07 x the slot height across the
     desktop range (the slot is the viewport minus the topbar, the pin padding
     and the fixed-height action panel). The 52vw guard keeps a tall, narrow
     window from starving the text column. */
  --sum-char-col: min(82vh, 52vw);
}
#summary.sum-staged { height: 600vh; padding: 0; }
#summary .summary-pin { min-height: 0; }
#summary.sum-staged .summary-pin {
  position: sticky;
  top: var(--topbar-h, 56px);
  height: calc(100vh - var(--topbar-h, 56px));
  padding: clamp(0.75rem, 2vh, 1.5rem) var(--gutter-x) clamp(0.5rem, 1.5vh, 1rem);
  overflow: hidden;
  display: flex;
  align-items: center;
}
#summary .summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: clamp(2rem, 4vw, 4rem);
  align-items: center;
  width: 100%;
}
/* minmax(0,1fr), not bare 1fr: a 1fr track's min is auto, so wide children
   blow the track past the viewport on phones. minmax(0,1fr) compresses. */
@media (max-width: 980px) { #summary .summary-grid { grid-template-columns: minmax(0, 1fr); } }
/* Staged pin: stretch both tracks to the pin height and center the text
   inside its track — the two columns read as one balanced composition
   instead of text crammed against the pin's top edge. Short viewports get
   a tighter type scale below so centering never clips inside the pin's
   overflow:hidden. */
#summary.sum-staged .summary-grid {
  align-items: stretch;
  height: 100%;
  /* The character column is HEIGHT-driven, because the camera frames him by
     height: his rendered silhouette is a fixed multiple of the canvas height
     and owes nothing to the viewport width. Sizing it as a width-driven
     `0.92fr` track meant the canvas clipped his outstretched pushing arm at
     every desktop size we measured (69px lost at 1440x900, 51px at 1920x1080)
     while simultaneously stranding him ~600px from the text on a 2560 monitor.
     JS sets --sum-char-col from the rig's own measured reach. */
  grid-template-columns: minmax(0, 1fr) minmax(0, var(--sum-char-col));
}
#summary.sum-staged .body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  padding-top: 0;
}
/* Pinned stage caps the display type a step below the scroll-header scale —
   the title shares the viewport with four paragraphs and the character.
   Everything here is multiplied by --sum-fit, the measured fit-to-pin factor
   JS publishes (see measure()): the clamps set the intent, the multiplier
   guarantees the copy actually lands inside the overflow:hidden pin whatever
   width the character column left for it. It is 1 whenever the copy fits. */
#summary.sum-staged .section-title {
  font-size: calc(clamp(2.4rem, 4.8vw, 4.2rem) * var(--sum-fit, 1));
  margin-bottom: calc(clamp(1rem, 2.6vh, 1.8rem) * var(--sum-fit, 1));
}
#summary.sum-staged .body p {
  font-size: calc(clamp(1rem, 1.18vw, 1.14rem) * var(--sum-fit, 1));
  margin-bottom: calc(1.15rem * var(--sum-fit, 1));
}
#summary .body p {
  font: 400 clamp(1rem, 1.18vw, 1.14rem)/1.62 var(--f-sans);
  color: var(--ink);
  max-width: 58ch;
  text-wrap: pretty;
  margin-bottom: 1.15rem;
}
#summary .body p:last-child { margin-bottom: 0; }
#summary .body p strong { color: var(--ink); font-weight: 600; }
#summary .body p em { font-style: normal; background: var(--accent); color: var(--accent-ink); padding: 0 0.16em; }
/* Short pins start from a tighter scale so --sum-fit rarely has to do anything
   visible — this is the pre-JS default, not the guarantee. */
@media (max-height: 840px) {
  #summary.sum-staged .section-title {
    font-size: calc(clamp(2.1rem, 4.2vw, 3.4rem) * var(--sum-fit, 1));
    margin-bottom: calc(1rem * var(--sum-fit, 1));
  }
  #summary.sum-staged .body p {
    font-size: calc(clamp(0.92rem, 1.05vw, 1.02rem) * var(--sum-fit, 1));
    line-height: 1.52;
    margin-bottom: calc(0.85rem * var(--sum-fit, 1));
  }
}
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
  height: auto;
  min-height: 0;
}
/* Set dressing for the character column: an oversized ghost index numeral
   behind the canvas and a ground hairline under his feet. Both counter-
   translate against the column's walk-in travel — the set stays put while
   he strides across it — and fade as their phase proceeds. */
#summary.sum-staged .char-slot::before {
  content: '00';
  position: absolute;
  top: 0;
  right: 4%;
  font: 900 clamp(8rem, 12vw, 13rem)/0.8 var(--f-sans);
  letter-spacing: -0.06em;
  color: rgba(9, 9, 11, 0.05);
  transform: translateX(calc(-1 * var(--sum-walk-x, 0px)));
  opacity: calc(1 - var(--sum-appr, 0));
  pointer-events: none;
  user-select: none;
}
#summary.sum-staged .char-slot::after {
  content: '';
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: 10%;
  height: 1px;
  background: var(--rule);
  transform: translateX(calc(-1 * var(--sum-walk-x, 0px)));
  opacity: calc(1 - var(--sum-exit, 0));
  pointer-events: none;
}
/* Canvas above the set dressing. */
#summary .char-slot :deep(.sc-wrap) {
  position: relative;
  z-index: 1;
}
/* Push-out — contact-locked, scrubbed, smoothed in JS (no CSS transitions:
   reverse scroll must retrace the exact same path). Phase 1 walks him to
   the text (--sum-char-x only), phase 2 slides text and character off
   together — same px, hands never leave the block, so the push reads as
   one continuous shove instead of the text escaping on its own. The text
   leans back a touch as it goes, like it took the hit. Distances are
   measured px, so at exit=1 the text fully clears the viewport before the
   pin releases; he ends the shove standing at the left edge. */
#summary.sum-staged .body {
  transform:
    translate3d(var(--sum-body-x, 0px), 0, 0)
    rotate(calc(var(--sum-exit, 0) * -1.5deg));
  transform-origin: 100% 65%;
  will-change: transform;
}
#summary.sum-staged .summary-char {
  transform: translate3d(var(--sum-char-x, 0px), 0, 0);
  will-change: transform;
}
/* Action buttons — icon circles with tiny mono labels under a mono hint.
   Rise in once the character has landed; fade as the walk-in begins. */
#summary .summary-actions {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
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
/* Control surface. Four loose circles on white paper read as ornament — the
   hairline box + lime edge says "this is a panel you operate". */
.sum-act-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem clamp(1rem, 2vw, 1.6rem) 0.9rem;
  padding-left: calc(clamp(1rem, 2vw, 1.6rem) + 6px);
  background: var(--paper);
  border: 1px solid var(--rule);
  box-shadow: 0 8px 26px -18px rgba(9, 9, 11, 0.55);
}
.sum-act-panel::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 6px;
  background: var(--accent);
}
.sum-act-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(0.9rem, 1.7vw, 1.5rem);
}
.sum-act-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font: 600 0.6rem/1 var(--f-mono);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.sum-act-bar { width: 16px; height: 2px; background: var(--accent); flex-shrink: 0; }
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
.sum-act:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
.sum-act-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  /* Well past --rule: 1px hairlines on white read as decoration, not buttons.
     These must pass the obviously-clickable test at a glance. */
  border: 1.5px solid rgba(9, 9, 11, 0.5);
  background: var(--paper-2);
  display: grid;
  place-items: center;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease,
    transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(9, 9, 11, 0.08);
}
.sum-act-btn svg {
  width: 20px;
  height: 20px;
}
.sum-act-label {
  font: 600 0.58rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-soft);
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

/* One-time staggered ring pulse the moment the character goes live — the
   panel announces itself once, then holds still. */
#summary .summary-actions.is-live .sum-act-btn {
  animation: sum-act-attract 1.5s ease-out calc(var(--i, 0) * 0.1s) 3;
}
@keyframes sum-act-attract {
  0%   { box-shadow: 0 1px 2px rgba(9,9,11,0.08), 0 0 0 0 rgba(219,254,82,0); }
  14%  { box-shadow: 0 1px 2px rgba(9,9,11,0.08), 0 0 0 0 rgba(219,254,82,0.9); }
  70%  { box-shadow: 0 1px 2px rgba(9,9,11,0.08), 0 0 0 14px rgba(219,254,82,0); }
  100% { box-shadow: 0 1px 2px rgba(9,9,11,0.08), 0 0 0 0 rgba(219,254,82,0); }
}
@media (prefers-reduced-motion: reduce) {
  #summary .summary-actions.is-live .sum-act-btn { animation: none; }
}

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

/* ─── PoR "Rail" treatment (design handoff) ───
   A 2px vertical rail whose fill is scroll-scrubbed (72%-viewport playhead,
   see setupPorRail). Entries + bullet node-dots ignite as the fill passes. */
#por .rail-wrap {
  position: relative;
  --railpad: clamp(2.4rem, 4.5vw, 3.4rem);
  padding-left: var(--railpad);
}
#por .rail {
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--ink-trace);
}
#por .rail-tip {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: var(--ink);
}
#por .rail-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 11px;
  height: 11px;
  background: var(--accent);
  border: 2px solid var(--ink);
  border-radius: 50%;
  transform: translate(-50%, 50%);
}

#por .bix {
  display: block;
  font: 500 0.66rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
  margin-bottom: 0.55rem;
  transition: color 0.3s ease;
}
#por .entry.on .bix { color: var(--ink); }
#por .bix i {
  font-style: normal;
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--paper);
  border: 1.5px solid var(--ink-faint);
  margin-right: 0.5rem;
  vertical-align: baseline;
  transition: background 0.3s ease, border-color 0.3s ease;
}
#por .entry.on .bix i {
  background: var(--accent);
  border-color: var(--ink);
}

/* bullet node dots sit on the rail, outside the padded gutter */
#por .nd {
  position: absolute;
  left: calc(7px - var(--railpad));
  top: 0.34em;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--paper);
  border: 1.5px solid var(--ink-faint);
  transform: translateX(-50%);
  transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
}
#por .nd.lit {
  background: var(--accent);
  border-color: var(--ink);
  transform: translateX(-50%) scale(1.3);
}
#por .bullets li .tx { display: inline-block; }

/* handoff spec: tighter gap than the site-wide .split, photo wall scrolls
   with the entry (not sticky), and the two columns hold until 720px */
#por .split {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
}
#por .split .visual-rail {
  position: static;
  display: block;
}
@media (max-width: 720px) {
  #por .split { grid-template-columns: minmax(0, 1fr); }
}

/* ─── Other Extra-Curricular — year clusters ─── */
#extra .yrs {
  display: flex;
  flex-direction: column;
  gap: clamp(2.25rem, 5vh, 3.5rem);
}
#extra .yr-group {
  display: grid;
  grid-template-columns: minmax(7.5rem, 11rem) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  padding-top: 1.5rem;
  position: relative;
}
#extra .yr-group::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--ink);
  transform-origin: left center;
}
#extra .yr {
  overflow: hidden;
  white-space: nowrap;
  width: max-content;
  max-width: none;
  font: 900 clamp(2.8rem, 6.5vw, 4.8rem)/1 var(--f-sans);
  letter-spacing: -0.04em;
  color: transparent;
  -webkit-text-stroke: 1.5px rgba(9, 9, 11, 0.42);
}
#extra .yr span { display: inline-block; }
#extra .yr-role {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1.25rem;
  padding: 0.95rem 0;
  border-bottom: 1px solid var(--rule);
}
#extra .yr-role:first-child { padding-top: 0.1rem; }
#extra .yr-role .r {
  font: 600 0.95rem/1.5 var(--f-sans);
  letter-spacing: -0.005em;
  color: var(--ink);
}
#extra .yr-role .r .o {
  font-weight: 400;
  color: var(--ink-soft);
}
#extra .yr-role .d {
  font: 500 0.72rem/1.5 var(--f-mono);
  color: var(--ink-faint);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

@media (max-width: 720px) {
  #extra .yr-group { grid-template-columns: 1fr; gap: 0.75rem; }
  #extra .yr-role { flex-direction: column; align-items: flex-start; gap: 0.2rem; }
}

/* motion: hidden pre-states only when setupPorRail mounted (.anim) + motion
   allowed, so reduced-motion and print render fully static */
@media (prefers-reduced-motion: no-preference) {
  .anim .section-num,
  .anim .section-title {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .section-num.on,
  .anim .section-title.on {
    opacity: 1;
    transform: none;
  }

  #por.anim .rail-tip { height: 0; }
  #por.anim .entry-title {
    opacity: 0;
    transform: translateX(-22px);
    transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #por.anim .entry.on .entry-title {
    opacity: 1;
    transform: none;
  }
  #por.anim .entry-when {
    opacity: 0;
    transition: opacity 0.6s ease 0.25s;
  }
  #por.anim .entry.on .entry-when { opacity: 1; }
  #por.anim .visual-rail {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
  }
  #por.anim .entry.on .visual-rail {
    opacity: 1;
    transform: none;
  }
  #por.anim .bullets li .tx {
    clip-path: inset(-4% 102% -8% -2%);
    transition: clip-path 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.05s;
  }
  #por.anim .bullets li.on .tx { clip-path: inset(-4% -3% -8% -2%); }
  #por.anim .nd.lit { animation: porNdPop 0.4s cubic-bezier(0.2, 1.4, 0.3, 1); }

  #extra.anim .yr-group::before {
    transform: scaleX(0);
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #extra.anim .yr-group.on::before { transform: scaleX(1); }
  #extra.anim .yr span {
    transform: translateY(112%);
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #extra.anim .yr span:nth-child(2) { transition-delay: 0.07s; }
  #extra.anim .yr span:nth-child(3) { transition-delay: 0.14s; }
  #extra.anim .yr span:nth-child(4) { transition-delay: 0.21s; }
  #extra.anim .yr-group.on .yr span { transform: none; }
  #extra.anim .yr-role {
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #extra.anim .yr-role:nth-child(1) { transition-delay: 0.2s; }
  #extra.anim .yr-role:nth-child(2) { transition-delay: 0.34s; }
  #extra.anim .yr-group.on .yr-role {
    opacity: 1;
    transform: none;
  }
}

@keyframes porNdPop {
  0% { transform: translateX(-50%) scale(0.6); }
  60% { transform: translateX(-50%) scale(1.55); }
  100% { transform: translateX(-50%) scale(1.3); }
}

@media print {
  #por .section-title,
  #por .tx,
  #por .entry-when,
  #por .entry-title,
  #por .visual-rail,
  #extra .section-title,
  #extra .yr span,
  #extra .yr-role {
    opacity: 1 !important;
    transform: none !important;
    clip-path: none !important;
    animation: none !important;
  }
  #por .rail-tip { height: 100% !important; }
  #extra .yr-group::before { transform: none !important; }
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
  /* Last block on the page — its bottom padding has to clear the iOS home
     indicator, or the colophon sits under the swipe bar. 0 elsewhere. */
  padding: var(--pad-head-top) var(--gutter-x)
           calc(var(--pad-head-top) + env(safe-area-inset-bottom));
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
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: end;
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
#experience:not(.xp-staged) .xp-stats { max-width: 620px; }

/* short viewports while pinned: shed the summary so the panel always
   fits inside the 100vh pin without clipping */
@media (max-height: 620px) {
  #experience.xp-staged .xp-summary { display: none; }
}

/* ════════════════════════════════════════════════════════════
   ACHIEVEMENTS — pinned medal scrub
   Section pins for ~1.8 viewports; scroll drives the medal frame
   sequence to its end while a beam traces down the list and lights
   each recognition row (tracing-beam / spotlight treatments adapted
   from 21st.dev to the blueprint design language).
   ════════════════════════════════════════════════════════════ */
#awards.aw-staged { height: 280vh; padding: 0; }
#awards .aw-stick { display: flex; flex-direction: column; min-height: 0; }
#awards.aw-staged .aw-stick {
  position: sticky;
  top: var(--topbar-h, 56px);
  height: calc(100vh - var(--topbar-h, 56px));
  padding: clamp(1.25rem, 3.5vh, 2.5rem) var(--gutter-x) clamp(1rem, 3vh, 2rem);
  justify-content: center;
  overflow: hidden;
}
/* pinned stack must fit 100vh — trade display size for fit, both axes */
#awards.aw-staged .section-num { position: static; }
#awards.aw-staged .section-title {
  font-size: clamp(1.7rem, min(4.5vw, 5.4vh), 3.6rem);
  margin-bottom: clamp(1.2rem, 3.5vh, 2.4rem);
}
#awards.aw-staged .aw-split { align-items: center; }
#awards.aw-staged .visual-rail { position: static; }
/* :deep — .medal-scrub lives inside the MedalScrub child component */
#awards.aw-staged .visual-rail :deep(.medal-scrub) { max-height: min(64vh, 560px); }
@media (max-height: 820px) {
  #awards.aw-staged .aw-bullets { gap: 0.4rem; }
  #awards.aw-staged .aw-bullets li { font-size: 0.88rem; line-height: 1.45; }
}

/* beam rail — a thin track beside the list; the lime fill grows with the
   pin progress (--awp) and a head dot rides its tip */
#awards .aw-list { position: relative; }
#awards.aw-staged .aw-list { padding-left: clamp(1.2rem, 1.8vw, 1.75rem); }
#awards .aw-beam { display: none; }
#awards.aw-staged .aw-beam {
  display: block;
  position: absolute;
  left: 0;
  top: 0.4em;
  bottom: 0.4em;
  width: 2px;
}
#awards.aw-staged .aw-beam::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 1px;
  background: var(--ink-trace);
}
#awards.aw-staged .aw-beam i {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(219, 254, 82, 0) 0%,
    rgba(219, 254, 82, 0.85) 22%,
    var(--accent) 100%
  );
  transform: scaleY(var(--awp, 0));
  transform-origin: top;
}
/* head dot rides the beam tip — the full-height carrier translates by its
   own height (transform, not `top`, so no per-frame layout) and the dot
   sits at its bottom end */
#awards.aw-staged .aw-beam b {
  position: absolute;
  inset: 0;
  transform: translateY(calc((var(--awp, 0) - 1) * 100%));
}
#awards.aw-staged .aw-beam b::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 9px;
  height: 9px;
  transform: translate(-50%, 50%);
  border-radius: 50%;
  background: var(--accent);
  border: 1px solid var(--ink);
  box-shadow: 0 0 12px 2px rgba(219, 254, 82, 0.75);
}

/* rows light as the beam passes — de-emphasised (but still legible)
   until then */
#awards.aw-staged .aw-bullets li {
  opacity: 0.42;
  transition: opacity 0.45s ease;
}
#awards.aw-staged .aw-bullets li.is-lit { opacity: 1; }
#awards .aw-bullets li::before {
  transition: background-color 0.45s ease, width 0.45s ease;
}
#awards.aw-staged .aw-bullets li.is-lit::before {
  background: var(--ink);
  width: 20px;
}

/* pinned-section entrances — mirror the shared reveals */
@media (prefers-reduced-motion: no-preference) {
  #awards.aw-staged .section-num,
  #awards.aw-staged .section-title {
    opacity: 0;
    transform: translateX(-44px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1),
                transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #awards.aw-staged .section-title { transition-delay: 0.08s; }
  #awards.aw-staged .visual-rail {
    opacity: 0;
    transform: translateX(44px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.1s,
                transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.1s;
  }
  #awards.aw-staged.head-in .section-num,
  #awards.aw-staged.head-in .section-title,
  #awards.aw-staged.head-in .visual-rail {
    opacity: 1;
    transform: none;
  }
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
  padding: var(--pad-section) var(--gutter-x) var(--gap-lede);
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
