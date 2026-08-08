<script setup lang="ts">
/**
 * Hero narrative — the three scroll-scrubbed story states that sit over the
 * pinned 3D character stage. Nothing about the character (position, scale,
 * camera, framing, lighting) is touched from here; this is purely the
 * typography layer that used to live inline in Portfolio.vue.
 *
 * WHY THIS IS ITS OWN COMPONENT, AND WHY IT DOESN'T USE <motion.*>
 * The obvious build is `<m.span :style="{ y, opacity }">` bound to Motion
 * values. It does not survive on this page: motion-v attaches its style
 * subscription once, imperatively, and on this route it stops firing after the
 * very first write — the type then freezes at whatever value it held and never
 * moves again however far you scroll. Verified against the production build,
 * with no console errors, both inline in Portfolio.vue and isolated here, so
 * it is not a re-render or an HMR artifact.
 *
 * What survives is Framer Motion's interpolation core: `transform()` builds a
 * pure keyframe interpolator (multi-stop, unit-aware, clamped) and we call it
 * from the parent's rAF loop, which is the same write path every other scrub
 * on this page already uses. Same easing math, same reversibility, no
 * subscription lifecycle to lose. It stays its own component so the parent's
 * re-renders never patch this subtree.
 *
 * The parent drives it by calling `publish(p)` from its rAF loop.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
// Framer Motion's keyframe interpolator, via Motion for Vue (which re-exports
// `framer-motion/dom`). Pure function in, pure function out — no component
// wrapper, so none of the `motion` proxy's drag/layout/gesture bundle is
// pulled in either.
import { transform } from 'motion-v'

// A line is typed, not just coloured: the reference composition gets its
// editorial voice from mixing a heavy condensed face against a light one at
// three or four sizes inside a single block. `hi` is only the colour switch —
// `size` and `bold` carry the hierarchy, and `tick`/`conn` carry the
// schematic annotation marks that frame the column.
type NarrTok  = { t: string; hi?: boolean }
type NarrSize = 'xl' | 'lg' | 'md' | 'sm'
type NarrLine = {
  tokens: NarrTok[]
  size?: NarrSize   // default 'md'
  bold?: boolean    // heavy condensed vs light condensed
  gap?: boolean     // paragraph break above
  tick?: boolean    // dot in the left margin, joined by a dotted seam
  conn?: boolean    // measure line drawn out to the right, ending in a dot
}

const NARRATIVE: NarrLine[][] = [
  // Opening state runs a size up from the other two: it carries only five
  // lines against their seven, so it can hold the reference's poster scale
  // without crowding the character, and the poster scale is what makes it
  // read as the title card rather than the first of three paragraphs.
  [
    { tokens: [{ t: 'A ' }, { t: 'MOVING', hi: true }], size: 'xl', bold: true },
    { tokens: [{ t: 'OPERATOR —', hi: true }], size: 'xl', bold: true },
    // md → lg → xl, not lg → lg → xl. Two light lines at one size read as a
    // flat slab under the headline; stepping them makes the tail a crescendo
    // into the payload word instead of a paragraph with a big last line.
    { tokens: [{ t: 'FUELING THE NEXT' }], size: 'md' },
    { tokens: [{ t: 'GENERATION OF' }], size: 'lg' },
    // No measure line here, unlike the other two states: at this size the
    // line's right edge is already at 31% of the stage, and a 190px rule off
    // it would reach 46% — into the character. The rail drawing itself in is
    // this state's schematic beat instead.
    { tokens: [{ t: 'BUILDERS.', hi: true }], size: 'xl', bold: true },
  ],
  // Tail runs the same md / lg-bold / md / lg-bold rhythm as the closing
  // state. It used to be five lines all at `sm`, which made the longest of
  // the three states also the quietest — the list read as a caption hanging
  // off CONNECT rather than the payload the sentence is built toward.
  [
    { tokens: [{ t: 'ON A MISSION TO' }], size: 'md' },
    { tokens: [{ t: 'CONNECT', hi: true }], size: 'xl', bold: true },
    { tokens: [{ t: 'AMBITIOUS ' }, { t: 'IDEAS', hi: true }], size: 'md', gap: true, conn: true },
    { tokens: [{ t: 'WITH THE RIGHT' }], size: 'md', tick: true },
    { tokens: [{ t: 'RESOURCES,', hi: true }], size: 'lg', bold: true, tick: true },
    { tokens: [{ t: 'TECHNOLOGY &', hi: true }], size: 'md', tick: true },
    { tokens: [{ t: 'EXPERTISE.', hi: true }], size: 'lg', bold: true, tick: true },
  ],
  [
    { tokens: [{ t: 'BECAUSE THE WORLD' }], size: 'md' },
    { tokens: [{ t: 'HAS NO SHORTAGE OF' }], size: 'md' },
    { tokens: [{ t: 'IDEAS.', hi: true }], size: 'xl', bold: true, conn: true },
    { tokens: [{ t: 'WHAT IT NEEDS ARE' }], size: 'md', gap: true, tick: true },
    { tokens: [{ t: 'MORE PEOPLE', hi: true }], size: 'lg', bold: true, tick: true },
    { tokens: [{ t: 'WHO CAN BRING THEM' }], size: 'md', tick: true },
    { tokens: [{ t: 'TO LIFE.', hi: true }], size: 'lg', bold: true, tick: true },
  ],
]
const NARR_STAGES = NARRATIVE.length

const narrReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Each line rides through its own clip window, so a state assembles line by
// line and — because every value below is a pure function of scroll position,
// never a one-shot tween — disassembles line by line in exact reverse when you
// scroll back up. Nothing here can get stuck in a played state.
const NARR_ENTER: [number, number] = [-0.30, -0.06]
const NARR_EXIT:  [number, number] = [ 0.50,  0.74]
const NARR_STAG      = narrReduced ? 0 : 0.030  // per-line offset entering
const NARR_STAG_OUT  = narrReduced ? 0 : 0.014  // …and leaving, tighter
const NARR_DROP = narrReduced ? '0%' : '112%'   // start below the mask
const NARR_LIFT = narrReduced ? '0%' : '-70%'   // …exit up through the top

// The opening state can't use NARR_ENTER: its window would straddle s = 0,
// which is where the parent's runway begins, so its later lines would be
// clamped permanently mid-reveal. It gets its own window entirely in negative
// stage space instead — the parent maps the post-door settle beat onto
// [-NARR_LEAD, 0] (see `publish`), so the state writes itself on after the
// doors have finished and is fully landed and held before the story scrub
// starts. Last line lands at -0.22 + 4 * NARR_STAG = -0.10, comfortably
// inside the lead.
const NARR_LEAD = 0.72
const NARR_ENTER_FIRST: [number, number] = [-0.62, -0.22]

// Stage-space position: 0 → NARR_STAGES. State i owns [i, i+1). Handover
// costs ~0.35 of that; the rest is a dead hold where nothing moves at all.
// Every curve below is a pure function of that position, which is what makes
// the sequence run backwards exactly as it ran forwards.
type LineFx = {
  y: (s: number) => string
  opacity: (s: number) => number
  mark: (s: number) => number
  el?: HTMLElement       // .cr-inner — the masked text
  tickEl?: HTMLElement   // margin dot + dotted seam
  connEl?: HTMLElement   // measure line
  ly?: string
  lo?: number
  lm?: number
}

// Flattened in DOM order (stage 0's lines, then stage 1's, then stage 2's) so
// a single querySelectorAll can bind elements to curves on mount.
const lineFx: LineFx[] = []

const narrStages = NARRATIVE.map((lines, i) => {
  const isLast = i === NARR_STAGES - 1
  const enter = i === 0 ? NARR_ENTER_FIRST : NARR_ENTER
  return {
    lines: lines.map((line, j) => {
      const inA = i + enter[0] + j * NARR_STAG
      const inB = i + enter[1] + j * NARR_STAG
      // The last state never leaves: park its exit ramp past any reachable
      // value rather than special-casing every curve below.
      const outA = isLast ? 1e4 : i + NARR_EXIT[0] + j * NARR_STAG_OUT
      const outB = isLast ? 1e4 + 1 : i + NARR_EXIT[1] + j * NARR_STAG_OUT
      const stops = [inA, inB, outA, outB]
      lineFx.push({
        y: transform(stops, [NARR_DROP, '0%', '0%', NARR_LIFT], { clamp: true }),
        opacity: transform(stops, [0, 1, 1, 0], { clamp: true }),
        // Annotation marks trail the line they belong to, so the schematic
        // draws itself after the type lands instead of racing it.
        mark: transform([inB - 0.01, inB + 0.13, outA, outA + 0.06], [0, 1, 1, 0], { clamp: true }),
      })
      return line
    }),
  }
})

// The rail is the frame the type hangs on, so it draws downward just ahead of
// the first line instead of standing empty through the whole post-door beat.
// Once drawn it never retracts within the story — states 2 and 3 live at s ≥
// 0.7, far past the clamp — but scrolling back into the door does undraw it,
// because this is the same kind of pure position→value curve as everything
// else here.
const railFx = transform([-0.70, -0.44], [0, 1], { clamp: true })

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a)))
  return t * t * (3 - 2 * t)
}

// Chapter index and CTA gate are written straight to the DOM, never through a
// Vue ref — see the note at the top of this file. Nothing in `publish` may
// touch reactive state, or the scrub would re-render on nearly every frame.
const rootRef = ref<HTMLElement | null>(null)
let stageEls: HTMLElement[] = []
let activeIdx = -1
let endVal = -1
let railVal = -1

onMounted(() => {
  const root = rootRef.value
  if (!root) return
  stageEls = Array.from(root.querySelectorAll<HTMLElement>('.cr-stage'))
  const lineEls = root.querySelectorAll<HTMLElement>('.cr-line')
  for (let k = 0; k < lineFx.length && k < lineEls.length; k++) {
    const host = lineEls[k]
    lineFx[k].el = host.querySelector<HTMLElement>('.cr-inner') ?? undefined
    lineFx[k].tickEl = host.querySelector<HTMLElement>('.cr-tick') ?? undefined
    lineFx[k].connEl = host.querySelector<HTMLElement>('.cr-conn') ?? undefined
  }
  publish(-1)
})

onBeforeUnmount(() => {
  for (const fx of lineFx) {
    fx.el = fx.tickEl = fx.connEl = undefined
    fx.ly = undefined
    fx.lo = fx.lm = undefined
  }
})

/**
 * `p` is signed: -1→0 across the parent's post-door settle beat (the opening
 * state's lead-in) and 0→1 across the narrative segment proper. The two halves
 * get different stage-space scales because they are budgeted in different
 * amounts of scroll; the slope changes at p = 0, which is invisible because
 * nothing is mid-flight there — state 1 landed at s = -0.10 and state 2 does
 * not start until s = 0.70.
 */
