<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import HeroSection from '../HeroSection.vue'
import BeamsBackground from '../components/BeamsBackground.vue'
import CorporateSlider from '../components/portfolio/CorporateSlider.vue'
import HeroNarrative from '../components/portfolio/HeroNarrative.vue'
import MedalScrub from '../components/portfolio/MedalScrub.vue'
import PorPhotoWall from '../components/portfolio/PorPhotoWall.vue'
import type { WallPhoto } from '../components/portfolio/PorPhotoWall.vue'
import TimedCards from '../components/portfolio/TimedCards.vue'
import { useMobileNav } from '../composables/useMobileNav'
import { heroSubjectBox, isCompactViewport } from '../heroFraming'
import { hasWebGL2 } from '../perf/webgl'
import signatureSvgRaw from '../../assets/signature.svg?raw'
// Framer Motion's keyframe interpolator, via Motion for Vue. Pure function —
// the `<motion.*>` components do not survive on this route (see the header of
// HeroNarrative.vue), so every scrub here writes styles from a rAF instead.
import { transform } from 'motion-v'
import iitgnCampusImg from '../../assets/IIT_Gandhinagar/IITGN.jpg'
/* Stills of the two rigs, rendered out of the live scenes at the exact
   framing each camera uses (see .cr-character-still / .sum-char-still for
   how the numbers are reproduced in CSS). They are imported rather than
   referenced by path so Vite fingerprints them — and because the <img> only
   renders on the fallback branch, a visitor whose browser CAN run the 3D
   never requests either file. */
import characterStillHero from '../../assets/character-still-hero.png'
import characterStillSummary from '../../assets/character-still-summary.png'

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

/* ── 3D character: one place that decides whether he can run at all ──────
   The two rigs are the same GLB on two WebGL2 contexts. Both are optional,
   and both have exactly two ways to be impossible on a given machine:

     1. the browser will not give out a WebGL2 context (Lockdown Mode, a
        driver blocklist, an in-app WebView — see perf/webgl.ts), or
     2. the JS chunk that contains the rig never arrives.

   Asked here, once, before either component is created — so on a browser
   that cannot draw him the page goes straight to the still image instead of
   mounting a canvas that will never paint. Anything that goes wrong *after*
   a successful mount still lands in the same two refs via @failed, so there
   is a single answer to "is the character on screen" no matter how it failed.

   The rig could not be loaded on this machine — a blocked or exhausted WebGL
   context, a driver that never finishes compiling shaders, a stalled model
   download, a chunk that 404s after a redeploy. Every one of those used to
   end in the same place: an empty character slot next to a control panel
   that would never light up, with nothing to tell the reader that the
   section was finished rather than stuck. The summary text is the content
   here and stands on its own, so the section drops the rig and its controls
   and shows a still of him instead. */
const webglOK = hasWebGL2()
const charFailed = ref(!webglOK)
// Same for the rig behind the doors. Falling back to .cr-character-placeholder
// (the element that already stands in before he is warmed up) means the door
// reveal still opens onto a composed stage rather than a hole.
const heroCharFailed = ref(!webglOK)
if (!webglOK) {
  console.warn('[Portfolio] WebGL2 unavailable — 3D character replaced by a still image')
}

/* Chunk loads fail for reasons that have nothing to do with the code in
   them: a dropped mobile connection, a proxy or content blocker, or — the
   one that bites in production — a visitor holding a cached index.html from
   the previous deploy, asking for asset hashes that no longer exist. The SPA
   rewrite turns that 404 into index.html, so the browser tries to parse HTML
   as a module and the import rejects.

   Unhandled, Vue logs a warning and renders nothing at all: not the rig, not
   the fallback, because as far as the template is concerned the component is
   still on its way. Retry twice for the transient half, then fail loudly
   into the same flag every other failure uses. */
function withChunkRetry(
  name: string,
  loader: () => Promise<unknown>,
  onGiveUp: () => void,
) {
  return defineAsyncComponent({
    loader: loader as never,
    onError(error, retry, fail, attempts) {
      if (attempts <= 2) {
        setTimeout(retry, 300 * attempts)
        return
      }
      console.error(`[Portfolio] ${name} chunk failed to load:`, error)
      onGiveUp()
      fail()
    },
  })
}

const HeroCharacter = withChunkRetry(
  'HeroCharacter',
  () => import('../character/HeroCharacter.vue'),
  () => { heroCharFailed.value = true },
)
const SummaryCharacter = withChunkRetry(
  'SummaryCharacter',
  () => import('../character/SummaryCharacter.vue'),
  () => { charFailed.value = true },
)
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
// viewports, where a landscape crop of the portrait hero render reduces to an
// eye-strip. `isCompactViewport` lives in ../heroFraming (it is shape-based,
// not width-based — see COMPACT_MEDIA there) and MUST stay in step with the
// .im-frame aspect-ratio media query below.
const HERO_SLOT_AR_WIDE    = 24 / 14
const HERO_SLOT_AR_COMPACT = 3 / 4

function heroSlotAR() {
  return isCompactViewport() ? HERO_SLOT_AR_COMPACT : HERO_SLOT_AR_WIDE
}

// ── compact landing frame ──
// How the head should sit inside the portrait slot. Only consulted on compact
// viewports; the wide slot keeps running on heroZoom.characterSize / cropY.
//   HEAD_W_FRAC    head width ÷ plate width.
//   CROWN_HEADROOM air above the hair ÷ plate height.
const COMPACT_HEAD_W_FRAC   = 0.78
const COMPACT_CROWN_HEADROOM = 0.10

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
//   0 ─── HERO_BUDGET_VH ─── +DOOR_BUDGET_VH ── +DOOR_DWELL_VH ── +NARRATIVE_VH
//   hero zoom + signature │ doors split │ settle │ 3-state story │ release
// ────────────────────────────────────────────────────────────────────
const doorProgressRef = ref(0)         // 0 = doors closed, 1 = fully open
const characterDoorRef = ref(false)    // pre-mount HeroCharacter behind doors

const doorConfig = {
  smoothing: 0.16,
}
let doorRafId: number | null = null
let doorProgress = 0
let doorProgressTarget = 0

// ────────────────────────────────────────────────────────────────────
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

/**
 * Measured fit-to-pin, shared by the pinned stages (education, experience).
 *
 * Every pinned stage is an `overflow: hidden` box exactly one viewport tall,
 * and its type is sized off clamps that mix vw and vh terms. That works on the
 * display it was tuned against and nowhere else: the vh term shrinks with the
 * viewport but the rem floors and the WRAP COUNT do not, so a 1366x670 laptop
 * (the most common laptop resolution there is) ran 78px of the Experience
 * stats panel past the pin's bottom edge, and a 375x553 phone lost the whole
 * Education records strip — 154px of content, silently clipped, with nothing
 * on screen to say it was ever there.
 *
 * Same remedy #summary already uses: measure what actually rendered, publish a
 * multiplier, let the clamps in CSS keep expressing intent. `--x-fit` is 1
 * whenever the content already fits, so nothing on a large display moves.
 */
// How far past the pin's padding edge the content may still sit at the fit
// floor before the stage gives up the pin entirely. A few px is invisible
// (and inside the pin's own bottom padding); tens of px is a clipped row.
const PIN_GIVE_UP_PX = 8

function pinOverflowPx(pin: HTMLElement): number {
  const pr = pin.getBoundingClientRect()
  const cs = getComputedStyle(pin)
  const floorY = pr.bottom - parseFloat(cs.paddingBottom)
  let worst = 0
  // Walks the tree and PRUNES rather than filtering flat, because what has to
  // be excluded is a whole subtree, not an element. Out-of-flow children here
  // are either decorative bleed (the medal aura is authored to run past its
  // box) or already fitted into the space the flow left over (the campus
  // photo, positioned by fitPhoto) — scaling the type can't move either, so
  // counting them would shrink the copy to chase a box that follows it down.
  // Filtering only the absolute element itself missed its static <img> child,
  // which is exactly how the second fit pass (the one after fonts.ready, by
  // which time the photo had been placed) came back with a phantom 42px and
  // un-pinned a stage that fit perfectly well.
  const walk = (node: HTMLElement) => {
    for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
      const el = c as HTMLElement
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') continue
      if (s.position === 'absolute' || s.position === 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.width >= 2 && r.height >= 2) {
        const over = r.bottom - floorY
        if (over > worst) worst = over
      }
      walk(el)
    }
  }
  walk(pin)
  return worst
}

/**
 * Shrink `sec`'s type until its pinned content clears the pin's bottom edge.
 * Iterated rather than solved: scaling the type re-wraps it, so the height it
 * needs moves in steps, not proportionally. Bails at `floor` — past that the
 * copy is unreadable and clipping is the lesser evil (the callers pick a floor
 * they can defend, and the stage un-pins entirely below it).
 */
function fitPin(
  sec: HTMLElement,
  pin: HTMLElement,
  varName: string,
  floor: number,
): { fit: number; over: number } {
  sec.style.setProperty(varName, '1')
  // `.is-fitting` parks every entrance transform for the duration of the
  // measurement. getBoundingClientRect reports the TRANSFORMED box, and these
  // stages start their content translated down by 16-26px — measuring through
  // that reads the offset as content and shrinks the type to make room for a
  // gap that is not there (education came out at 0.76 on a 1366x670 laptop
  // when 0.93 was the honest answer). Nothing paints between the class going
  // on and coming off: it is all one synchronous task.
  sec.classList.add('is-fitting')
  const cs = getComputedStyle(pin)
  const availH = pin.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  let fit = 1
  let over = 0
  if (availH > 0) {
    for (let i = 0; i < 5; i++) {
      over = pinOverflowPx(pin)
      if (over <= 0) break
      // Shrink by the ratio the content needs, with a hair of slack so a
      // sub-pixel residue doesn't cost another whole pass.
      fit = Math.max(floor, (fit * availH * 0.99) / (availH + over))
      sec.style.setProperty(varName, fit.toFixed(4))
      if (fit === floor) break
    }
    // Re-read after the last write, unconditionally: the loop's `over` is
    // always the value BEFORE that pass's shrink, so exiting on the iteration
    // cap (or on the floor) would otherwise hand the caller a stale positive
    // and un-pin a stage that had just been made to fit.
    over = pinOverflowPx(pin)
  }
  sec.classList.remove('is-fitting')
  // `over` is the residual AT the returned fit: callers use it to decide
  // whether the floor was enough or the stage has to give up the pin.
  return { fit, over }
}

