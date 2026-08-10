# Portfolio — Adarsh Golait

Source for [adarsh-golait.vercel.app](https://adarsh-golait.vercel.app). A
single-page Vue app with a scroll-driven hero, a rigged 3D character, and five
detail routes.

## Stack

| | |
|---|---|
| Framework | Vue 3.5 (`<script setup>`, TypeScript) |
| Build | Vite 6 |
| Routing | vue-router 4, history mode |
| Animation | GSAP (ScrollTrigger pinning), motion-v |
| 3D | three.js + three-stdlib, Draco-compressed GLB |
| Analytics | `@vercel/analytics` |
| Hosting | Vercel (static output) |

## Running it

```bash
npm install
npm run dev      # vite dev server
npm run build    # vue-tsc typecheck + production build to dist/
npm run preview  # serve the built output
```

Node 24 is what this is developed against. No environment variables and no
backend — the build output is entirely static.

> **Apple Silicon note.** If `npm run dev` dies with
> `Cannot find module @rollup/rollup-darwin-arm64` or an esbuild host mismatch,
> npm resolved the x64 optional binaries. Reinstall both arm64 packages in a
> single command (installing them one at a time prunes the other), and keep
> `--no-save` so they never reach `package.json`:
>
> ```bash
> npm install --no-save --force \
>   "@esbuild/darwin-arm64@$(node -p "require('./node_modules/esbuild/package.json').version")" \
>   "@rollup/rollup-darwin-arm64@$(node -p "require('./node_modules/rollup/package.json').version")"
> ```

## Layout

```
src/
  views/          six routes — Portfolio (home) + Education, Experience,
                  Projects, Leadership, Recognition
  components/     Topbar, PageFoot, and the portfolio/ section components
  character/      three.js character rig, shared across hero and summary
  composables/    scroll and viewport helpers
  layouts/        DetailLayout shared by the five detail routes
public/
  models/         Draco-compressed GLB — one rig, animation-only clips
  draco/          Draco decoder (vendored)
```

## Things worth stealing

- **Scroll-pinned hero** — GSAP ScrollTrigger driving a zoom sequence, with nav
  anchors offset so links land *inside* a pinned section rather than past it.
- **One rig, many clips** — the character GLB carries the mesh; the files in
  `public/models/anims/` are animation-only and strip their geometry, so a
  second pose costs kilobytes rather than megabytes.
- **Scroll loops that sleep** — every `requestAnimationFrame` loop bails when
  its surface is offscreen, and WebGL contexts are force-lost on unmount
  because `renderer.dispose()` alone leaves the context alive and browsers cap
  how many can exist at once.
- **`vercel.json` rewrite** — the SPA catch-all excludes `/_vercel/`, otherwise
  it swallows the analytics script and tracking silently collects nothing.

## License

Code is MIT — see [LICENSE](LICENSE). Take the components, the scroll
mechanics, the build setup.

**Content is not.** The photographs, 3D likeness, written biography, and the
career record throughout `src/views/` and `assets/` are personal and stay
copyright Adarsh Golait, all rights reserved. Fork the machinery, bring your
own life.
