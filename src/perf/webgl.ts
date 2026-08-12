/* ============================================================
   WEBGL AVAILABILITY — asked once, before anything is mounted

   Every 3D surface on this site is built on three r184, and three dropped
   WebGL1 back in r163: `new THREE.WebGLRenderer()` asks the canvas for a
   'webgl2' context and throws "Error creating WebGL context." if it doesn't
   get one. There is no WebGL1 path to fall back to.

   That throw is not rare in the wild, and it is not the same thing as "old
   machine". A browser hands back null for reasons that have nothing to do
   with whether the GPU could have done the work:

     · Lockdown Mode on iOS/macOS Safari switches WebGL off outright.
     · Firefox and Chrome maintain driver blocklists — a laptop with an
       Intel HD or an out-of-date driver gets WebGL2 disabled by policy
       while WebGL1 keeps working.
     · Older Android WebViews (the in-app browsers inside LinkedIn,
       Instagram, Gmail) ship engines with WebGL1 only.
     · Privacy builds, enterprise policy, RDP/VM sessions, headless.

   Each of those is a *deterministic* property of the visitor's browser, not
   a transient failure: that person sees the same empty stage on every visit,
   while everyone else sees the character and nobody can reproduce it.

   Asking once, up front, is what lets the page choose the still-image
   fallback instead of mounting a rig that cannot draw. It also keeps the
   answer consistent across the four surfaces that would otherwise each
   discover it separately, four frames apart, with four console errors.
   ============================================================ */

let cached: boolean | null = null

/** True when a WebGL2 context can actually be created on this machine. */
export function hasWebGL2(): boolean {
  if (cached !== null) return cached
  if (typeof document === 'undefined') return (cached = false)
  try {
    const canvas = document.createElement('canvas')
    /* No attributes: the probe must answer the narrowest question ("can a
       webgl2 context exist here"), never fail for a reason the real
       renderers wouldn't hit. antialias/alpha are honoured or quietly
       dropped by the driver — they cannot fail context creation — so asking
       for them here would only add ways to get a false negative. */
    const gl = canvas.getContext('webgl2')
    if (!gl) return (cached = false)
    /* Give the slot straight back. Contexts are a capped per-page resource
       and the browser evicts the OLDEST one past the cap — a probe that
       held on to one would be the thing that blanks a live canvas later. */
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return (cached = true)
  } catch {
    return (cached = false)
  }
}
