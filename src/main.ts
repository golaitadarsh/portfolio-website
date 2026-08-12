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

router.isReady().then(
  () => {
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
    signalReady()
  },
)