let scrollSpy: IntersectionObserver | null = null
// Late scroll-to-top nudges fired from onMounted — see the note at their
// scheduling site for why they have to be cancellable.
let pinTopTimers: number[] = []
let pinTopLoadListener: (() => void) | null = null
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
  // The contact block IS the page footer (<footer id="contact">), so the nav
  // item and the scroll-spy target are the same element every other section
  // already uses — no extra anchor, no duplicated contact details.
  contact: 'contact',
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
  // Published for CSS: the signature is a sibling of the frame, not a child,
  // and on phones the frame is sized from the stage's leftover height — so a
  // vw-based signature drifts from 80% of the portrait to 100% of it as the
  // browser chrome shows and hides. One write per measure, not per frame.
  //
  // --hs-slot-cy is the frame's CENTRE, measured from the top of the sticky
  // stage. The signature box is `inset: 0` on #intro-message, so it centres
  // on the whole stage — but the frame centres inside .im-stage, the row
  // between .im-top and .im-foot. On desktop .im-foot is absolutely
  // positioned so those two centres nearly coincide and the drift is
  // invisible. On a phone the foot is in flow (see the .hs-page2 rules), so
  // .im-stage is a short box high up the screen and the signature landed
  // ~75px below the portrait it is supposed to be scrawled across — hanging
  // off the bottom edge of the plate. Anchor it to the real frame instead.
  sticky.style.setProperty('--hs-slot-w', `${Math.round(sRect.width)}px`)
  sticky.style.setProperty('--hs-slot-h', `${Math.round(sRect.height)}px`)
  sticky.style.setProperty('--hs-slot-cy', `${Math.round(heroSlotRect.y + sRect.height / 2)}px`)
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

  // visibleW/H = the trimmed window that lands exactly inside the slot, and
  // cropOffX/Y is where that window sits in the hero viewport.
  let visibleW: number
  let visibleH: number
  let cropOffX: number
  let cropOffY: number

  if (isCompactViewport()) {
    // Portrait slot: frame the SUBJECT, not a fraction of the viewport.
    //
    // The old compact path divided the viewport by a flat 1.05 and placed the
    // window at 47% of the leftover height — numbers fitted by eye against a
    // hero render where the face filled the whole screen, so any window was
    // full of face. Once the hero gained its portrait cap the figure moved
    // down and shrank, and those same numbers started catching the empty
    // space above the head: the landed plate grew a dead grey band across its
    // top half with the chin clipped off the bottom.
    //
    // Ask the shared framing module where the head actually is instead. This
    // is now correct for any hero framing, and for any viewport shape.
    const sub = heroSubjectBox(heroVpW, heroVpH)
    visibleW = sub.headW / COMPACT_HEAD_W_FRAC
    visibleH = visibleW / targetAR
    // Never sample outside the hero — past that the shader is clamping edge
    // pixels and the plate would land with a smear down one side.
    if (visibleW > heroVpW) { visibleW = heroVpW; visibleH = visibleW / targetAR }
    if (visibleH > heroVpH) { visibleH = heroVpH; visibleW = visibleH * targetAR }
    const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))
    cropOffX = clamp(sub.headCX - visibleW / 2, heroVpW - visibleW)
    cropOffY = clamp(sub.crownY - visibleH * COMPACT_CROWN_HEADROOM, heroVpH - visibleH)
  } else {
    // Wide slot — unchanged. Dividing by characterSize > 1 enlarges the
    // character at landing (smaller visible source × larger scale = bigger
    // image inside the slot).
    visibleW = cropW / heroZoom.characterSize
    visibleH = cropH / heroZoom.characterSize
    cropOffX = (heroVpW - visibleW) * heroZoom.cropX
    cropOffY = (heroVpH - visibleH) * heroZoom.cropY
  }

  const scaleEnd = slotW / visibleW

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
// Settle beat between the doors finishing and the story starting — the
// reveal lands and the character is simply there for a moment before any
// type moves. The long "discover the head-follow" hold that used to live
// here is now the first narrative state's own dead zone.
const DOOR_DWELL_VH  = 40
// Three story states. One state per ~100vh: ~72vh of held, unmoving type
// and ~28vh of handover, which is roughly one and a half wheel notches —
// fast enough to feel authored, slow enough to read.
const NARRATIVE_VH   = 300
const DRIVER_VH =
  100 + HERO_BUDGET_VH + DOOR_BUDGET_VH + DOOR_DWELL_VH + NARRATIVE_VH

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
  const TRAVEL_VH = HERO_BUDGET_VH + DOOR_BUDGET_VH + DOOR_DWELL_VH + NARRATIVE_VH
  const heroBudgetPx = travel * (HERO_BUDGET_VH / TRAVEL_VH)
  const doorBudgetPx = Math.max(1, travel * (DOOR_BUDGET_VH / TRAVEL_VH))
  const dwellPx      = travel * (DOOR_DWELL_VH / TRAVEL_VH)
  const narrBudgetPx = Math.max(1, travel * (NARRATIVE_VH / TRAVEL_VH))
  return { scrolled, heroBudgetPx, doorBudgetPx, dwellPx, narrBudgetPx, travel }
}

