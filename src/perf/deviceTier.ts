/* ============================================================
   DEVICE TIER — how much decorative GPU work this machine can carry

   The hero stacks five independent drawing surfaces on one viewport
   (HeroSection's fluid sim, DotField, FluidCursor, HeroCharacter, the
   BeamsBackground 2D canvas). On an M-series Mac that is fine. On a
   mid-range laptop it is not: measured at 4x CPU throttle / DPR 2, the
   five inits together blocked the main thread for ~9.7s and left scrolling
   at a 33ms median frame — a visibly broken page.

   Nothing here changes what a capable machine renders. `tier` is 'high'
   for anything that clears the bar, and every caller is written so that
   'high' takes exactly the path it took before this module existed. The
   only machines that lose a surface are the ones currently getting 30fps,
   for which fewer layers is an upgrade, not a downgrade.
   ============================================================ */

export type Tier = 'high' | 'low'

/* Static hints, read once. All of these are advisory — browsers round or
   omit them — so any single one is only allowed to *contribute* to a
   verdict, never to decide it on its own except at the extreme low end. */
function staticHints() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  /* Chrome/Edge only, quantised to 0.25/0.5/1/2/4/8. Absent on Safari and
     Firefox, where `undefined` must not read as "low". */
  const mem = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null
  /* Present everywhere. Reports logical cores, so a 4-core/8-thread laptop
     says 8 — the threshold is set against threads, not physical cores. */
  const cores = typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null
  return { mem, cores }
}

/* Frame-time sampling during the load window.

   The static hints miss the case that actually matters most: a machine with
   plenty of cores and a weak or throttled GPU (integrated graphics, a hot
   laptop, a VM, battery saver). Those report 8 cores and 8GB and then drop
   frames anyway. So we also watch how the first couple of seconds actually
   went, and let measured jank override a passing hint.

   The sampler is a single rAF chain that stops itself after SAMPLE_MS. It
   allocates one array of ~120 numbers and does one subtraction per frame —
   far below the cost of anything it is measuring. */
const SAMPLE_MS = 2600
const frames: number[] = []
let sampling = false
let sampleDone = false

function startSampling() {
  if (sampling || sampleDone || typeof window === 'undefined') return
  sampling = true
  const t0 = performance.now()
  let last = t0
  const tick = (t: number) => {
    frames.push(t - last)
    last = t
    if (t - t0 < SAMPLE_MS) requestAnimationFrame(tick)
    else { sampling = false; sampleDone = true; recordVerdict() }
  }
  requestAnimationFrame(tick)
}

/* Median frame time over the sample, or null while there is not yet enough
   to judge. Median rather than mean: one 400ms GLB parse should not condemn
   a machine that is otherwise holding 60fps. */