function publish(p: number) {
  const root = rootRef.value
  if (!root) return
  const s = p >= 0 ? p * NARR_STAGES : p * NARR_LEAD

  for (let k = 0; k < lineFx.length; k++) {
    const fx = lineFx[k]
    if (!fx.el) continue
    // Rounded before comparing: a scrub produces a new float every frame, and
    // writing a style that renders identically still costs a style recalc.
    const o = Math.round(fx.opacity(s) * 1000) / 1000
    if (o !== fx.lo) {
      fx.lo = o
      fx.el.style.opacity = `${o}`
    }
    const y = fx.y(s)
    if (y !== fx.ly) {
      fx.ly = y
      fx.el.style.transform = `translateY(${y})`
    }
    if (fx.tickEl || fx.connEl) {
      const mv = Math.round(fx.mark(s) * 1000) / 1000
      if (mv !== fx.lm) {
        fx.lm = mv
        if (fx.tickEl) fx.tickEl.style.opacity = `${mv}`
        if (fx.connEl) {
          fx.connEl.style.opacity = `${mv}`
          // Revealed by a clip, not a scaleX: scaling would squash the dot on
          // its end into an ellipse while the line draws.
          fx.connEl.style.clipPath = `inset(0 ${((1 - mv) * 100).toFixed(2)}% 0 0)`
        }
      }
    }
  }

  // Flip the rail at the midpoint of the handover, so the number changes on
  // the beat where the outgoing state has gone and the incoming hasn't landed.
  const flip = 1 - (NARR_EXIT[0] + NARR_ENTER[1] + 1) / 2
  const idx = Math.min(NARR_STAGES - 1, Math.max(0, Math.floor(s + flip)))
  if (activeIdx !== idx) {
    activeIdx = idx
    root.dataset.narr = String(idx)
    for (let k = 0; k < stageEls.length; k++) {
      stageEls[k].setAttribute('aria-hidden', k === idx ? 'false' : 'true')
    }
  }
  const rail = Math.round(railFx(s) * 1000) / 1000
  if (rail !== railVal) {
    railVal = rail
    root.style.setProperty('--narr-rail', `${rail}`)
  }
  // Same ramp the last state enters on — the CTA line arrives with it.
  const last = NARR_STAGES - 1
  const end = smoothstep(last + NARR_ENTER[0], last + NARR_ENTER[1], s)
  if (Math.abs(endVal - end) > 0.004) {
    endVal = end
    root.style.setProperty('--narr-end', end.toFixed(3))
  }
}

