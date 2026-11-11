/**
 * Where the hero portrait actually lands on screen.
 *
 * Two components need to agree about this and they used to guess separately:
 *
 *   HeroSection.vue  renders the photo (a WebGL cover-fit into the hero
 *                    viewport) and therefore DEFINES where the subject sits.
 *   Portfolio.vue    crops a window out of that render and flies it into the
 *                    page-2 slot, so it has to KNOW where the subject sits.
 *
 * Portfolio's crop was a pair of hand-tuned magic numbers (cropY 0.47, a
 * compact characterSize of 1.05) fitted by eye against one particular hero
 * framing. The moment the hero framing changed — adding the portrait cap
 * below so phones stopped showing a passport-sized face — those numbers were
 * silently wrong and the landed plate grew a dead grey band above the head.
 *
 * Nothing here is new behaviour on its own; it is the geometry both sides
 * were already assuming, written down once so it cannot drift again.
 */

/** Source image aspect ratios for the cover fit. */
export const BASE_ASP = 1277 / 878
export const LAYERED_ASP = 1512 / 1040

/**
 * Subject landmarks, as fractions of the SOURCE image (assets/base-photo.png,
 * 1277x878), measured off its alpha channel. `crownY` is the first wisp of
 * hair, not the solid mass, so framing against it never clips the silhouette.
 * Re-measure these if the photo is ever replaced.
 */
export const SUBJECT = {
  /** Top of the hair. */
  crownY: 0.038,
  /** Eye line. Also the anchor the cover fit positions against. */
  eyeY: 0.149,
  /** Jaw bottom, just above the neck's narrowest point (0.592). */
  chinY: 0.560,
  /** Where the shoulders have fully flared. */
  shoulderY: 0.750,
  /** Half the widest head measure (hair + ears), as a fraction of image W. */
  headHalfW: 0.182,
  /** Head centre — the subject is very slightly right of image centre. */
  headCX: 0.507,
} as const

// ── cover-fit levers ────────────────────────────────────────────────────────
const PHOTO_H_FRAC = 0.92
const TARGET_EYE_Y = 0.72
/**
 * Portrait-viewport guard. The height-first fit sizes the photo to 92% of the
 * viewport HEIGHT and centres it — correct on any landscape screen, where the
 * 1.45:1 source lands a touch narrower than the viewport and you see the whole
 * head with air around it. On a portrait phone the same rule renders the photo
 * 2.7x the viewport WIDTH, so the crop samples ~37% of the frame: a
 * passport-sized face with the hair sliced off by the top edge.
 *
 * Cap the rendered width instead. This cannot touch a laptop: at the square
 * boundary (vpW === vpH) the natural width is PHOTO_H_FRAC * BASE_ASP =
 * 1.338x vw, already under the cap, so it only begins to bite at
 * vpW/vpH < ~0.84 — and it engages continuously from zero, so there is no
 * discontinuity at the orientation boundary.
 */
const PORTRAIT_MAX_W_FRAC = 1.8
/**
 * Where the eyes sit on screen once the cap is fully engaged. The uncapped
 * 0.72 (eyes high, body filling the frame below) assumes a crop tight enough
 * that there is no headroom to show; a pulled-back portrait needs the eyes
 * nearer mid-screen or the figure floats at the top over dead space.
 */
const PORTRAIT_EYE_Y = 0.42

/**
 * Rendered size of one source plate inside a hero viewport, after the
 * portrait cap. `imgAsp` defaults to the base photo; the layered plate is a
 * hair wider (1.4538 vs 1.4544) and runs the same cap against its own ratio.
 */
export function heroPhotoBox(vpW: number, vpH: number, imgAsp: number = BASE_ASP) {
  let photoH = vpH * PHOTO_H_FRAC
  let photoW = photoH * imgAsp
  const maxW = vpW * PORTRAIT_MAX_W_FRAC
  let targetEyeY = TARGET_EYE_Y
  if (photoW > maxW) {
    // t = 1 uncapped, → 0 as the viewport gets narrower relative to tall.
    const t = maxW / photoW
    photoW = maxW
    photoH = photoW / imgAsp
    targetEyeY = TARGET_EYE_Y * t + PORTRAIT_EYE_Y * (1 - t)
  }
  return { photoW, photoH, targetEyeY }
}

/**
 * UV transform for the display shader. Screen uv → texture uv, bottom-up,
 * so `eyeUv` is measured from the BOTTOM of the texture.
 */
export function heroFitUV(
  vpW: number,
  vpH: number,
  imgAsp: number,
  eyeUv: number,
  xNudge = 0,
) {
  const { photoW, photoH, targetEyeY } = heroPhotoBox(vpW, vpH, imgAsp)
  const sx = vpW / photoW
  const sy = vpH / photoH
  const ox = -(sx - 1) / 2 - xNudge * sx
  const oy = eyeUv - targetEyeY * sy
  return { sx, sy, ox, oy }
}

/**
 * Where the subject lands inside the hero viewport, in CSS px from the hero's
 * top-left. This is what the page-2 crop needs in order to frame a head and
 * shoulders instead of guessing at a viewport fraction.
 */
export function heroSubjectBox(vpW: number, vpH: number) {
  const { photoW, photoH, targetEyeY } = heroPhotoBox(vpW, vpH)
  // targetEyeY is a bottom-up screen fraction; convert to px from the top.
  const eyePx = (1 - targetEyeY) * vpH
  const photoTop = eyePx - SUBJECT.eyeY * photoH
  return {
    photoTop,
    photoH,
    photoW,
    crownY: photoTop + SUBJECT.crownY * photoH,
    chinY: photoTop + SUBJECT.chinY * photoH,
    shoulderY: photoTop + SUBJECT.shoulderY * photoH,
    headW: SUBJECT.headHalfW * 2 * photoW,
    headCX: vpW / 2 + (SUBJECT.headCX - 0.5) * photoW,
  }
}

/**
 * "Compact" = the hero stage should present a PORTRAIT slot rather than the
 * wide editorial one.
 *
 * Width alone was the old test, and it got two cases wrong in opposite
 * directions. A 768x1024 tablet missed the 720px bar and so asked for a
 * 24:14 letterbox out of a tall portrait render — the landed plate reduced
 * to a strip of eyes. A 667x375 handset in landscape passed it and so asked
 * for a 3:4 portrait slot inside a 312px-tall stage, which the frame then
 * overflowed. Neither is about width; both are about SHAPE.
 *
 * So: portrait slot when the viewport is narrow or tall-ish, and never when
 * it is too short to stand a portrait up in. A laptop is wider than it is
 * tall and taller than 500px, so it matches nothing here.
 *
 * MUST stay character-identical to the `.im-frame` media queries in
 * Portfolio.vue. If JS picks the portrait slot while CSS draws the landscape
 * frame, the landed plate and the frame it is meant to fill disagree.
 * Written in Level-3 syntax (no `not`) so Safari can't disagree either.
 */
export const COMPACT_MEDIA =
  '(min-height: 501px) and (max-width: 720px), (min-height: 501px) and (max-aspect-ratio: 4/5)'

export function isCompactViewport() {
  return (
    typeof window !== 'undefined' && window.matchMedia(COMPACT_MEDIA).matches
  )
}
