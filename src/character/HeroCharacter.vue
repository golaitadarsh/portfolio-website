<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";
import setCharacter, { type CharacterOptions } from "./character";
import setLighting, { type LightingOptions } from "./lighting";
import {
  handleMouseMove,
  handleTouchEnd,
  handleHeadRotation,
  handleTouchMove,
} from "./mouseUtils";
import setAnimations from "./animationUtils";
import setupIdleMotion from "./idleMotion";
import { tuneRenderer } from "../perf/deviceTier";
import "./CharacterModel.css";

interface Props {
  cameraPosition?: [number, number, number];
  cameraFov?: number;
  cameraZoom?: number;
  character?: CharacterOptions;
  lighting?: LightingOptions;
  introDelayMs?: number;
  /** True while the stage is fully occluded (doors closed). Animation state
   *  (mixer, head tracking, light tweens) keeps advancing so the character
   *  stays warm, but the actual GPU render is skipped — nothing it draws can
   *  be seen. First visible frame after unpause is identical to an always-on
   *  loop. */
  paused?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  cameraPosition: () => [0, 13.1, 24.7],
  cameraFov: 14.5,
  cameraZoom: 1.1,
  introDelayMs: 100,
  paused: false,
});

const emit = defineEmits<{ (e: "loaded"): void; (e: "failed"): void }>();

const canvasDiv = ref<HTMLDivElement | null>(null);
const hoverDiv = ref<HTMLDivElement | null>(null);

let cleanup: (() => void) | null = null;

/* Everything below runs inside onMounted, but as a named function so the
   hook can wrap the WHOLE of it in one guard. The distinction matters: a
   throw anywhere in here used to abort the hook silently and leave a mounted
   component that never draws and never says why. Now every exit reports. */