function reset() {
  activeIdx = -1
  endVal = -1
  railVal = -1
  publish(-1)
}

defineExpose({ publish, reset })
</script>

<template>
  <div ref="rootRef" class="cr-overlay" data-narr="0">
    <span class="cr-top">— Meet Adarsh</span>

    <!-- Three story states stacked in one grid cell, crossfaded by scroll.
         The rail is the constant frame they change inside, which is what
         keeps the sequence reading as one composition rather than three
         slides. -->
    <div class="cr-narrative">
      <span class="cr-rail" aria-hidden="true"></span>
      <div class="cr-stages">
        <div
          v-for="(st, si) in narrStages"
          :key="si"
          class="cr-stage"
          :aria-hidden="si === 0 ? 'false' : 'true'"
        >
          <p
            v-for="(line, li) in st.lines"
            :key="li"
            class="cr-line"
            :class="[
              `cr-line--${line.size || 'md'}`,
              {
                'cr-line--gap': line.gap,
                'cr-line--bold': line.bold,
                'cr-line--tick': line.tick,
              },
            ]"
          >
            <!-- Annotation marks sit OUTSIDE .cr-mask on purpose: the mask
                 clips its own overflow, which would eat a dot hanging in the
                 left margin. All three elements below are addressed by
                 `publish` and never re-rendered by Vue. -->
            <span v-if="line.tick" class="cr-tick" aria-hidden="true"></span>
            <span class="cr-mask">
              <span class="cr-inner">
                <span v-for="(tok, ti) in line.tokens" :key="ti" :class="{ hi: tok.hi }">{{ tok.t }}</span>
              </span>
            </span>
            <span v-if="line.conn" class="cr-conn" aria-hidden="true"></span>
          </p>
        </div>
      </div>
    </div>

    <div class="cr-index" aria-hidden="true">
      <ol class="cr-index-list">
        <li v-for="(_, si) in narrStages" :key="si">{{ String(si + 1).padStart(2, '0') }}</li>
      </ol>
      <span class="cr-index-seam"></span>
    </div>

    <div class="cr-bottom">
      <div class="cr-meta-stack">
        <p class="cr-hint">
          <span class="cr-hint-arrow" aria-hidden="true">→</span>
          <span class="cr-hint-label">Try moving your cursor</span>
          <span class="cr-hint-dot" aria-hidden="true"></span>
        </p>
        <p class="cr-meta">Scroll to enter the work →</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cr-overlay {
  /* One gutter token: the overlay's own padding AND the absolutely-positioned
     chapter rail both read it, so the right-hand column can't drift out of
     alignment with the meta stack below it. */
  --cr-gutter: clamp(1.5rem, 4vw, 4rem);
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  padding: clamp(2rem, 6vh, 5rem) var(--cr-gutter);
  display: grid;
  grid-template-rows: auto 1fr auto;
  color: #F2F3EC;
  opacity: clamp(0, calc(var(--door-progress, 0) * 2 - 0.6), 1);
  transform: translateY(calc((1 - var(--door-progress, 0)) * 20px));
}
.cr-top {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--accent);
  opacity: 0.82;
}
.cr-bottom {
  /* Explicit, because .cr-narrative claims rows 2-3. Auto-placement is sparse:
     it would push the cursor past the spanned rows and drop this into an
     implicit row 4, collapsing row 3 to zero and leaving the narrative exactly
     where it started. */
  grid-row: 3;
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 1rem;
}

