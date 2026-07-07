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

  const onMouseMove = (event: MouseEvent) => {
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

    introTimer = window.setTimeout(() => {
      light.turnOnLights();
      animations.startIntro();
    }, props.introDelayMs);

    emit("loaded");
  });

  // Skip GPU renders while the stage is occluded (paused prop, doors closed)
  // or scrolled out of the viewport. State updates above the render call
  // still run every frame, so the first rendered frame after a gate opens is
  // exactly what an always-on loop would have shown.
  let inViewport = true;
  const visObs = new IntersectionObserver((entries) => {
    inViewport = entries.some((e) => e.isIntersecting);
  });
  visObs.observe(container);

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    if (headBone) {
      handleHeadRotation(
        headBone,
        mouse.x,
        mouse.y,
        interpolation.x,
        interpolation.y,
        THREE.MathUtils.lerp
      );
      light.setPointLight(screenLight);
    }
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (!props.paused && inViewport) {
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
