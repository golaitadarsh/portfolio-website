import { onBeforeUnmount, ref } from 'vue'

/**
 * Open/close state for the phone-width nav sheet, shared by the two topbars
 * (Topbar.vue on the detail routes, the inline header in Portfolio.vue).
 *
 * No body scroll-lock on purpose. The obvious lock — `body { position: fixed;
 * top: -scrollY }` — breaks the sticky topbar: with body fixed there is no
 * scrolling box, so the bar renders at its static position (shifted off the
 * top of the screen by the stashed offset) and the Close button goes with it.
 * The sheet is an opaque fixed panel with `overscroll-behavior: contain`, so
 * a drag on it scrolls the sheet and never chains to the page — which is the
 * whole point of the lock, without the side effect. It also leaves hash
 * anchors landing on real scroll positions.
 */
export function useMobileNav() {
  const open = ref(false)

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open.value = false
  }
  window.addEventListener('keydown', onKey)

  // Widening past the breakpoint (rotation, tablet split-view) brings the row
  // nav back; leaving `is-open` set would then apply sheet-only state to it.
  // Must stay in step with the sheet's media query in style.css.
  const mq = window.matchMedia('(max-width: 720px), (max-width: 1024px) and (max-height: 500px)')
  const onMq = (e: MediaQueryListEvent) => { if (!e.matches) open.value = false }
  mq.addEventListener?.('change', onMq)

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    mq.removeEventListener?.('change', onMq)
  })

  return {
    open,
    toggle: () => { open.value = !open.value },
    close:  () => { open.value = false },
  }
}