/* ── narrative — three scroll-scrubbed states in one composition ───────────
   Row 2 of .cr-overlay (the 1fr band between the eyebrow and the corner
   meta), sitting on the FLOOR of that band and pinned to the left gutter so
   it never crosses the character's silhouette. Bottom-anchored rather than
   centred for two reasons: it clears the character's face and shoulders,
   which are widest at the vertical centre, and it gives the three states a
   shared baseline so the block grows upward as the copy changes instead of
   breathing symmetrically around a moving midpoint. The rail runs the full
   height of the TALLEST state, so the frame holds still while the type
   inside it turns over. */
.cr-narrative {
  --cr-tickoff: 0.9rem;
  /* Spans rows 2 AND 3 so the block can drop past the corner-meta row and sit
     near the stage floor. Safe because the two never meet horizontally: the
     copy is capped at 44vw on the left, the meta stack is flush right. The
     phone layout, where the meta is left-aligned too, keeps it in row 2 —
     see the narrow-viewport block at the bottom of this file. */
  grid-row: 2 / 4;
  align-self: end;
  justify-self: start;
  /* Standoff from the overlay's bottom padding edge — the same floor the
     cursor hint sits on. */
  margin-bottom: clamp(0.75rem, 2.9vh, 2.25rem);
  display: flex;
  align-items: stretch;
  gap: clamp(1.4rem, 2.6vw, 2.4rem);
  /* Held clear of the centreline: the copy is vertically centred, which is
     exactly the height where the character's shoulders are widest. A condensed
     face buys back the width an equivalent Inter setting would have cost. */
  max-width: min(44vw, 600px);
}
.cr-rail {
  flex: none;
  position: relative;
  width: 1px;
  /* Drawn top-down by --narr-rail, written from publish(). Clipped rather
     than scaled so the end dot arrives round instead of stretching into an
     ellipse as the line grows past it. */
  clip-path: inset(0 0 calc((1 - var(--narr-rail, 0)) * 100%) 0);
  background: linear-gradient(
    180deg,
    rgba(219, 254, 82, 0) 0%,
    rgba(219, 254, 82, 0.42) 12%,
    rgba(219, 254, 82, 0.42) 88%,
    rgba(219, 254, 82, 0) 100%
  );
}
.cr-rail::before,
.cr-rail::after {
  content: '';
  position: absolute;
  left: 50%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(219, 254, 82, 0.55);
}
.cr-rail::before { top: 0; }
.cr-rail::after  { bottom: 0; }