function measuredFrameMs(): number | null {
  if (frames.length < 24) return null
  const s = frames.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* A machine is 'low' if the static hints put it at the bottom of the range,
   or if the frames we actually measured during load came in worse than
   ~40fps sustained. 25ms is deliberately lenient: 60fps is 16.7ms and a
   loading page legitimately misses some frames, so this only trips on a
   machine that is genuinely struggling rather than merely busy. */
const SLOW_FRAME_MS = 25

/* Remembered verdict from a previous visit.

   The measurement above is the only signal that reliably catches a machine
   with a weak GPU behind a healthy-looking core count, and it needs a couple
   of seconds of frames to exist. But the callers that most want an answer —
   the ones deciding whether to create a WebGL context at all — have to decide
   during component setup, when the sample is still empty. Asking them to wait
   would mean either mounting a surface and pulling it back out (a visible pop
   on every fast machine) or holding the hero blank until the probe finishes.

   So the verdict is written down and read back on the next visit. A weak
   laptop pays full price exactly once and is recognised instantly from then
   on. A fast machine writes 'high', reads 'high', and nothing about it ever
   changes. The static hints below still fire on the first visit for machines
   that are unambiguously at the bottom. */
const STORE_KEY = 'aglTier'

function readStored(): Tier | null {
  try {
    const v = localStorage.getItem(STORE_KEY)
    return v === 'low' || v === 'high' ? v : null
  } catch {
    return null
  }
}

function writeStored(t: Tier) {
  try {
    localStorage.setItem(STORE_KEY, t)
  } catch {
    /* private mode / storage disabled — measuring again next time is fine */
  }
}

let cached: Tier | null = null

/* Decide from the completed sample and persist it. Called once, when the
   sampler stops — not from deviceTier(), so that a caller asking early can
   never cause a verdict to be recorded from two frames of data. */
function recordVerdict() {
  const fps = measuredFrameMs()
  if (fps === null) return
  const { mem, cores } = staticHints()
  const weakHint = (cores !== null && cores <= 4) || (mem !== null && mem <= 4)
  const verdict: Tier = fps > SLOW_FRAME_MS || (weakHint && fps > 20) ? 'low' : 'high'

  /* A session already running in low mode is not allowed to promote itself.
     It will almost always measure well — that is the entire point of having
     dropped two surfaces — and reading those frames as "the machine got
     faster" would send the next visit back to full fidelity, where it would
     measure badly again and demote, then promote, then demote. The visitor
     would get a different site every other reload. Good frames earned by
     degradation are evidence the degradation is working, not evidence it is
     no longer needed. Only a session that ran at full fidelity may write
     'high'; clearing site data is the way back up. */
  if (verdict === 'high' && cached === 'low') return

  writeStored(verdict)
}

export function deviceTier(): Tier {
  if (cached) return cached
  const { mem, cores } = staticHints()

  /* Hard floor — no measurement needed. A 2-core machine or one reporting
     2GB cannot carry five surfaces under any circumstances. */
  if ((cores !== null && cores <= 2) || (mem !== null && mem <= 2)) return (cached = 'low')

  /* What this machine did last time, available immediately at setup. */
  const stored = readStored()
  if (stored === 'low') return (cached = 'low')

  /* Soft floor: low-ish hints only count when the frames agree with them.
     4 threads describes both a 2015 ultrabook and a perfectly happy budget
     desktop, so it is not enough on its own. */
  const weakHint = (cores !== null && cores <= 4) || (mem !== null && mem <= 4)
  const fps = measuredFrameMs()

  if (fps !== null && fps > SLOW_FRAME_MS) return (cached = 'low')
  if (weakHint && fps !== null && fps > 20) return (cached = 'low')

  /* Nothing disqualifying, or not enough evidence yet. Not cached when the
     sample is still short — an early caller must not lock in 'high' before
     the measurement that would have demoted it has had a chance to run, which
     is what lets a late caller like FluidCursor get the better answer. */
  if (fps === null) return 'high'
  return (cached = 'high')
}

/* Callers that mount a surface *late* (FluidCursor waits for the first
   pointer move) get a better verdict than callers that must decide at mount,
   because by then the sampler has real data. This is the same function; it
   exists as a named export so the intent reads at the call site. */
export const deviceTierNow = deviceTier

/* Device pixel ratio cap for decorative full-screen surfaces.

   'high' keeps the existing cap of 2 — byte-identical output to before.
   'low' drops to 1.5, which is 44% fewer pixels per frame per surface. On
   the surfaces this is applied to (a blurred beam field, a fluid smear)
   1.5x is indistinguishable from 2x, and those machines are dropping frames
   at 2x anyway. */
export function maxPixelRatio(tier: Tier = deviceTier()): number {
  return tier === 'high' ? 2 : 1.5
}

/* Three.js checks every compiled shader and linked program for errors by
   calling getShaderInfoLog / getProgramInfoLog / getProgramParameter right
   after submitting them. Each of those is a synchronous round trip that
   forces the driver to finish compiling before it can answer — measured at
   281ms of pure info-log time across the four renderers on an M-series Mac,
   several times that on a weak GPU.

   The shaders here are fixed and known-good: they ship compiled into the
   bundle and cannot vary at runtime. Checking them on every visitor's
   machine buys nothing. Dev builds keep the checks so a broken shader still
   reports itself while it is being written. */
export function tuneRenderer(renderer: { debug: { checkShaderErrors: boolean } }) {
  if (!import.meta.env.DEV) renderer.debug.checkShaderErrors = false
}

/* Serialised GL initialisation.

   Creating a WebGL context is not cheap and is not interruptible:
   getContext + getExtension probing + the first setSize measured ~1.7s of
   main-thread time across the hero's contexts, unthrottled. When several
   surfaces mount in the same tick that lands as ONE unbroken block, which
   is what froze the loading screen and delayed even the failsafe timer
   (a setTimeout cannot fire while the main thread is blocked).

   Spreading the same work over separate frames does not make it smaller,
   but it makes it yield: the loader keeps animating, the failsafe fires on
   time, and input stays responsive. Callers await a slot, then init. */
let slotChain: Promise<void> = Promise.resolve()

export function glInitSlot(): Promise<void> {
  const mine = slotChain.then(
    () => new Promise<void>((resolve) => {
      /* Two frames, not one: the first lets the previous surface's init
         paint, the second lets the compositor settle before we hand the
         main thread to the next block of driver work. */
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }),
  )
  slotChain = mine
  return mine
}

/* Start measuring as soon as this module is imported — which happens during
   the initial chunk, so the sample covers exactly the window we care about. */
startSampling()
