import { createApp, nextTick } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Tell the loading screen when the page behind it is genuinely ready.
//
// It used to wait on window 'load', which does not fire until every image and
// font on the document has finished — including the ones metres below the fold.
// That tied the loader to the slowest asset on the page instead of to the only
// thing it is covering: the initial route being resolved, mounted and painted.
//
// router.isReady() resolves once the async route component has loaded and the
// initial navigation is complete; nextTick lets Vue flush it into the DOM, and
// the double rAF waits for the frame that actually puts it on screen. Anything
// still downloading at that point is below the fold and can arrive in its own
// time. The loader keeps 'load' and a timeout as backstops, so this event
// failing to fire delays the exit rather than preventing it.
const signalReady = () => window.dispatchEvent(new Event('agl:ready'))

/* A route chunk that fails to import is almost always one specific thing in
   production: a visitor holding a cached index.html from the previous deploy.
   The hashed filenames it asks for were replaced at build time, and this
   project's SPA rewrite answers the resulting 404 with index.html — so the
   browser tries to parse HTML as an ES module and the import rejects. The
   page then renders nothing at all, because the route component never
   resolves. No amount of retrying that URL helps; the only fix is to fetch
   the current index.html.

   Reload exactly once. The session flag is what makes that safe: if the
   import failed for a reason a reload cannot fix (offline, a blocked CDN)
   the second attempt reports the error normally instead of looping. If
   sessionStorage is unavailable at all — Safari in private mode throws on
   access — we cannot prove it is the first attempt, so we don't reload. */
const RELOAD_KEY = 'agl:chunk-reload'

function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err)
  return /dynamically imported module|Importing a module script failed|expected a JavaScript(-or-Wasm)? module/i.test(msg)
}

function reloadOnceForStaleDeploy(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    return false
  }
  console.warn('[main] stale asset manifest — reloading once to pick up the current build')
  window.location.reload()
  return true
}

router.isReady().then(
  () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY)
    } catch {
      /* storage disabled — nothing to clear */
    }
    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(signalReady)
      })
    })
  },
  (err) => {
    // The initial navigation failed — a route chunk that 404s after a deploy,
    // a guard that threw. Without this the rejection is unhandled AND the
    // loader never hears anything, so it sits there until its own timeout
    // instead of getting out of the way of whatever the app managed to render.
    console.error('[main] initial route failed to resolve:', err)
    if (isChunkLoadError(err) && reloadOnceForStaleDeploy()) return
    signalReady()
  },
)