/* All three states share one grid cell — they overlay exactly, so the
   crossfade has no reflow and the block's height is the tallest state's.
   Bottom-aligned inside that cell so every state's closing line lands on the
   same baseline: the composition then grows upward through the sequence
   instead of the whole block jumping each time the line count changes. */
.cr-stages {
  display: grid;
  align-items: end;
  justify-items: start;
  min-width: 0;
}
.cr-stage { grid-area: 1 / 1; }

/* ── the type ──────────────────────────────────────────────────────────────
   Hierarchy is carried by size AND weight, not colour alone: a heavy
   condensed line against a light condensed one at half the size is what makes
   the block read as an edited composition rather than a wall of caps. Every
   size stays a notch below the reference's poster scale — the character is
   the visual anchor, the copy is the voice. The vh term in each clamp keeps
   the seven-line states inside short laptop viewports. */
.cr-line {
  position: relative;
  margin: 0;
  width: max-content;
  max-width: 100%;
  font-family: var(--f-display);
  font-weight: 300;
  line-height: 1.06;
  letter-spacing: 0.012em;
  text-transform: uppercase;
  color: #F2F3EC;
}
.cr-line--bold {
  font-weight: 700;
  letter-spacing: -0.004em;
}
.cr-line--xl { font-size: clamp(2.5rem, min(6.1vw, 9.4vh), 5.2rem); }
.cr-line--lg { font-size: clamp(1.7rem, min(4.1vw, 6.2vh), 3.4rem); }
.cr-line--md { font-size: clamp(1.25rem, min(2.85vw, 4.4vh), 2.3rem); }
.cr-line--sm { font-size: clamp(1.02rem, min(2vw, 3.1vh), 1.55rem); }
.cr-line--gap { margin-top: 0.55em; }
.cr-line .hi { color: var(--accent); }
/* Only on the heavy accent lines — enough bloom to feel lit by the same key
   light as the character, not enough to soften the letterforms. */