function mountStage() {
  if (!canvasDiv.value) {
    emit("failed");
    return;
  }
  const container = canvasDiv.value;
  const rect = container.getBoundingClientRect();
  const aspect = rect.width / rect.height;
  const scene = new THREE.Scene();

  /* WebGL2 can be unavailable for reasons that have nothing to do with the
     GPU's ability — Lockdown Mode, a driver blocklist, an in-app WebView
     that only speaks WebGL1 (three needs 2 since r163). See perf/webgl.ts.

     This used to `return` bare. That was the bug behind "the character
     doesn't show up in a few browsers": the component stayed mounted with an
     empty stage, `failed` was never emitted, so the parent never swapped in
     the fallback and the summary section's control panel sat waiting on a
     rig that was never coming. Silence was the whole failure. */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (err) {
    console.error("[HeroCharacter] WebGL unavailable:", err);
    emit("failed");
    return;
  }
  tuneRenderer(renderer);
  renderer.setSize(rect.width, rect.height);
  // Cap at 2 like every other canvas on the site — 3x-DPR devices pay 2.25x
  // the fill cost for sharpness the eye can't resolve on a lit 3D scene.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  /* Provisional disposer, live from the moment the context exists and
     replaced by the real one at the end of this function. If anything below
     throws, the guard in onMounted calls whichever version is current — so a
     half-built stage still hands its context back instead of leaving a dead
     one to count against the per-page cap and evict a live canvas. */
  cleanup = () => {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };

  const camera = new THREE.PerspectiveCamera(props.cameraFov, aspect, 0.1, 1000);
  camera.position.set(
    props.cameraPosition[0],
    props.cameraPosition[1],
    props.cameraPosition[2]
  );
  camera.zoom = props.cameraZoom;
  camera.updateProjectionMatrix();

  let headBone: THREE.Object3D | null = null;
  let screenLight: any | null = null;
  let mixer: THREE.AnimationMixer | undefined;
  let idleMotion: ReturnType<typeof setupIdleMotion> | null = null;
  let rafId = 0;
  let hoverCleanup: (() => void) | void;
  let introTimer: number | undefined;

  const clock = new THREE.Clock();
  const light = setLighting(scene, props.lighting);
  const { loadCharacter, dispose: disposeCharacter } = setCharacter(
    renderer,
    scene,
    camera,
    props.character
  );

  let mouse = { x: 0, y: 0 };
  let interpolation = { x: 0.1, y: 0.2 };

  // Cursor-follow demo. Most visitors arrive here mid-scroll with a parked
  // mouse, so the headline interaction ("he follows you") never fires and the
  // stage reads as a static render. Until the first real pointer input, drive
  // the look target on a slow scripted arc so the head visibly turns on its
  // own; the first genuine move takes over permanently.
  let userPointed = false;
  let demoTime = 0;
  const DEMO_DELAY_S = 1.2; // visible stage time before the sweep begins
  const DEMO_RAMP_S = 1.2; // ease the amplitude in — no snap from centre
  const DEMO_PERIOD_S = 7; // one full left → right → left cycle
  const demoReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMouseMove = (event: MouseEvent) => {
    userPointed = true;
    handleMouseMove(event, (x, y) => (mouse = { x, y }));
  };
  let touchTimer: number | undefined;
  // Single, removable touchmove handler — gated by `touchTracking`, which the
  // start-timer flips on after the 200ms hold. Previously a fresh anonymous
  // listener was added on every touchstart and never removed, leaking one
  // listener (and closure) per touch and surviving component teardown.
  let touchTracking = false;
  const onTouchMove = (e: TouchEvent) => {
    if (!touchTracking) return;
    userPointed = true;
    handleTouchMove(e, (x, y) => (mouse = { x, y }));
  };
  const onTouchStart = () => {
    touchTimer = window.setTimeout(() => {
      touchTracking = true;
    }, 200);
  };
  const onTouchEndEv = () => {
    clearTimeout(touchTimer);
    touchTracking = false;
    handleTouchEnd((x, y, ix, iy) => {
      mouse = { x, y };
      interpolation = { x: ix, y: iy };
    });
  };

  const onResize = () => {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };

  document.addEventListener("mousemove", onMouseMove);
  container.addEventListener("touchstart", onTouchStart);
  container.addEventListener("touchmove", onTouchMove);
  container.addEventListener("touchend", onTouchEndEv);
  window.addEventListener("resize", onResize);

  loadCharacter().then((gltf) => {
    if (!gltf) return;
    const animations = setAnimations(gltf);
    if (hoverDiv.value) {
      hoverCleanup = animations.hover(gltf, hoverDiv.value);
    }
    mixer = animations.mixer;
    const char = gltf.scene;
    scene.add(char);
    headBone =
      char.getObjectByName("spine006") ||
      char.getObjectByName("Head") ||
      char.getObjectByName("Neck") ||
      null;
    screenLight = char.getObjectByName("screenlight") || null;
    idleMotion = setupIdleMotion(char, gltf.animations);

    introTimer = window.setTimeout(() => {
      light.turnOnLights();
      animations.startIntro();
    }, props.introDelayMs);

    emit("loaded");
  }).catch((err) => {
    // Nothing downstream was watching this promise, so a failed model load —
    // a stalled 4MB download on hotel wifi, a decode error, a lost context
    // mid-load — surfaced as an unhandled rejection and an empty stage that
    // never explained itself. The stage behind is a designed backdrop and
    // stands on its own, so the honest degradation is to leave it and say so
    // in the console rather than pretend a character is still coming.
    console.error("[HeroCharacter] model failed to load:", err);
    emit("failed");
  });

  // A WebGL context can be taken away at any time: the GPU resets, the driver
  // is updated, the tab is backgrounded on a low-memory machine, or the page
  // exceeds the browser's per-page context cap and the oldest is evicted. The
  // default action for this event is permanent — the canvas goes blank and
  // never comes back, which reads to a visitor as "the 3D is broken on my
  // laptop". Preventing the default is what makes the context eligible to be
  // restored at all; parking the loop keeps us from rendering into a dead
  // context in the meantime.
  const canvas = renderer.domElement;
  /* Preventing the default only makes restoration *possible* — it does not
     promise it. A context evicted because the page went over the browser's
     cap stays gone (the cap is still exceeded), and the canvas is then a
     permanently transparent rectangle that reports no error. Give the
     browser a fair window, then treat it as a failure like any other so the
     page can put the fallback up instead of holding an empty stage. */
  const RESTORE_GRACE_MS = 6000;
  let restoreTimer: number | undefined;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    console.warn("[HeroCharacter] WebGL context lost; pausing render loop");
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;
    clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(function giveUp() {
      /* A backgrounded tab is the ordinary reason a restore is late, and
         killing the rig for someone who simply switched tabs would be a
         worse bug than the one this guards. Only judge a visible page. */
      if (document.hidden) {
        restoreTimer = window.setTimeout(giveUp, RESTORE_GRACE_MS);
        return;
      }
      console.error("[HeroCharacter] WebGL context never restored; falling back");
      emit("failed");
    }, RESTORE_GRACE_MS);
  };
  const onContextRestored = () => {
    console.warn("[HeroCharacter] WebGL context restored; resuming");
    clearTimeout(restoreTimer);
    clock.getDelta();
    if (rafId === 0 && inViewport) rafId = requestAnimationFrame(animate);
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  // Two gates, different costs:
  //  · paused prop (doors closed, stage occluded but on screen) — skip only
  //    the GPU render; anim state keeps advancing so the character stays
  //    warm and the first visible frame matches an always-on loop.
  //  · scrolled out of the viewport — sleep the whole loop. The stage sits
  //    above the rest of the page; once the user is past it, ticking the
  //    mixer + head-follow every frame for the rest of the session is pure
  //    waste. The IntersectionObserver restarts the loop on re-entry and
  //    getDelta() swallows the sleep gap.
  let inViewport = true;
  const visObs = new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting);
    if (vis === inViewport) return;
    inViewport = vis;
    if (vis && rafId === 0) {
      clock.getDelta();
      rafId = requestAnimationFrame(animate);
    }
  });
  visObs.observe(container);

  let swayTime = 0;
  const animate = () => {
    if (!inViewport) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(animate);
    // Cap the step so a background-tab pause can't fast-forward the rig.
    const delta = Math.min(clock.getDelta(), 0.066);
    swayTime += delta;
    // Clock only ticks while the stage is actually visible — `paused` means
    // the doors are still shut and nothing here can be seen, so the sweep
    // would otherwise be half over by the time it's revealed.
    if (!userPointed && !demoReduced && !props.paused) {
      demoTime += delta;
      const t = demoTime - DEMO_DELAY_S;
      if (t > 0) {
        const amp = Math.min(1, t / DEMO_RAMP_S);
        const phase = (t / DEMO_PERIOD_S) * Math.PI * 2;
        mouse = {
          x: Math.sin(phase) * 0.78 * amp,
          y: Math.sin(phase * 0.5 + 0.6) * 0.22 * amp,
        };
      }
    }
    if (headBone) {
      handleHeadRotation(
        headBone,
        mouse.x,
        mouse.y,
        interpolation.x,
        interpolation.y,
        THREE.MathUtils.lerp,
        swayTime
      );
      light.setPointLight(screenLight);
    }
    if (mixer) mixer.update(delta);
    // After the mixer — it stomps every torso bone it animates, so the
    // breathing/weight-shift offsets must layer onto the fresh pose.
    if (idleMotion) idleMotion.update(swayTime);
    if (!props.paused) {
      renderer.render(scene, camera);
    }
  };
  animate();

  cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(touchTimer);
    clearTimeout(introTimer);
    clearTimeout(restoreTimer);
    visObs.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchmove", onTouchMove);
    container.removeEventListener("touchend", onTouchEndEv);
    window.removeEventListener("resize", onResize);
    hoverCleanup?.();
    disposeCharacter();
    light.dispose();
    // scene.clear() only detaches children — GPU buffers stay alive until
    // geometries/materials/textures are disposed explicitly.
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m: any) => {
        if (!m) return;
        Object.values(m).forEach((v: any) => {
          if (v && v.isTexture) v.dispose();
        });
        m.dispose?.();
      });
    });
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    scene.clear();
    renderer.dispose();
    // dispose() releases three's GPU objects but not the WebGL context itself.
    // This page holds three contexts at once (hero rig, summary rig, fluid
    // trail) and browsers cap the total (Chrome: 16), evicting the OLDEST past
    // the cap — so contexts leaked across route round-trips blank a canvas
    // that is still on screen. Release it explicitly.
    renderer.forceContextLoss();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };
}

onMounted(() => {
  try {
    mountStage();
  } catch (err) {
    /* Anything at all — a driver that rejects a shadow map, an extension
       probe that throws, a layout read on a detached node. Vue swallows a
       throw from a lifecycle hook into a warning; the visitor just gets a
       stage with nothing on it. Report it and let the parent show the
       fallback, which is the same outcome as every other failure here. */
    console.error("[HeroCharacter] stage init failed:", err);
    try {
      cleanup?.();
    } catch {
      /* never let teardown mask the original failure */
    }
    cleanup = null;
    emit("failed");
  }
});

onBeforeUnmount(() => {
  cleanup?.();
});
</script>

<template>
  <div class="character-container">
    <div class="character-model" ref="canvasDiv">
      <div class="character-hover" ref="hoverDiv"></div>
    </div>
  </div>
</template>