function onHeroScroll() {
  const g = stageGeom()
  if (!g) return
  heroProgressTarget = Math.min(1, g.scrolled / Math.max(1, g.heroBudgetPx))
  // Door split scrubs through the runway segment right after the hero
  // budget. Pure position → progress mapping; reverse scroll closes them.
  doorProgressTarget = Math.min(1, Math.max(0, (g.scrolled - g.heroBudgetPx) / g.doorBudgetPx))
  characterDoorRef.value = doorProgressTarget > 0.05
  // Narrative segment starts after the doors have opened and settled — but the
  // dwell before it is a signed LEAD-IN, not a dead zone. `p` runs -1 → 0
  // across the dwell and 0 → 1 across the narrative, so the first story state
  // writes itself on during the settle beat. Flooring it at 0 (as this used to)
  // froze that state's last lines mid-reveal — half-masked and dimmed — for the
  // whole door open, then snapped them into place once the narrative started.
  const narrScrolled = g.scrolled - g.heroBudgetPx - g.doorBudgetPx - g.dwellPx
  narrProgressTarget = narrScrolled >= 0
    ? Math.min(1, narrScrolled / g.narrBudgetPx)
    : Math.max(-1, narrScrolled / Math.max(1, g.dwellPx))
  // Every scroll event re-arms the settle: it fires only once they stop.
  if (narrProgressTarget !== settleLastP) {
    if (settleLastP >= -1) settleDir = narrProgressTarget >= settleLastP ? 1 : -1
    settleLastP = narrProgressTarget
  }
  settleSchedule()
  if (heroRafId === null) {
    heroRafId = requestAnimationFrame(heroLoop)
  }
  if (doorRafId === null) {
    doorRafId = requestAnimationFrame(doorLoop)
  }
  if (narrRafId === null) {
    narrRafId = requestAnimationFrame(narrLoop)
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

// Narrative scrub. Lighter smoothing than the door (0.22 vs 0.16) — the
// type should feel tied to the wheel, while the gate has weight. The value is
// handed to <HeroNarrative>, which owns the Motion bindings; nothing here
// touches Vue reactivity, because a re-render would kill them (see the note
// at the top of HeroNarrative.vue).
const heroNarrativeRef = ref<{
  publish: (p: number) => void
  reset: () => void
  handoverBands: [number, number][]
} | null>(null)
let narrRafId: number | null = null
// -1 is the floor, not 0: the dwell maps onto [-1, 0] as the first state's
// lead-in (see onHeroScroll), so "nothing revealed yet" is -1.
let narrProgress = -1
let narrProgressTarget = -1

function narrLoop() {
  narrRafId = null
  const diff = narrProgressTarget - narrProgress
  if (Math.abs(diff) > 0.0005) {
    narrProgress += diff * 0.22
    heroNarrativeRef.value?.publish(narrProgress)
    narrRafId = requestAnimationFrame(narrLoop)
  } else {
    narrProgress = narrProgressTarget
    heroNarrativeRef.value?.publish(narrProgress)
  }
}

// ── slide settle ────────────────────────────────────────────────────────────
// The story is a scrub, so every position in it is reachable — including the
// middle of a handover, where one state is half gone and the next half
// arrived. That composition was only ever meant to be passed through, and
// nothing on screen tells a reader who stopped there how much further it
// costs to finish, so they are left holding a broken frame wondering whether
// the page is stuck.
//
// So when scrolling stops inside a handover, the page carries it the rest of
// the way: scroll on to whichever end of the band is nearer, biased toward the
// direction of travel, and let the ordinary scrub play the rest at its
// authored speed. NOTHING about the animation changes — not its length, not
// its shape, not its reversibility. The only thing this decides is where the
// page is allowed to come to rest. Outside the bands it never fires at all.
//
// HeroNarrative owns the band positions, because they fall out of the same
// windows the choreography is authored in (see `handoverBands` there).
const SETTLE_IDLE_MS    = 150   // quiet time that counts as "stopped scrolling"
// Fraction of the band that commits you onward. Deliberately below half when
// travelling forward: a reader who has already started the move usually meant
// to make it, and pulling them backwards past type that has begun to leave
// reads as the page refusing the scroll.
const SETTLE_BIAS       = 0.35
const SETTLE_MARGIN_P   = 0.02  // land this far clear of the band edge
const SETTLE_DEADBAND_P = 0.01  // already this close to the edge: leave it be

let settleTimerId: number | null = null
let settleTouching = false
// Direction of travel, from the last progress change — a settle should finish
// the move the reader was making, not average over both.
let settleDir = 1
let settleLastP = -1

function settleCancel() {
  if (settleTimerId !== null) clearTimeout(settleTimerId)
  settleTimerId = null
}

function settleSchedule() {
  settleCancel()
  settleTimerId = window.setTimeout(settleRun, SETTLE_IDLE_MS)
}

function settleRun() {
  settleTimerId = null
  // A finger still on the glass is not a reader who has stopped — iOS is
  // mid-gesture and would fight the programmatic scroll.
  if (settleTouching) return
  // This moves the page on the reader's behalf, which is exactly the kind of
  // motion the preference opts out of.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const bands = heroNarrativeRef.value?.handoverBands
  const driver = heroDriverRef.value
  if (!bands || !driver) return
  const g = stageGeom()
  if (!g) return
  const p = narrProgressTarget
  if (p <= 0 || p >= 1) return
  for (const [a, b] of bands) {
    if (p <= a || p >= b) continue
    const through = (p - a) / (b - a)
    const onward = through >= (settleDir >= 0 ? SETTLE_BIAS : 1 - SETTLE_BIAS)
    const to = onward ? Math.min(1, b + SETTLE_MARGIN_P) : Math.max(0, a - SETTLE_MARGIN_P)
    if (Math.abs(to - p) < SETTLE_DEADBAND_P) return
    const driverTop = driver.getBoundingClientRect().top + window.scrollY
    const y = driverTop + g.heroBudgetPx + g.doorBudgetPx + g.dwellPx + to * g.narrBudgetPx
    // Native smooth scroll, so a wheel or a swipe interrupts it the way it
    // interrupts any other programmatic scroll — the reader always wins.
    window.scrollTo({ top: Math.round(y), behavior: 'smooth' })
    return
  }
}

// Touch is the one input that can be mid-gesture while the page is perfectly
// still, so the settle has to be told about the finger explicitly.
function onSettleTouchStart() {
  settleTouching = true
  settleCancel()
}
function onSettleTouchEnd() {
  settleTouching = false
  settleSchedule()
}

// ────────────────────────────────────────────────────────────────────
// Pinned staged sections (Education / Experience) + scroll-entrance
// reveal choreography. Ported from the claude.ai/design prototype
// (portfolio.html + reveal.js). Each setup returns a cleanup fn.
// ────────────────────────────────────────────────────────────────────
const eduRef = ref<HTMLElement | null>(null)
const xpRef = ref<HTMLElement | null>(null)
const sectionCleanups: (() => void)[] = []

// Campus photo scrub. It rides in on the same beat as the records strip —
// slightly behind it, so the stat cells land first and the photo is the
// closing note rather than a second thing competing for the same moment.
// Past the landing it keeps drifting a few pixels up and settles a degree
// off-square, which is what stops a pinned still frame from looking frozen
// while the reader is still scrolling through it.
const EDU_PHOTO_IN: [number, number] = [0.44, 0.66]
const eduPhotoOpacity = transform([EDU_PHOTO_IN[0], 0.60], [0, 1], { clamp: true })
const eduPhotoY = transform([EDU_PHOTO_IN[0], EDU_PHOTO_IN[1], 1], [44, 0, -14], { clamp: true })
const eduPhotoScale = transform([EDU_PHOTO_IN[0], EDU_PHOTO_IN[1]], [0.9, 1], { clamp: true })
const eduPhotoRot = transform([EDU_PHOTO_IN[0], EDU_PHOTO_IN[1], 1], [-6, 0, 1.4], { clamp: true })

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
  let headIn = false, stageName = false, stageDetails = false, prog = 0

  const pin = sec.querySelector<HTMLElement>('.edu-pin')
  const photo = sec.querySelector<HTMLElement>('.edu-photo')
  const detailsEl = sec.querySelector<HTMLElement>('.edu-details')
  // Everything that owns horizontal space beside the photo's side slot. The
  // display lines are `width: max-content`, but the heading, degree and honour
  // lines are full-width blocks, so their box tells us nothing — a Range over
  // the contents gives the real ink extent of each.
  const spanEls = Array.from(
    sec.querySelectorAll<HTMLElement>(
      '.section-num, .section-title, .edu-name-line, .edu-name-meta, .edu-degree, .edu-gold',
    ),
  )
  // The records block is a ruled box, not loose type — its border is the edge
  // to clear, so it is measured by box and not by ink.
  const stripEl = sec.querySelector<HTMLElement>('.edu-strip')
  const measureRange = typeof document !== 'undefined' ? document.createRange() : null

  // Breathing room the photo keeps from the type, the upward drift it is
  // allowed at the end of the scrub, and the size band outside which it stops
  // being a photograph and becomes either a stamp or the whole section. The
  // asset is a bordered polaroid, so roughly a third of its box is frame —
  // under ~160px the picture inside is smaller than a favicon, which is why
  // phone widths (where the pinned stack already fills the screen) drop it
  // rather than shrink it.
  const PHOTO_GAP = 28
  const PHOTO_DRIFT = 16
  const PHOTO_MIN = 160
  const PHOTO_MAX = 560

  function inkRight(el: HTMLElement) {
    if (!measureRange) return el.getBoundingClientRect().right
    measureRange.selectNodeContents(el)
    const box = measureRange.getBoundingClientRect()
    return box.width ? box.right : el.getBoundingClientRect().right
  }

  /**
   * Park the photo in the largest square the pinned type leaves unused, and
   * hide it when that square would be too small to read as a photograph.
   * Two candidate slots, both flush to the right edge of the text column:
   *
   *   side  — the full-height column to the right of everything, bounded by
   *           the widest line of type or the records block. Wins on wide
   *           viewports, where the name is the only wide thing on the page.
   *   below — the band under the records strip, down to the pin's padding.
   *           Wins on tall viewports (tablet portrait), where the pinned
   *           stack leaves a third of the screen empty at the bottom.
   *
   * Everything is measured against the pin's own box, so the result does not
   * change while the pin is stuck and this only has to run on resize.
   */
  function fitPhoto() {
    if (!photo || !pin || !detailsEl) return
    const pinBox = pin.getBoundingClientRect()
    const cs = getComputedStyle(pin)
    const padR = parseFloat(cs.paddingRight) || 0
    const padB = parseFloat(cs.paddingBottom) || 0
    const contentRight = pinBox.right - padR
    const contentLeft = pinBox.left + (parseFloat(cs.paddingLeft) || 0)
    const contentTop = pinBox.top + (parseFloat(cs.paddingTop) || 0)
    const detailsBox = detailsEl.getBoundingClientRect()

    let typeRight = contentLeft
    for (const el of spanEls) typeRight = Math.max(typeRight, inkRight(el))
    if (stripEl) typeRight = Math.max(typeRight, stripEl.getBoundingClientRect().right)

    const contentBottom = pinBox.bottom - padB
    const sideW = contentRight - (typeRight + PHOTO_GAP)
    const sideH = contentBottom - PHOTO_DRIFT - contentTop
    const side = Math.min(sideW, sideH)

    const belowTop = detailsBox.bottom + PHOTO_GAP + PHOTO_DRIFT
    const belowH = contentBottom - belowTop
    // Half the column, or a tablet's empty bottom third turns into a poster.
    const below = Math.min(belowH, (contentRight - contentLeft) * 0.5)

    const size = Math.min(PHOTO_MAX, Math.max(side, below))
    if (size < PHOTO_MIN) {
      photo.hidden = true
      return
    }
    photo.hidden = false
    const useSide = side >= below
    const top = useSide
      ? contentTop + (contentBottom - contentTop - size) / 2
      : belowTop + (contentBottom - belowTop - size) / 2
    photo.style.setProperty('--ep-size', `${Math.round(size)}px`)
    photo.style.setProperty('--ep-x', `${Math.round(contentRight - size - pinBox.left)}px`)
    photo.style.setProperty('--ep-y', `${Math.round(top - pinBox.top)}px`)
  }

  // Rounded-then-compared like every other scrub on this page: a style write
  // that renders identically still costs a recalc, and this one shares a frame
  // with three other pinned sections.
  let lastOpacity = -1, lastTransform = ''
  function writePhoto() {
    if (!photo || photo.hidden) return
    const o = Math.round(eduPhotoOpacity(prog) * 1000) / 1000
    if (o !== lastOpacity) {
      lastOpacity = o
      photo.style.opacity = `${o}`
    }
    const t = `translate3d(0, ${eduPhotoY(prog).toFixed(1)}px, 0) `
      + `rotate(${eduPhotoRot(prog).toFixed(2)}deg) `
      + `scale(${eduPhotoScale(prog).toFixed(3)})`
    if (t !== lastTransform) {
      lastTransform = t
      photo.style.transform = t
    }
  }

  function readScroll() {
    const rect = sec!.getBoundingClientRect()
    const range = rect.height - innerHeight
    const p = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 1
    headIn = rect.top < innerHeight * 0.92
    stageName = p >= 0.14
    stageDetails = p >= 0.48
    prog = p
  }
  function write() {
    raf = 0
    if (!sec!.classList.contains('edu-staged')) return
    sec!.classList.toggle('head-in', headIn)
    sec!.classList.toggle('stage-name', stageName)
    sec!.classList.toggle('stage-details', stageDetails)
    writePhoto()
  }
  function onScroll() {
    readScroll()
    if (!raf) raf = requestAnimationFrame(write)
  }
  // Coalesced to one frame: apply() walks the pinned subtree with
  // getComputedStyle, and `resize` fires on every frame of a window drag (and
  // on every URL-bar nudge on mobile). One measurement per frame is plenty.
  let fitRaf = 0
  function onResize() {
    if (fitRaf) return
    fitRaf = requestAnimationFrame(() => { fitRaf = 0; apply() })
  }

  // Education was the one pinned stage with no viewport gate at all — it staged
  // on every phone, and the pin is `overflow: hidden` at one viewport tall, so
  // a short screen simply swallowed whatever ran past the bottom. Measured, not
  // guessed at with a breakpoint: 375x553 lost 154px (the entire records strip
  // — CPI, Dean's List, Honour, Duration), 360x640 lost 95px, 844x390 lost
  // 175px. The type scales down first; if even the floor can't buy the room,
  // the section drops the pin and renders as ordinary flow, which shows all of
  // the content and none of the choreography — the right trade on a phone.
  const EDU_FIT_FLOOR = 0.7

  function apply() {
    const wanted = !mqMotion.matches
    sec!.classList.toggle('edu-staged', wanted)
    let on = wanted
    if (wanted && pin) {
      const { over } = fitPin(sec!, pin, '--edu-fit', EDU_FIT_FLOOR)
      // Tolerance, not zero: sub-pixel residue and a stray rounding px are not
      // worth throwing away the whole staged reveal, and a knife-edge test
      // would let the stage flap in and out of the pin across a drag-resize.
      if (over > PIN_GIVE_UP_PX) {
        on = false
        sec!.classList.remove('edu-staged')
        sec!.style.removeProperty('--edu-fit')
      }
    } else {
      sec!.style.removeProperty('--edu-fit')
    }
    fitPhoto()
    if (on) {
      addEventListener('scroll', onScroll, { passive: true })
      onScroll()
    } else {
      removeEventListener('scroll', onScroll)
      sec!.classList.remove('stage-name', 'stage-details', 'head-in')
      // Reduced motion keeps the photo, drops the scrub — hand it back to CSS.
      if (photo) {
        photo.style.opacity = ''
        photo.style.transform = ''
      }
      lastOpacity = -1
      lastTransform = ''
    }
  }
  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', onResize, { passive: true })
  // The slot is bounded by where the display type ends, so it can only be
  // measured once the real face is swapped in for the fallback metrics.
  //
  // `alive` because this resolves on the font pipeline's schedule, not ours: a
  // route change before the faces land would otherwise run apply() on a
  // detached section AFTER teardown, re-attaching the scroll listener for good
  // — a permanent handler measuring an element that is no longer in the page.
  let alive = true
  document.fonts?.ready.then(() => { if (alive) onResize() }).catch(() => {})
  apply()
  return () => {
    alive = false
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', onResize)
    measureRange?.detach()
    if (raf) cancelAnimationFrame(raf)
    if (fitRaf) cancelAnimationFrame(fitRaf)
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

  // `innerHeight > 620` gates the pin, but clearing that bar is not the same
  // as fitting inside it: at 1366x670 — the single most common laptop
  // resolution — 78px of the stats panel rendered past the pin's
  // `overflow: hidden` edge, so the last row of every role card was simply
  // gone. The three panels are stacked in one grid cell, so the measurement
  // below covers all of them at once and the scale that lands is the one the
  // WORST panel needs; switching employers can't reveal a clip.
  const XP_FIT_FLOOR = 0.72

  const pin = sec.querySelector<HTMLElement>('.xp-pin')

  function apply() {
    let on = !mqMotion.matches && innerWidth > 880 && innerHeight > 620
    sec!.classList.toggle('xp-staged', on)
    if (on && pin) {
      const { over } = fitPin(sec!, pin, '--xp-fit', XP_FIT_FLOOR)
      if (over > PIN_GIVE_UP_PX) {
        on = false
        sec!.classList.remove('xp-staged')
      }
    }
    if (!on) sec!.style.removeProperty('--xp-fit')
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
  // Coalesced to one frame — apply() now measures the pinned subtree, and
  // `resize` fires once per frame while a window is being dragged.
  let fitRaf = 0
  function onResize() {
    if (fitRaf) return
    fitRaf = requestAnimationFrame(() => { fitRaf = 0; apply() })
  }
  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', onResize, { passive: true })
  // The fit is a wrap measurement, and wrapping moves when the real face lands
  // — Inter's fallback metrics under-count a line or two in the role panel.
  // `alive` guards the same post-teardown re-attach described in the education
  // pin above: apply() adds the scroll listener, so a late resolve after a
  // route change leaks it permanently.
  let alive = true
  document.fonts?.ready.then(() => { if (alive) apply() }).catch(() => {})
  apply()
  return () => {
    alive = false
    mqMotion.removeEventListener?.('change', apply)
    removeEventListener('resize', onResize)
    removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
    if (fitRaf) cancelAnimationFrame(fitRaf)
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
const charState = reactive({
  ready: false,
  busy: false,
  pushing: false,
  active: null as string | null,
})
// Both refs are declared with the async components at the top of this file —
// see the note there for why the decision is made in one place.
function onCharFailed() {
  charFailed.value = true
}

function onCharState(s: { ready: boolean; busy: boolean; pushing: boolean; active: string | null }) {
  charState.ready = s.ready
  charState.busy = s.busy
  charState.pushing = s.pushing
  charState.active = s.active
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

  /**
   * Height of the copy itself, first child's top to last child's bottom.
   *
   * NOT `body.scrollHeight`, which is what the fit loop used to read and the
   * reason --sum-fit never actually did anything: while staged, `.body` is a
   * stretched grid item that centres its content, so its scroll height is its
   * OWN height — always exactly the pin's available height, never the copy's.
   * The old ratio step therefore multiplied by availH/need = 0.995 on every
   * pass regardless of viewport and landed on 0.985 everywhere, while the real
   * shrinking was done by a `max-height: 840px` media query that jumped the
   * body from 17.6px to 14.9px in one step between a 15" laptop and a 13".
   *
   * offsetTop/offsetHeight, not rects: both are layout positions, so the
   * scrub's live translate on `.body` and the sticky offset on `.section-num`
   * are both invisible here, and the same measurement holds mid-push.
   */
  function copyH(): number {
    let first: HTMLElement | null = null
    let last: HTMLElement | null = null
    for (let c = body!.firstElementChild; c; c = c.nextElementSibling) {
      const el = c as HTMLElement
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue
      if (!first) first = el
      last = el
    }
    if (!first || !last) return 0
    return last.offsetTop + last.offsetHeight - first.offsetTop
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
    // sat within 1px of doing the same.
    //
    // BISECTION, not a proportional step. The old three-pass ratio assumed
    // height falls in proportion to `fit`, which stopped being true once the
    // fit also drives the leading and cancels the `ch`-relative measure cap:
    // height now falls FASTER than fit, so a ratio step overshoots, and the
    // loop only ever shrank — an overshoot could never be given back, leaving
    // the copy a size or two smaller than the pin could actually hold. A
    // bisection converges on the largest fit that still lands, from either
    // side, in a fixed 7 reflows.
    const pinCS = getComputedStyle(pin!)
    const availH =
      pin!.clientHeight - parseFloat(pinCS.paddingTop) - parseFloat(pinCS.paddingBottom)
    // 0.7 floor: past that the copy is unreadable and clipping is the lesser
    // evil — but nothing we can render on a staged desktop gets near it.
    const FIT_FLOOR = 0.7
    let fit = 1
    sec!.style.setProperty('--sum-fit', '1')
    if (availH > 0 && copyH() > availH) {
      let lo = FIT_FLOOR
      let hi = 1
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2
        sec!.style.setProperty('--sum-fit', mid.toFixed(4))
        if (copyH() <= availH) lo = mid
        else hi = mid
      }
      fit = lo
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

  /**
   * Light the copy as one block while pinned.
   *
   * setupReveal() observes `#summary .body p` individually against a root
   * inset 8% from the viewport bottom, and `.rv` parks each paragraph ~24px
   * BELOW its layout position until it fires. In a flow section that always
   * resolves — scroll further and the element climbs into range. In this pin
   * it does not: the stage holds one screen and never advances past it, so a
   * closing paragraph that lands near the floor sits in that dead band
   * permanently, at opacity 0, on a stage where the fit measurement says it
   * fits perfectly well. Reveal the block with the stage instead; the
   * per-paragraph stagger still runs everywhere the section is in flow.
   */
  function revealCopy() {
    if (!sumStaged.value) return
    sec!.querySelectorAll('.body p.rv').forEach((p) => p.classList.add('rv-in'))
  }

  // Entrance: fire his jump-in once the section scrolls into view. Trigger
  // is viewport-based (top crosses 65% of the viewport), not a ratio
  // threshold — the section is several viewports tall, so its max
  // intersection ratio is well under any useful threshold value.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      if (!mqMotion.matches) summaryCharRef.value?.enter?.()
      revealCopy()
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
      // Covers the enable-while-already-in-view case (a resize across the
      // staging breakpoint), where the entrance observer has long since fired
      // and disconnected.
      if (sec!.getBoundingClientRect().top < innerHeight) revealCopy()
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
  // `alive`, not just `sumStaged`: sumStaged is a ref that outlives teardown,
  // so a late font-swap resolve would measure a detached section and schedule
  // a rAF against it.
  let alive = true
  const remeasure = () => {
    if (!alive || !sumStaged.value) return
    measure()
    onScroll()
  }
  remeasureSummary = remeasure

  mqMotion.addEventListener?.('change', apply)
  addEventListener('resize', apply, { passive: true })
  apply()
  // Web-font swap reflows the text column — re-measure once fonts settle.
  document.fonts?.ready?.then(remeasure).catch(() => {})
  return () => {
    alive = false
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

  // Node-dots resolved once — `li.querySelector('.nd')` inside the frame loop
  // was a tree walk per bullet per frame, for the life of the rail.
  const nds = lis.map((li) => li.querySelector('.nd'))
  // Scratch arrays, reused every frame so the loop allocates nothing.
  const entryTops: number[] = new Array(entries.length)
  const liTops: number[] = new Array(lis.length)

  const frame = () => {
    // ── READ phase ──────────────────────────────────────────────────────
    // Every rect is taken BEFORE the first style write. Interleaving them
    // (which this did) forces a synchronous layout per element per frame:
    // the `tip.style.height` write dirties layout, and the very next
    // getBoundingClientRect has to flush it — then each classList.toggle
    // dirties it again for the following read. With this rail's entries and
    // bullets that was dozens of forced reflows every frame while the
    // section is on screen, which is the whole cost of the effect.
    const r = wrap.getBoundingClientRect()
    const t = motionOK
      ? Math.max(0, Math.min(r.height, window.innerHeight * 0.72 - r.top))
      : r.height
    for (let i = 0; i < entries.length; i++) {
      entryTops[i] = entries[i].getBoundingClientRect().top - r.top
    }
    for (let i = 0; i < lis.length; i++) {
      liTops[i] = lis[i].getBoundingClientRect().top - r.top
    }

    // ── WRITE phase ─────────────────────────────────────────────────────
    tip.style.height = `${t}px`

    entries.forEach((e, i) => {
      e.classList.toggle('on', t >= entryTops[i] + 8)
    })
    lis.forEach((li, i) => {
      const nd = nds[i]
      const y = liTops[i] + 12
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
  // The frame above is a pure function of scroll position and layout: given the
  // same scrollY it computes the same rect for every entry and toggles the same
  // classes to the values they already hold. It was nevertheless being run 60
  // times a second for as long as the rail was anywhere near the viewport —
  // including the entire time a reader sits still and actually reads it, which
  // for this section is most of the time it is on screen. Each of those frames
  // walked every entry and every bullet with getBoundingClientRect, forcing a
  // layout flush per tick to recompute a picture that had not changed.
  //
  // Watching scrollY costs one property read and skips all of it when nothing
  // moved. `dirty` covers the cases where the geometry changes underneath a
  // stationary scroll position — a resize, or the observer waking the loop.
  let lastY = Number.NaN
  let dirty = true
  const invalidate = () => { dirty = true }
  window.addEventListener('resize', invalidate)
  const loop = () => {
    const y = window.scrollY
    if (dirty || y !== lastY) {
      dirty = false
      lastY = y
      frame()
    }
    raf = requestAnimationFrame(loop)
  }

  /* run the rAF loop only while the rail is near the viewport */
  const railIO = new IntersectionObserver(
    (es) => {
      const en = es[es.length - 1]
      if (en.isIntersecting) {
        // Geometry may have moved while the loop slept — force one frame.
        if (raf == null) { dirty = true; raf = requestAnimationFrame(loop) }
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
    window.removeEventListener('resize', invalidate)
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
  // Tracked so teardown can cancel them: a route change inside the first 200ms
  // (the nav is one click away and these are deliberately late) would otherwise
  // fire pinTop against the page the user just navigated TO, yanking it to the
  // top after it had already restored its own scroll position.
  pinTopTimers = [
    window.setTimeout(pinTop, 0),
    window.setTimeout(pinTop, 60),
    window.setTimeout(pinTop, 200),
  ]
  if (document.readyState !== 'complete') {
    pinTopLoadListener = pinTop
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
  window.addEventListener('touchstart', onSettleTouchStart, { passive: true })
  window.addEventListener('touchend', onSettleTouchEnd, { passive: true })
  window.addEventListener('touchcancel', onSettleTouchEnd, { passive: true })
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
  pinTopTimers.forEach((id) => clearTimeout(id))
  pinTopTimers = []
  if (pinTopLoadListener) window.removeEventListener('load', pinTopLoadListener)
  pinTopLoadListener = null
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
  window.removeEventListener('touchstart', onSettleTouchStart)
  window.removeEventListener('touchend', onSettleTouchEnd)
  window.removeEventListener('touchcancel', onSettleTouchEnd)
  settleCancel()
  settleTouching = false
  settleLastP = -1
  settleDir = 1
  window.removeEventListener('resize', measureHeroSlot)
  window.removeEventListener('resize', syncTopbarH)
  heroResizeObs?.disconnect()
  heroResizeObs = null
  if (heroRafId !== null) cancelAnimationFrame(heroRafId)
  heroRafId = null
  if (doorRafId !== null) cancelAnimationFrame(doorRafId)
  doorRafId = null
  if (narrRafId !== null) cancelAnimationFrame(narrRafId)
  narrRafId = null
  // Reset stage state — module-scope vars otherwise leak across remounts
  // (HMR, route re-entry).
  doorProgress = 0
  doorProgressTarget = 0
  doorProgressRef.value = 0
  characterDoorRef.value = false
  heroProgress = 0
  heroProgressTarget = 0
  narrProgress = -1
  narrProgressTarget = -1
  heroNarrativeRef.value?.reset()
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
      <a href="#contact" data-section="contact"><span class="nav-num">07</span><span class="nav-label">Contact</span></a>
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
            v-if="(characterVisible || characterDoorRef) && !heroCharFailed"
            class="cr-character"
            :camera-zoom="1.25"
            :paused="doorProgressRef < 0.001"
            @failed="heroCharFailed = true"
          />
          <!-- Two different reasons to be here, and only one of them is
               permanent: he is either still warming up (empty — the stage
               gradient and beams are the composition until he arrives) or he
               cannot run on this browser at all, in which case the door
               reveal opens onto a still of him instead of onto nothing. -->
          <div v-else class="cr-character-placeholder" aria-hidden="true">
            <img
              v-if="heroCharFailed"
              class="cr-character-still"
              :src="characterStillHero"
              alt=""
              decoding="async"
            />
          </div>
          <!-- Three scroll-scrubbed story states. Its own component so that
               Portfolio.vue re-renders can't tear down its Motion bindings —
               see the note at the top of HeroNarrative.vue. -->
          <HeroNarrative ref="heroNarrativeRef" :interactive="!heroCharFailed" />
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
          <strong>Mechanical engineer.</strong> Operations &amp; program build, hands-on.
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
          href="https://drive.google.com/file/d/1W8abM5sJ6BVXS1KqIZ5JRKKrd6G46_QR/view?usp=drive_link"
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
          <SummaryCharacter v-if="summaryNear && !charFailed" ref="summaryCharRef" :show-actions="!sumStaged" @state="onCharState" @metrics="onCharMetrics" @failed="onCharFailed" />
          <!-- No rig on this browser. The plinth keeps a person on it — the
               same pose, framed the way the camera framed it — rather than
               leaving a column of white beside the copy. -->
          <img
            v-else-if="charFailed"
            class="sum-char-still"
            :src="characterStillSummary"
            alt=""
            aria-hidden="true"
            decoding="async"
          />
        </div>
        <!-- The panel drives the character's clips, so it is meaningless
             without him. When the rig fails to load (see onCharFailed) it is
             dropped rather than left sitting there permanently un-lit, which
             read as a broken page rather than an absent decoration. -->
        <div
          v-if="sumStaged && !charFailed"
          class="summary-actions"
          :class="{ 'is-live': charState.ready }"
          aria-label="Character actions"
        >
          <!-- Bordered control surface: four loose icon circles on white paper
               read as decoration. A panel with a lime edge reads as something
               you operate. -->
          <div class="sum-act-panel">
            <span class="sum-act-hint"><span class="sum-act-bar" aria-hidden="true"></span>Make him move — switch anytime</span>
            <div class="sum-act-row">
              <button type="button" class="sum-act" :class="{ 'is-active': charState.active === 'jump' }" :aria-pressed="charState.active === 'jump'" style="--i: 0" :disabled="charState.pushing" @click="playCharAction('jump')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
                  </svg>
                </span>
                <span class="sum-act-label">Jump</span>
              </button>
              <button type="button" class="sum-act" :class="{ 'is-active': charState.active === 'back_flip' }" :aria-pressed="charState.active === 'back_flip'" style="--i: 1" :disabled="charState.pushing" @click="playCharAction('back_flip')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 1 3.6 7.2" /><path d="M3 22v-6h6" />
                  </svg>
                </span>
                <span class="sum-act-label">Flip</span>
              </button>
              <button type="button" class="sum-act" :class="{ 'is-active': charState.active === 'dancing' }" :aria-pressed="charState.active === 'dancing'" style="--i: 2" :disabled="charState.pushing" @click="playCharAction('dancing')">
                <span class="sum-act-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </span>
                <span class="sum-act-label">Dance</span>
              </button>
              <button type="button" class="sum-act" :class="{ 'is-active': charState.active === 'push_ups' }" :aria-pressed="charState.active === 'push_ups'" style="--i: 3" :disabled="charState.pushing" @click="playCharAction('push_ups')">
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

        <!-- Campus photo. Absolutely positioned and measured into whatever
             space the type leaves over (see setupEducationPin → fitPhoto), so
             it cannot reflow, resize or re-wrap a single existing line. -->
        <figure class="edu-photo" hidden>
          <img
            :src="iitgnCampusImg"
            width="550"
            height="550"
            loading="lazy"
            decoding="async"
            alt="IIT Gandhinagar campus — the academic block clock tower"
          />
        </figure>
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
              <li><strong>Anchors Elite</strong> — selected among 51 employees across Axis Bank pan-India for exceptional impact and delivery.</li>
              <li><strong>Anchors Team Player</strong> — awarded for high-ownership collaboration and cross-team execution under pressure.</li>
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
          <span class="skill-tag">Blender</span>
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
          <span class="skill-tag">Gemini</span>
          <span class="skill-tag">MCP connections</span>
          <span class="skill-tag">Cursor</span>
          <span class="skill-tag">AI-Assisted Design</span>
          <span class="skill-tag">AI-Assisted Web Development</span>
          <span class="skill-tag">AI-Assisted 3D Modelling</span>
        </div>
      </div>
    </section>
  </main>

  <footer id="contact" class="footer">
    <div class="footer-grid">
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
/* Seven links carry the index numerals to ~1010px of row: at 1240px the row
   was already touching the brand lockup and by 1120px it ran 21px past the
   right gutter — and the shared numerals-drop breakpoint in style.css doesn't
   kick in until 1080. Drop them earlier for THIS nav only; the detail-route
   topbar still carries five links and keeps its numerals down to 1080.
   Bounded below at 721 so the phone sheet, which restores the numerals as
   part of its stacked list, keeps them. */
@media (min-width: 721px) and (max-width: 1300px) {
  .portfolio-topbar .nav-num { display: none; }
  .portfolio-topbar .nav { gap: 0.9rem; flex-wrap: wrap; justify-content: flex-end; }
  .portfolio-topbar .nav-label { font-size: 0.7rem; letter-spacing: 0.1em; }
}
/* 721–900px: the brand lockup and seven links measure the full row within a
   pixel or two, and the overflow lands as a single orphan — at 768 "Contact"
   sat alone on a second line under the other six. Tighter gap and tracking
   (type size unchanged) buy back the ~25px that keeps one row all the way
   down to the sheet breakpoint. */
@media (min-width: 721px) and (max-width: 900px) {
  .portfolio-topbar .nav { gap: 0.5rem; }
  .portfolio-topbar .nav-label { letter-spacing: 0.05em; }
}
@media (max-width: 720px) {
  /* Seven section links wrap to three rows at phone width, so below 720px the
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
  height: calc(var(--hs-driver-vh, 830) * 1vh - var(--topbar-h));
  height: calc(var(--hs-driver-vh, 830) * 1svh - var(--topbar-h));
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
  /* Pin the single row to the stage. Left implicit it is an `auto` row, and
     an auto row GROWS to fit an oversized item — which quietly defeated
     .im-frame's `height: min(calc(100% - 1.25rem), …)` guard, because that
     percentage resolves against the row, not against this box. On a short
     stage the frame would overflow, the row would grow to match, and the
     100% would then measure the grown row: the guard chased its own tail
     and never bound. At 320x516 the stage was 214px, the row 328px, and the
     frame sat 95px past the bottom of its own container, on the caption.
     minmax(0, 1fr) makes the row exactly this element's height and lets it
     shrink below content, so the percentage finally means what it reads. */
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
}
.im-frame {
  position: relative;
  width: clamp(360px, 46vw, 640px);
  aspect-ratio: 3/2;
  z-index: 4;
}
/* Portrait frame on compact viewports — the condition MUST stay
   character-identical to COMPACT_MEDIA in ../heroFraming, which drives the
   matching page-1 crop. Shape, not width: a 768x1024 tablet is wide enough
   to miss a 720px query but far too tall to hold a 24:14 slot, and it was
   landing a strip of eyes where the portrait should be.
   HEIGHT-first, not width-first: a width-driven 3:4 box is 364px tall at
   402px wide, and the stage between .im-top and .im-foot is only ~275px on
   a phone once Safari's chrome is showing (100svh ≈ 700). The frame then
   overflowed downward and the landed portrait sat on top of the caption.
   Sizing from the stage height keeps the ratio exact (so the page-1 crop
   still matches) and guarantees the frame can never outgrow its row. */
@media (min-height: 501px) and (max-width: 720px),
       (min-height: 501px) and (max-aspect-ratio: 4/5) {
  .im-frame {
    /* Largest 3:4 box that fits BOTH the row's height and a share of its
       width. Two terms, both continuous — there is no device breakpoint in
       here and there must not be one: this branch spans everything from a
       320px handset to a 1024px tablet held upright.

       The width term used to be `min(68vw, 320px)`. That hard cap stopped
       the frame growing at ~470px wide, so every viewport above it got the
       same 320px plate in an ever-emptier stage — 57% of the screen at
       560px, 50% at 640, 44% at 720, where it read as a stamp marooned in
       the middle of the page rather than a framed portrait.

       `min(68vw, 30vw + 190px)` is the same idea without the cliff. The two
       lines cross at exactly 500px of viewport, so below that 68vw governs
       and every phone is untouched; above it the frame keeps growing, just
       on a gentler slope, easing to ~49% of the screen by 1024px — close to
       the 44% the wide desktop frame settles at. Smooth all the way: no
       width gets a visibly different treatment from the one next to it.

       The /1.17 on the height term reserves the signature's run-out. The
       plate is not the only thing in this stage: the mark is scrawled past
       its bottom edge on purpose (see the .im-signature rules), and the
       painted tail reaches 8.5% of the plate's height below it. Bare
       `100% - 1.25rem` leaves 10px there, so on any viewport short enough
       for the height term to govern — 320x568, 360x640, 375x667, 500x800 —
       the descender landed across the first line of the caption.
       Centred in the row, room below is (stage - H)/2, so H <= (stage -
       2*margin) / (1 + 2*0.0847) keeps a 10px gap; 1.17 is that divisor.
       It only ever bites where the height term was already the smaller of
       the two, so nothing that fits today changes size. */
    height: min(calc((100% - 1.25rem) / 1.17), calc(min(68vw, 30vw + 190px) * 4 / 3));
    width: auto;
    aspect-ratio: 3/4;
  }
}
/* Short viewport — a handset in landscape, either orientation of narrow.
   The stage between .im-top and .im-foot is only ~170px tall here, so the
   width-driven desktop frame (360px min, 3:2 → 240px tall) could not fit and
   was squeezed by the grid into whatever was left, landing under the foot
   copy; a 667x375 handset was worse still, taking the portrait branch on
   width and overflowing the stage outright. Drive it from the row height,
   same as the portrait case. Matches the min-height: 501px bound in
   COMPACT_MEDIA, so JS keeps the WIDE slot aspect in step with this frame. */
@media (max-height: 500px) {
  .im-frame {
    height: min(calc(100% - 0.75rem), 220px);
    width: auto;
    aspect-ratio: 3/2;
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
@media (max-width: 720px) {
  /* Display size only works where there is width to run in. On a phone the
     portrait sits in the middle of the band and slices 2.4rem words into
     three-letter fragments — "BUIL … AW S". Ticker size keeps whole words
     readable either side of the frame. */
  .im-marquee .word { font-size: clamp(1.25rem, 5vw, 1.9rem); }
}
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
/* ── signature on anything that is not a wide desktop stage ──
   Two separate faults lived here, and both show up as "the signature is the
   wrong size and in the wrong place".

   POSITION. The box is `inset: 0` on #intro-message and centres its grid
   item, so it targets the centre of the STAGE. The portrait centres inside
   .im-stage — the row between .im-top and .im-foot. Those two centres only
   coincide while .im-foot is absolutely positioned, which it is on desktop
   and is NOT on the compact stage (see the .hs-page2 rules, where the foot
   is in flow so it can't overlap the frame). The gap ran to ~75px: the
   signature sat below the portrait with its tail hanging off the plate
   instead of scrawled across the face. Pin to the measured frame centre
   (--hs-slot-cy, written by measureHeroSlot) and drop the padding bias that
   was a partial manual correction for the same drift. A zero-height grid
   box centres its overflowing item on its own top edge, which is exactly
   the anchor we want.

   SIZE. 0.86 of the slot width was set against the WIDE slot. Against the
   portrait slot — barely a third as wide — it made a mark nearly as wide as
   the plate, which is why it burst the frame on every phone. 0.72 keeps it
   reading as scrawled-across while staying inside the glow's own margin. */
@media (max-width: 720px), (max-aspect-ratio: 4/5), (max-height: 500px) {
  .im-signature {
    padding-left: 0;
    padding-top: 0;
    inset: auto 0 auto 0;
    top: var(--hs-slot-cy, 50%);
    height: 0;
  }
  .im-signature :deep(svg) {
    /* Tied to the measured slot, not the viewport: keeps the same proportion
       whether the frame is 273px tall or squeezed to 226 by Safari's chrome.
       Falls back to the old vw ramp pre-measure. */
    width: calc(var(--hs-slot-w, min(55vw, 260px)) * 0.72 * var(--sig-scale));
    /* The grid row above is auto-sized, so `place-items: center` centres the
       svg within a row as tall as the svg — which, on a zero-height
       container, lands its TOP on the anchor rather than its middle. Pull it
       up by half its own height explicitly.
       The two small percentages re-centre the INK rather than the box: the
       drawn mark is not centred inside the 612x792 viewBox (bbox x 11.4
       w 527.3, y 33.8 h 681.6), so centring the element box left the visible
       signature 9px left and 6px high of the portrait it is scrawled on. */
    transform: translate(5%, calc(-50% + 2.7%));
  }
}
/* ── portrait slot: scale the mark to the HEAD, not to the plate ──
   Centring the ink on the frame (above) is geometrically correct and still
   looked wrong, because size and anchor were both measured against the wrong
   thing. The frame changes shape between stages — 24:14 on a desktop,
   3:4 here — so "a fraction of the plate" means something different on each,
   while the thing the signature is actually scrawled across, the man's head,
   does not change at all.

   Measured on the landed plate, the desktop mark is 1.21x the head's width
   and its centre sits 0.90 of a head-height below the crown: the loop rings
   the head with air to spare and the descender runs out past the bottom edge
   of the plate. At 0.72 of the slot width the phone was getting 0.73x the
   head, centred on the mouth — a third the presence, contained tidily inside
   the frame, reading as a sticker placed on the face rather than a mark
   drawn over the portrait. That is the "misaligned" in the bug report: the
   origin was right and the composition was not.

   Both quantities are constants here, because the compact crop pins them:
   applyHeroTransform frames the head at COMPACT_HEAD_W_FRAC (0.78) of the
   plate width with COMPACT_CROWN_HEADROOM (0.10) of air above the crown, at
   a fixed 3:4, so head width is always 0.78*slot-w and head height always
   0.577*slot-h, on every compact viewport from a 320px handset to an upright
   tablet. Change either of those two levers and re-derive these.

     width  1.21 * 0.78 = 0.943 of slot-w of INK; the ink bbox is 0.862 of
            the svg box, hence 0.943 / 0.862 / 0.92(--sig-scale) = 1.19.
     offset crown(0.10) + 0.897 * head(0.577) = 0.617 of slot-h from the
            plate top, i.e. +0.117 slot-h past the frame centre the anchor
            already gives us. As a share of the svg's own height (which is
            now 1.416 * slot-w) that is +11.05%, so it tracks the mark
            instead of needing the slot height passed in again.

   The horizontal half of the desktop bias (+0.16 head-widths right, a
   leftover of its `padding-left`) is deliberately NOT carried over. It is
   invisible where the ink is half the plate's width; at 94% of it the mark
   would hang off the right edge with a gap on the left. */
@media (min-height: 501px) and (max-width: 720px),
       (min-height: 501px) and (max-aspect-ratio: 4/5) {
  .im-signature :deep(svg) {
    width: calc(var(--hs-slot-w, min(55vw, 260px)) * 1.19 * var(--sig-scale));
    transform: translate(5%, calc(-50% + 13.75%));
  }
}
/* Landscape handset: the frame is now height-driven (3:2, ~160px tall), and
   a signature sized off the frame's WIDTH came out 11% taller than the frame
   itself — the loop ran up into the .im-top bar. Size it off the measured
   frame height here instead; 0.58 reproduces the proportion the wide desktop
   stage uses, which is the same landscape situation. This stage takes the
   WIDE slot and the desktop crop path, so none of the portrait-slot
   constants above apply to it — hence the separate query rather than one
   shared rule. */
@media (max-height: 500px) {
  .im-signature :deep(svg) {
    width: calc(var(--hs-slot-h, 160px) * 0.773 * 1.13 * var(--sig-scale));
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
  /* One column means the foot is the biggest block on the phone stage, and
     every pixel it takes comes straight out of the portrait above it. Wider
     measure = fewer caption lines; the scroll bead only needs enough track to
     read as a track. */
  .im-foot { grid-template-columns: 1fr; gap: 0.55rem; }
  .im-foot .caption, .im-foot .timestamp { text-align: left; }
  .im-foot .caption { max-width: 38ch; line-height: 1.45; letter-spacing: 0.12em; }
  .im-foot .scroll-down { align-items: flex-start; gap: 0.4rem; }
  .im-foot .scroll-down .arrow { height: 26px; }
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
/* Still of the hero rig, for browsers that cannot create a WebGL2 context.
   The numbers are measured off the live render, not guessed: in the 3D the
   subject is horizontally centred and runs from 31.2% of the stage height
   down past the bottom edge, so the still is centred, bottom-anchored and
   68.8% of the stage tall. Sizing by HEIGHT is what makes it match at any
   width — the camera frames by vertical fov too, so a wider viewport shows
   more room around him rather than a bigger him, which is exactly what a
   height-sized image does. */
.hs-sticky .cr-character-still {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  height: 68.8%;
  width: auto;
  max-width: none;
  /* The rig's own canvas is composited straight onto the stage with no
     filter; the still is a capture of that same output, so it needs none. */
  pointer-events: none;
  user-select: none;
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

/* Measurement mode, held for one synchronous JS task by fitPin(). The pinned
   stages author their entrance as `opacity: 0; transform: translateY(26px)`,
   and a rect read through that transform counts the offset as content — so the
   fit pass would shrink the type to clear a gap that disappears the moment the
   entrance plays. Parked here rather than read back per element because the
   transforms are spread across half a dozen rules and a reduced-motion block.
   Nothing paints while this is on.

   The list has to include every LINK in the chain, not just the leaves: a
   translate on .xp-panels moves the .xp-panel inside it whether or not the
   panel has a transform of its own, and missing that one node was worth a
   phantom 26px — enough to un-pin Work Experience on a 2560 monitor. */
.is-fitting :is(.edu-name-line, .edu-name-meta, .edu-detail, .edu-strip,
                .section-num, .section-title, .xp-panels, .xp-panel,
                .xp-panel > *, .xp-progress, .xp-companies, .xp-co) {
  transform: none !important;
  transition: none !important;
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
#summary.sum-staged { height: 600vh; height: 600svh; padding: 0; }
#summary .summary-pin { min-height: 0; }
#summary.sum-staged .summary-pin {
  position: sticky;
  top: var(--topbar-h, 56px);
  /* svh, not vh: on iOS/iPadOS Safari `100vh` is the LARGE viewport — the
     height the page would have with the URL bar collapsed — so a pin sized
     in vh is ~110px taller than what is actually on screen and its bottom
     band (records strip, stats row, last bullets) lives permanently under
     the browser chrome. svh is the stable small-viewport height, which is
     also why it never resizes the stage mid-scroll as the bar retracts.
     Plain-vh line kept first as the fallback for browsers without svh. */
  height: calc(100vh - var(--topbar-h, 56px));
  height: calc(100svh - var(--topbar-h, 56px));
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
   width the character column left for it. It is 1 whenever the copy fits.

   The vw terms reach their rem ceiling at 1292px (title) and 1437px (body)
   rather than 1400 / 1546. Every laptop from a 13" MacBook up therefore
   renders the SAME nominal type as a 2560 monitor, and the only thing that
   still separates them is --sum-fit — which is measured, so what it takes
   away is exactly what the shorter pin could not hold. Both still cap at the
   same rem, so nothing about a large display changes. */
#summary.sum-staged .section-title {
  font-size: calc(clamp(2.4rem, 5.2vw, 4.2rem) * var(--sum-fit, 1));
  margin-bottom: calc(clamp(1rem, 2.6vh, 1.8rem) * var(--sum-fit, 1));
}
#summary.sum-staged .body p {
  font-size: calc(clamp(1rem, 1.27vw, 1.14rem) * var(--sum-fit, 1));
  margin-bottom: calc(1.15rem * var(--sum-fit, 1));
  /* Leading tightens WITH the fit instead of stepping at a breakpoint: 1.62 at
     fit 1, ~1.52 by fit 0.84 — the two values the old `max-height: 840px`
     block jumped between, now traversed continuously. Reaching them by
     measurement also means a viewport that needs no compression never gets
     any, which the height proxy could not tell. */
  line-height: calc(1.62 - (1 - var(--sum-fit, 1)) * 0.62);
  /* Hold the MEASURE at its full-size physical width while the type shrinks.
     `ch` is a font-relative unit, so a plain `58ch` narrows in lockstep with
     --sum-fit: the copy gets smaller, the column gets proportionally
     narrower, the line count barely moves, and the fit loop has to shrink
     again to buy the height it just failed to save. Dividing by the fit
     cancels that out — at 1440x790 the paragraphs then run 631px instead of
     543px inside a 647px track that was sitting there unused. `min(…, 100%)`
     keeps it inside the track when the track is the tighter of the two. */
  max-width: min(calc(58ch / var(--sum-fit, 1)), 100%);
}
#summary .body p {
  font: 400 clamp(1rem, 1.27vw, 1.14rem)/1.62 var(--f-sans);
  color: var(--ink);
  max-width: 58ch;
  text-wrap: pretty;
  margin-bottom: 1.15rem;
}
#summary .body p:last-child { margin-bottom: 0; }
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
/* Still of the summary rig, for browsers with no WebGL2. Measured off the
   live render the same way as the hero still: centred, top edge at 11.4% of
   the slot and 75.5% of it tall. The rig itself frames the body by height
   and publishes its metrics as height ratios for exactly this reason (see
   PushMetrics in SummaryCharacter.vue), so a height-sized image is the
   faithful stand-in at any column width. */
#summary .char-slot .sum-char-still {
  position: absolute;
  left: 50%;
  top: 11.4%;
  transform: translateX(-50%);
  height: 75.5%;
  width: auto;
  max-width: none;
  pointer-events: none;
  user-select: none;
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
/* Currently playing. Filled instead of dimmed: the control stays live the
   whole time a clip runs — clicking it again drops back to idle, and any
   other button cuts straight over — so it has to read as pressed, not off. */
.sum-act.is-active .sum-act-btn {
  background: var(--ink);
  color: var(--accent);
  border-color: var(--ink);
}
.sum-act.is-active .sum-act-label { color: var(--ink); }

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

/* education records block — 2×2, and deliberately not full-bleed: keeping it
   to a half-column is what frees the right of the pin for the campus photo. */
.edu-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: min(100%, 38rem);
  border: 1px solid var(--rule);
  margin-top: 1.5rem;
}
.edu-strip .cell {
  padding: 1.1rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.edu-strip .cell:nth-child(2n) { border-left: 1px solid var(--rule); }
.edu-strip .cell:nth-child(n + 3) { border-top: 1px solid var(--rule); }
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
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: end;
}
@media (max-width: 880px) { .footer .footer-grid { align-items: start; gap: 2rem; } }
.footer .links {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.18);
}
@media (max-width: 880px) { .footer .links { grid-template-columns: 1fr 1fr; } }
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
#education.edu-staged { height: 240vh; height: 240svh; padding: 0; min-height: 0; }
/* `relative` only so the campus photo has a containing block to be parked in
   — no offsets, so nothing in the flex column moves. */
#education .edu-pin { display: flex; flex-direction: column; min-height: 0; position: relative; }
#education.edu-staged .edu-pin {
  position: sticky;
  /* pin BELOW the sticky topbar (not behind it) so the heading keeps
     a comfortable gap from the bar while pinned */
  top: var(--topbar-h, 56px);
  /* svh, not vh: on iOS/iPadOS Safari `100vh` is the LARGE viewport — the
     height the page would have with the URL bar collapsed — so a pin sized
     in vh is ~110px taller than what is actually on screen and its bottom
     band (records strip, stats row, last bullets) lives permanently under
     the browser chrome. svh is the stable small-viewport height, which is
     also why it never resizes the stage mid-scroll as the bar retracts.
     Plain-vh line kept first as the fallback for browsers without svh. */
  height: calc(100vh - var(--topbar-h, 56px));
  height: calc(100svh - var(--topbar-h, 56px));
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
/* Both of these were authored as flat px out of the design handoff — 28px and
   20px, identical on a 2560 monitor and on a 375px phone. On the phone the
   degree line wrapped to four lines and pushed the records strip clean out of
   the pin. The clamps below top out at exactly the handoff values and only
   start giving ground under ~715px / ~840px of viewport width, so every
   desktop size renders byte-for-byte what it rendered before. Line-height is
   unitless now (28/32.45 = 1.159) so it tracks the font-size instead of
   staying frozen at 32.45px when --edu-fit scales the type down. */
#education .edu-degree {
  font: 700 clamp(1.25rem, 2.6vw + 0.6rem, 1.75rem)/1.159 var(--f-sans);
  letter-spacing: 0;
  color: #09090B;
  margin-top: clamp(0.9rem, 2.5vh, 1.5rem);
}
#education .edu-gold {
  color: var(--ink);
  font-size: clamp(1rem, 1.6vw + 0.4rem, 1.25rem);
}
#education .edu-gold strong { font-weight: 700; font-size: inherit; }

/* ── measured fit-to-pin ──
   `--edu-fit` is published by setupEducationPin → fitPin(); it is 1 whenever
   the stack already clears the pin's bottom edge, which is every desktop
   viewport, so nothing below changes on a large display. On the short ones it
   is the only thing standing between the records strip and the
   `overflow: hidden` edge. Every term that contributes HEIGHT is multiplied —
   type, leading-bearing margins, and the strip's own box padding — because
   scaling the type alone leaves the fixed 1.1rem cell padding as a floor the
   content can't get under. */
#education.edu-staged .section-title {
  font-size: calc(clamp(2.4rem, 6vw, 5.2rem) * var(--edu-fit, 1));
  margin-bottom: calc(var(--gap-title) * var(--edu-fit, 1));
}
#education.edu-staged .edu-name {
  margin-bottom: calc(clamp(1rem, 3.5vh, 2.5rem) * var(--edu-fit, 1));
}
#education.edu-staged .edu-name-line {
  font-size: calc(clamp(1.3rem, min(3.9vw, 5.4vh), 3.8rem) * var(--edu-fit, 1));
}
#education.edu-staged .edu-name-meta {
  margin-top: calc(clamp(0.6rem, 2vh, 1.1rem) * var(--edu-fit, 1));
}
#education.edu-staged .edu-degree {
  font-size: calc(clamp(1.25rem, 2.6vw + 0.6rem, 1.75rem) * var(--edu-fit, 1));
  margin-top: calc(clamp(0.9rem, 2.5vh, 1.5rem) * var(--edu-fit, 1));
}
#education.edu-staged .edu-gold {
  font-size: calc(clamp(1rem, 1.6vw + 0.4rem, 1.25rem) * var(--edu-fit, 1));
}
#education.edu-staged .edu-strip { margin-top: calc(1.5rem * var(--edu-fit, 1)); }
#education.edu-staged .edu-strip .cell {
  padding: calc(1.1rem * var(--edu-fit, 1)) calc(1.2rem * var(--edu-fit, 1));
  gap: calc(0.4rem * var(--edu-fit, 1));
}
#education.edu-staged .edu-strip .v { font-size: calc(1.05rem * var(--edu-fit, 1)); }

#education .edu-details {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: end;
}

/* campus photo — out of flow entirely. Position and size come from
   fitPhoto(), which measures the space the type does not use; the element
   itself only ever reads those three custom properties, so a viewport where
   nothing fits simply gets `hidden` and the section is exactly as it was. */
#education .edu-photo {
  position: absolute;
  margin: 0;
  left: var(--ep-x, 0px);
  top: var(--ep-y, 0px);
  width: var(--ep-size, 0px);
  height: var(--ep-size, 0px);
  pointer-events: none;
}
#education .edu-photo[hidden] { display: none; }
#education .edu-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  /* First paint before the scrub has written anything. Everything after this
     is inline style from writePhoto(). */
  #education.edu-staged .edu-photo {
    opacity: 0;
    will-change: transform, opacity;
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
#experience.xp-staged { height: 320vh; height: 320svh; padding: 0; min-height: 0; }
#experience .xp-pin {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: clamp(1.25rem, 3vh, 2rem);
}
#experience.xp-staged .xp-pin {
  position: sticky;
  top: var(--topbar-h, 56px);
  /* svh, not vh: on iOS/iPadOS Safari `100vh` is the LARGE viewport — the
     height the page would have with the URL bar collapsed — so a pin sized
     in vh is ~110px taller than what is actually on screen and its bottom
     band (records strip, stats row, last bullets) lives permanently under
     the browser chrome. svh is the stable small-viewport height, which is
     also why it never resizes the stage mid-scroll as the bar retracts.
     Plain-vh line kept first as the fallback for browsers without svh. */
  height: calc(100vh - var(--topbar-h, 56px));
  height: calc(100svh - var(--topbar-h, 56px));
  padding: clamp(1.5rem, 4vh, 2.75rem) var(--gutter-x) clamp(1rem, 3.5vh, 2.5rem);
  overflow: hidden;
}

/* ── measured fit-to-pin ──
   `--xp-fit` is published by setupExperiencePin → fitPin(); 1 on every
   viewport where the stack already clears the pin, so nothing on a large
   display moves. On a 1366x670 laptop it is what keeps the stats row inside
   the `overflow: hidden` edge instead of 78px past it. The section heading
   is scaled along with the panel because at 6vw it is two lines of ~82px
   type — a quarter of the whole pin — and shaving the card alone would make
   the card carry the entire correction. */
#experience.xp-staged .section-title {
  font-size: calc(clamp(2.4rem, 6vw, 5.2rem) * var(--xp-fit, 1));
  margin-bottom: calc(var(--gap-title) * var(--xp-fit, 1));
}
#experience.xp-staged .xp-pin { gap: calc(clamp(1.25rem, 3vh, 2rem) * var(--xp-fit, 1)); }
#experience.xp-staged .xp-co-name {
  font-size: calc(clamp(1.8rem, min(4.4vw, 6.8vh), 4.6rem) * var(--xp-fit, 1));
}
#experience.xp-staged .xp-companies { gap: calc(clamp(1rem, 3.2vh, 2rem) * var(--xp-fit, 1)); }
#experience.xp-staged .xp-panel {
  gap: calc(clamp(0.85rem, 2vh, 1.2rem) * var(--xp-fit, 1));
  padding: calc(clamp(1.3rem, 2.4vh, 1.9rem) * var(--xp-fit, 1))
           calc(clamp(1.3rem, 1.8vw, 1.9rem) * var(--xp-fit, 1));
}
#experience.xp-staged .xp-role {
  font-size: calc(clamp(1.2rem, min(1.9vw, 2.8vh), 1.55rem) * var(--xp-fit, 1));
}
#experience.xp-staged .xp-summary {
  font-size: calc(clamp(0.92rem, 1.05vw, 1rem) * var(--xp-fit, 1));
}
#experience.xp-staged .xp-datelines {
  padding: calc(clamp(0.6rem, 1.6vh, 0.85rem) * var(--xp-fit, 1)) 0;
  gap: calc(0.55rem * var(--xp-fit, 1));
}
#experience.xp-staged .xp-stats .cell {
  padding: calc(clamp(0.75rem, 1.8vh, 1.05rem) * var(--xp-fit, 1)) calc(1.1rem * var(--xp-fit, 1));
  gap: calc(0.45rem * var(--xp-fit, 1));
}
#experience.xp-staged .xp-stats .v {
  font-size: calc(clamp(1rem, min(1.4vw, 2.4vh), 1.15rem) * var(--xp-fit, 1));
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
  /* 1.45, not 1: the badge is a single line on desktop but wraps at phone
     width, and solid leading made the wrapped word sit on the line above it. */
  font: 500 0.64rem/1.45 var(--f-mono);
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
#awards.aw-staged { height: 280vh; height: 280svh; padding: 0; }
#awards .aw-stick { display: flex; flex-direction: column; min-height: 0; }
#awards.aw-staged .aw-stick {
  position: sticky;
  top: var(--topbar-h, 56px);
  /* svh, not vh: on iOS/iPadOS Safari `100vh` is the LARGE viewport — the
     height the page would have with the URL bar collapsed — so a pin sized
     in vh is ~110px taller than what is actually on screen and its bottom
     band (records strip, stats row, last bullets) lives permanently under
     the browser chrome. svh is the stable small-viewport height, which is
     also why it never resizes the stage mid-scroll as the bar retracts.
     Plain-vh line kept first as the fallback for browsers without svh. */
  height: calc(100vh - var(--topbar-h, 56px));
  height: calc(100svh - var(--topbar-h, 56px));
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