.cr-line--bold .hi { text-shadow: 0 0 34px rgba(219, 254, 82, 0.22); }

/* Each line rides through its own clip window, so a state assembles and
   disassembles line by line under the scrub instead of cross-dissolving as
   one flat block. Padding widens the clip box (overflow clips at the padding
   edge) so Oswald's ascenders survive the tight leading; the matching
   negative margin keeps the layout metrics unchanged. */
.cr-mask {
  display: block;
  overflow: hidden;
  padding-block: 0.12em;
  margin-block: -0.12em;
}
/* Initial state is authored in CSS, not left to the first frame: publish(0)
   runs on mount, but a stylesheet that starts these visible would flash the
   whole stack of three states before it lands. */
.cr-inner {
  display: block;
  opacity: 0;
  will-change: transform, opacity;
}
.cr-tick,
.cr-conn { opacity: 0; }

/* ── schematic annotation ──────────────────────────────────────────────────
   The marks that make the column read as a technical drawing: a dot in the
   left margin per line, joined by a dotted seam, and a measure line drawn out
   to the right of the line the state pivots on. */
.cr-tick {
  position: absolute;
  left: calc(var(--cr-tickoff) * -1);
  top: 0;
  height: 100%;
  width: 5px;
  margin-left: -2px;
  pointer-events: none;
}
.cr-tick::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 5px;
  height: 5px;
  margin-top: -2.5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 9px rgba(219, 254, 82, 0.5);
}
/* Seam runs from this line's midpoint to the next line's midpoint — height
   100% of a line box is exactly one line of travel. */
.cr-tick::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  width: 1px;
  height: 100%;
  background: repeating-linear-gradient(
    180deg,
    rgba(219, 254, 82, 0.42) 0 2px,
    rgba(219, 254, 82, 0) 2px 6px
  );
}
.cr-line--tick:last-child .cr-tick::after { display: none; }

.cr-conn {
  position: absolute;
  left: calc(100% + 1rem);
  top: 50%;
  width: min(15vw, 190px);
  height: 10px;
  margin-top: -5px;
  pointer-events: none;
  background: linear-gradient(90deg, rgba(219, 254, 82, 0.5), rgba(219, 254, 82, 0.5))
    left center / 100% 1px no-repeat;
}
.cr-conn::before,
.cr-conn::after {
  content: '';
  position: absolute;
  top: 50%;
}
/* Left end: a short vertical tick, the way a dimension line is terminated. */
.cr-conn::before {
  left: 0;
  width: 1px;
  height: 10px;
  margin-top: -5px;
  background: rgba(219, 254, 82, 0.5);
}
.cr-conn::after {
  right: 0;
  width: 5px;
  height: 5px;
  margin-top: -2.5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(219, 254, 82, 0.6);
}

/* Chapter rail — right edge, vertically centred. The one element that tells
   you the sequence has more to give. Numbers light up as they are reached and
   dim again on the way back, so it reads as a position, not a counter. */
.cr-index {
  /* Absolute offsets resolve against .cr-overlay's border box, not its
     content box — right:0 would sit flush with the stage edge and clip. */
  position: absolute;
  right: var(--cr-gutter);
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  justify-items: end;
  gap: 1.1rem;
}
.cr-index-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
  justify-items: end;
  font: 500 0.66rem/1 var(--f-mono);
  letter-spacing: 0.22em;
}
.cr-index-list li {
  color: rgba(242, 243, 236, 0.3);
  opacity: 0.3;
  transition: color 0.5s ease, opacity 0.5s ease;
}
/* Driven by data-narr, written straight to the DOM by publishNarr — a class
   binding here would mean a Vue re-render on every chapter change. */
