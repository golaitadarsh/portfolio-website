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
}

const props = withDefaults(defineProps<Props>(), {
  cameraPosition: () => [0, 13.1, 24.7],
  cameraFov: 14.5,
  cameraZoom: 1.1,
  introDelayMs: 100,
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

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(window.devicePixelRatio);
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

  const clock = new THREE.Clock();
  const light = setLighting(scene, props.lighting);
  const { loadCharacter } = setCharacter(renderer, scene, camera, props.character);

  let mouse = { x: 0, y: 0 };
  let interpolation = { x: 0.1, y: 0.2 };

  const onMouseMove = (event: MouseEvent) => {
    handleMouseMove(event, (x, y) => (mouse = { x, y }));
  };
  let touchTimer: number | undefined;
  const onTouchStart = (event: TouchEvent) => {
    const el = event.target as HTMLElement;
    touchTimer = window.setTimeout(() => {
      el?.addEventListener("touchmove", (e: TouchEvent) =>
        handleTouchMove(e, (x, y) => (mouse = { x, y }))
      );
    }, 200);
  };
  const onTouchEndEv = () => {
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

    setTimeout(() => {
      light.turnOnLights();
      animations.startIntro();
    }, props.introDelayMs);

    emit("loaded");
  });

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
    renderer.render(scene, camera);
  };
  animate();

  cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(touchTimer);
    document.removeEventListener("mousemove", onMouseMove);
    container.removeEventListener("touchstart", onTouchStart);
    container.removeEventListener("touchend", onTouchEndEv);
    window.removeEventListener("resize", onResize);
    hoverCleanup?.();
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