/* ════════════════════════════════════════════════════════════
   PHONE LEGIBILITY FLOOR
   ════════════════════════════════════════════════════════════
   The mono micro-labels are sized for a desktop viewing distance, where
   0.58–0.62rem (9.3–9.9px) reads as a deliberate caption. Held at arm's
   length on a phone the same strings fall under the ~11px floor and stop
   being readable at all — an audit across this page found thirty-odd of
   them, which is most of the reason the page "looks wrong" on a handset
   even though nothing is broken.

   Deliberately a font-size-only block at the end of the sheet: every rule
   here is a same-property override of a declaration above it, so the
   desktop cascade is untouched by construction and the diff is auditable.
   Tracking stays as authored — these are 0.1–0.24em letter-spaced labels
   and re-tracking them would change the lockups, not just the size.
   ════════════════════════════════════════════════════════════ */
@media (max-width: 720px) {
  .im-foot .scroll-down span { font-size: 0.68rem; }
  .im-foot .timestamp        { font-size: 0.68rem; }
  .sum-act-hint              { font-size: 0.68rem; }
  .sum-act-label             { font-size: 0.66rem; }
  #por .bix                  { font-size: 0.72rem; }
  .edu-strip .k              { font-size: 0.68rem; }
  .footer .links .k          { font-size: 0.66rem; }
  .footer .colophon          { font-size: 0.68rem; }
  #experience .xp-prog-meta  { font-size: 0.68rem; }
  #experience .xp-co-num     { font-size: 0.68rem; }
  #experience .xp-badge      { font-size: 0.7rem; }
  #experience .xp-datelines .promo { font-size: 0.68rem; }
  #experience .xp-stats .k   { font-size: 0.68rem; }

  /* Body copy. 0.92rem (14.7px) is below the comfortable phone floor; the
     rail reclaim below pays for the extra characters this costs per line. */
  .bullets li { font-size: 0.95rem; }

  /* ─── reclaim the rail gutter ───
     At 375px usable the PoR column spent 24px (page gutter) + 38px
     (--railpad floor) + 24px (bullet indent) before the first glyph: 23% of
     the screen, leaving a 265px measure that wrapped body copy at ~33
     characters and read as ragged. The rail is decoration — it does not
     need a desktop-width standoff on a phone. .nd pins itself to the rail
     with `left: calc(7px - var(--railpad))`, so narrowing the pad carries
     the node dots along with it and the alignment holds. */
  #por .rail-wrap { --railpad: 1.6rem; }
  #por .bullets li { padding-left: 1.1rem; }
  #por .bullets li::before { width: 10px; }
}
</style>