.cr-overlay[data-narr='0'] .cr-index-list li:nth-child(-n + 1),
.cr-overlay[data-narr='1'] .cr-index-list li:nth-child(-n + 2),
.cr-overlay[data-narr='2'] .cr-index-list li:nth-child(-n + 3) {
  opacity: 1;
}
.cr-overlay[data-narr='0'] .cr-index-list li:nth-child(1),
.cr-overlay[data-narr='1'] .cr-index-list li:nth-child(2),
.cr-overlay[data-narr='2'] .cr-index-list li:nth-child(3) {
  color: var(--accent);
}
.cr-index-seam {
  position: relative;
  width: 1px;
  height: clamp(56px, 11vh, 110px);
  background: repeating-linear-gradient(
    180deg,
    rgba(219, 254, 82, 0.4) 0 3px,
    rgba(219, 254, 82, 0) 3px 8px
  );
}
.cr-index-seam::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 55%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(219, 254, 82, 0.6);
}

/* Held back until the last state: through states 01 and 02 you are reading,
   not leaving. The chapter rail carries the "keep going" signal instead. */
.cr-meta {
  font: 500 0.68rem/1.5 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.55);
  text-align: right;
  opacity: var(--narr-end, 0);
  transform: translateY(calc((1 - var(--narr-end, 0)) * 8px));
}
.cr-meta-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.65rem;
}
/* cursor-follow hint — the reason the dwell exists. Accent-coloured and
   gently pulsing so a passing eye catches it before scrolling on. */
.cr-hint {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7em;
  margin: 0;
  padding-bottom: 0.6em;
  font: 500 0.68rem/1.5 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--accent);
}
/* Underscored the way the reference sets it — the rule is what makes the
   corner read as a labelled instrument marking rather than a caption. */
.cr-hint::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(219, 254, 82, 0) 0%,
    rgba(219, 254, 82, 0.55) 14%,
    rgba(219, 254, 82, 0.55) 100%
  );
}
.cr-hint-arrow { opacity: 0.9; }
.cr-hint-label { animation: cr-hint-pulse 2.4s ease-in-out infinite; }
.cr-hint-dot {
  width: 0.5em;
  height: 0.5em;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px rgba(219, 254, 82, 0.6);
  animation: cr-hint-dot 2.4s ease-in-out infinite;
}
@keyframes cr-hint-pulse {
  0%, 100% { opacity: 0.62; }
  50% { opacity: 1; }
}
@keyframes cr-hint-dot {
  0%, 100% { transform: scale(0.8); }
  50% { transform: scale(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .cr-hint, .cr-hint-dot { animation: none; }
}
/* Touch devices have no cursor to move — the hint is wrong copy there, and
   on phone widths it collides with the headline. Head-follow still works
   via touch-drag; the stage just doesn't advertise it with cursor copy. */
@media (hover: none) {
  .cr-hint { display: none; }
}
/* Narrow viewports: the character fills the frame, so a vertically centred
   narrative would land straight on his face. Drop the copy to the bottom of
   the stage (where the headline has always lived on phones) and retire the
   chapter rail — the right gutter it needs no longer exists. */
@media (max-width: 720px) {
  .cr-narrative {
    --cr-tickoff: 0.62rem;
    /* Back to row 2 only: down here the meta stack is left-aligned, so the
       copy and the meta would land on top of each other if it spanned. */
    grid-row: 2;
    max-width: 100%;
    gap: 0.95rem;
    /* Tighter than the desktop standoff — the phone stage has no room to
       spend, and the cursor hint is hidden here anyway. */
    margin-bottom: 1.35rem;
  }
  .cr-line--xl { font-size: clamp(2rem, 10.6vw, 3.2rem); }
  .cr-line--lg { font-size: clamp(1.45rem, 7.4vw, 2.3rem); }
  .cr-line--md { font-size: clamp(1.08rem, 5.3vw, 1.65rem); }
  .cr-line--sm { font-size: clamp(0.94rem, 4.2vw, 1.3rem); }
  /* No right gutter to draw into on a phone — the measure line would run
     under the character or off the stage. */
  .cr-conn { display: none; }
  .cr-index { display: none; }
  .cr-bottom { justify-content: flex-start; }
  .cr-meta-stack { align-items: flex-start; }
  .cr-meta { text-align: left; }
}
</style>
