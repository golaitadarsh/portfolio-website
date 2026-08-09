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

const emit = defineEmits<{ (e: "loaded"): void }>();

const canvasDiv = ref<HTMLDivElement | null>(null);
const hoverDiv = ref<HTMLDivElement | null>(null);

let cleanup: (() => void) | null = null;

onMounted(() => {
  if (!canvasDiv.value) return;
  const container = canvasDiv.value;
  const rect = container.getBoundingClientRect();
  const aspect = rect.width / rect.height;
  const scene = new THREE.Scene();

  // WebGL can be unavailable (browser policy, headless, old GPU). The 3D
  // character is progressive enhancement — bail to the empty stage backdrop
  // rather than throwing from the mounted hook.
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return;
  }
  renderer.setSize(rect.width, rect.height);
  // Cap at 2 like every other canvas on the site — 3x-DPR devices pay 2.25x
  // the fill cost for sharpness the eye can't resolve on a lit 3D scene.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

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
  });

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
