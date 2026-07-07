<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import setCharacter, { type CharacterOptions } from "./character";
import setLighting, { type LightingOptions } from "./lighting";
import {
  handleMouseMove,
  handleTouchEnd,
  handleHeadRotation,
  handleTouchMove,
} from "./mouseUtils";
import "./CharacterModel.css";

/**
 * One character, one WebGL context, three phases — the whole point is that
 * there is never a cut:
 *
 *   stage    · lives inside the door stage (.cr-bg), framed head-and-
 *              shoulders exactly like the old HeroCharacter. Head follows
 *              the cursor.
 *   flight   · breakout(slotEl) teleports THIS canvas (same context, same
 *              scene, same mixer) to a fixed full-viewport overlay and flies
 *              the character along an arc from his exact on-stage screen
 *              rect to the live summary slot rect, playing jump.glb, while
 *              the page scroll-tweens underneath. The slot rect is re-read
 *              every frame, so even if the user grabs the wheel mid-flight
 *              he still lands on the slot.
 *   summary  · projected onto the slot rect every frame (so CSS transforms
 *              on the slot — the push-out — drag him around for free).
 *              Idle = waiting.glb with Head/Neck stripped so cursor-follow
 *              keeps working; action buttons play one-shot clips; pushing
 *              loops pushing.glb. returnToStage() flies him back up.
 *
 * Placement math: camera is FIXED (same lens as the stage shot). To put the
 * character in a viewport rect we solve for the world position whose
 * projection is that rect — distance from desired pixel height, X/Y from the
 * rect centre unprojected at that depth. Bone-bbox measurements only:
 * Box3.setFromObject lies on this rig (bind-pose ignores armature scale).
 */

interface Props {
  cameraPosition?: [number, number, number];
  cameraFov?: number;
  cameraZoom?: number;
  character?: CharacterOptions;
  lighting?: LightingOptions;
  introDelayMs?: number;
  paused?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  cameraPosition: () => [0, 13.1, 24.7],
  cameraFov: 14.5,
  cameraZoom: 1.1,
  introDelayMs: 100,
  paused: false,
});

const emit = defineEmits<{
  (e: "loaded"): void;
  (e: "state", s: { ready: boolean; busy: boolean; phase: string; pushing: boolean }): void;
}>();

type ClipName = "waiting" | "jump" | "back_flip" | "dancing" | "push_ups" | "pushing";
type Phase = "stage" | "flight" | "summary" | "flight-back";

const canvasDiv = ref<HTMLDivElement | null>(null);
const hostDiv = ref<HTMLDivElement | null>(null);
const teleported = ref(false);

let cleanup: (() => void) | null = null;

// Exposed API — implementations assigned inside onMounted.
let breakoutImpl: (slotEl: HTMLElement) => void = () => {};
let returnToStageImpl: () => void = () => {};
let playActionImpl: (name: ClipName) => void = () => {};
let setPushingImpl: (on: boolean) => void = () => {};
defineExpose({
  breakout: (el: HTMLElement) => breakoutImpl(el),
  returnToStage: () => returnToStageImpl(),
  playAction: (name: string) => playActionImpl(name as ClipName),
  setPushing: (on: boolean) => setPushingImpl(on),
});

function stripTracks(clip: THREE.AnimationClip, boneNames: string[]) {
  const tracks = clip.tracks.filter(
    (t) => !boneNames.some((b) => t.name.startsWith(`${b}.`))
  );
  return new THREE.AnimationClip(clip.name + "_stripped", clip.duration, tracks);
}

// Pin root translation to its first-frame X/Z (Y kept so jumps still rise).
// Clips carry root motion that would walk the character out of frame — the
// placement solver owns all travel instead.
function lockRootXZ(clip: THREE.AnimationClip) {
  for (const t of clip.tracks) {
    if (!t.name.endsWith(".position") || t.getValueSize() !== 3) continue;
    const vals = t.values;
    const x0 = vals[0];
    const z0 = vals[2];
    for (let i = 0; i < vals.length; i += 3) {
      vals[i] = x0;
      vals[i + 2] = z0;
    }
  }
  return clip;
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

onMounted(() => {
  const container = canvasDiv.value;
  const host = hostDiv.value;
  if (!container || !host) return;
  const rect = container.getBoundingClientRect();
  const aspect = rect.width / Math.max(1, rect.height);
  const scene = new THREE.Scene();

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return; // progressive enhancement — leave the empty stage backdrop
  }
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(props.cameraFov, aspect, 0.1, 1000);
  camera.position.set(...props.cameraPosition);
  camera.zoom = props.cameraZoom;
  camera.updateProjectionMatrix();

  const clock = new THREE.Clock();
  const light = setLighting(scene, props.lighting);
  const { loadCharacter, dispose: disposeCharacter } = setCharacter(
    renderer,
    scene,
    camera,
    props.character
  );

  // ── state ──────────────────────────────────────────────────────────
  let phase: Phase = "stage";
  let ready = false;
  let busy = false;
  let pushingOn = false;
  let charRoot: THREE.Object3D | null = null;
  let headBone: THREE.Object3D | null = null;
  let hipsBone: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let rafId = 0;
  let introTimer: number | undefined;
  let slotEl: HTMLElement | null = null;

  // Character metrics (world units, constant — scale never changes).
  let worldH = 10;
  let centerYOffset = 5; // bbox centre Y minus charRoot Y
  let hipsRestY = 0;

  // Stage pose (what setCharacter applied) — restored on return.
  const stagePos = new THREE.Vector3();
  let stageYaw = 0;
  // Character bbox in stage-canvas UV space, captured at load — lets the
  // reverse flight aim at wherever the stage currently sits on screen.
  let stageRectUV = { x: 0.5, y: 0.5, w: 0.3, h: 1.5 };

  const IDLE_YAW = THREE.MathUtils.degToRad(-12);
  const PUSH_YAW = THREE.MathUtils.degToRad(-84);
  let targetYaw = 0;

  const emitState = () =>
    emit("state", { ready, busy, phase, pushing: pushingOn });

  // ── clips ──────────────────────────────────────────────────────────
  const clipCache = new Map<ClipName, Promise<THREE.AnimationClip | null>>();
  const gltfLoader = new GLTFLoader();
  function loadClip(name: ClipName): Promise<THREE.AnimationClip | null> {
    let p = clipCache.get(name);
    if (!p) {
      p = new Promise((resolve) => {
        gltfLoader.load(
          `/models/anims/${name}.glb`,
          (g) => resolve(g.animations[0] ? lockRootXZ(g.animations[0]) : null),
          undefined,
          () => resolve(null)
        );
      });
      clipCache.set(name, p);
    }
    return p;
  }

  let stageIdleAction: THREE.AnimationAction | null = null;
  let summaryIdleAction: THREE.AnimationAction | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  let headFollow = true;

  function crossfadeTo(action: THREE.AnimationAction, dur = 0.35) {
    if (currentAction && currentAction !== action) currentAction.fadeOut(dur);
    action.reset().fadeIn(dur).play();
    currentAction = action;
  }

  function idleFor(p: Phase) {
    return p === "stage" ? stageIdleAction : summaryIdleAction || stageIdleAction;
  }

  function backToIdle(dur = 0.45) {
    const idle = idleFor(phase);
    if (!idle) return;
    headFollow = true;
    busy = false;
    // Already idling (e.g. a clamped one-shot fired 'finished' after a
    // phase change handed control back) — don't reset() the running idle.
    if (currentAction !== idle || !idle.isRunning()) crossfadeTo(idle, dur);
    emitState();
  }

  async function playOnce(name: ClipName, fade = 0.3) {
    if (!mixer || busy) return;
    busy = true;
    emitState();
    const clip = await loadClip(name);
    if (!clip || !mixer) {
      busy = false;
      emitState();
      return;
    }
    headFollow = false;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    crossfadeTo(action, fade);
  }

  // ── placement solver ───────────────────────────────────────────────
  const tanHalfFov = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  /** Move charRoot so its bone-bbox projects onto `r` (viewport px).
   *  `liftPx` raises him above the rect (flight arc). */
  function placeForRect(
    r: { x: number; y: number; w: number; h: number },
    liftPx = 0
  ) {
    if (!charRoot) return;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    if (r.h < 8 || ch < 8) return;
    const F = (worldH * ch) / r.h; // frustum height at the char's depth
    const d = (F * camera.zoom) / (2 * tanHalfFov());
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2 - liftPx;
    const ndcX = (cx / cw) * 2 - 1;
    const ndcY = 1 - (cy / ch) * 2;
    charRoot.position.set(
      camera.position.x + (ndcX * F * (cw / ch)) / 2,
      camera.position.y + (ndcY * F) / 2 - centerYOffset,
      camera.position.z - d
    );
  }

  /** Project the character's current bone bbox to viewport pixels. */
  function projectCurrentRect(): { x: number; y: number; w: number; h: number } | null {
    if (!charRoot) return null;
    const cRect = renderer.domElement.getBoundingClientRect();
    if (cRect.width < 2 || cRect.height < 2) return null;
    charRoot.updateWorldMatrix(true, true);
    const box = boneBox(charRoot);
    const v = new THREE.Vector3();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      v.project(camera);
      const sx = ((v.x + 1) / 2) * cRect.width + cRect.left;
      const sy = ((1 - v.y) / 2) * cRect.height + cRect.top;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function boneBox(root: THREE.Object3D) {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    let bones = 0;
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        box.expandByPoint(o.getWorldPosition(v));
        bones++;
      }
    });
    if (bones === 0) box.setFromObject(root);
    // Bones stop at joints — pad for skull top, soles, outstretched arms.
    box.expandByScalar(box.getSize(new THREE.Vector3()).y * 0.09);
    return box;
  }

  function resizeToBox() {
    const r = (teleported.value
      ? { width: window.innerWidth, height: window.innerHeight }
      : container!.getBoundingClientRect());
    if (r.width === 0 || r.height === 0) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  // ── flight ─────────────────────────────────────────────────────────
  let flight: {
    t: number;
    dur: number;
    start: { x: number; y: number; w: number; h: number };
    back: boolean;
  } | null = null;
  const FLIGHT_DUR = 1.45;
  const BACK_DUR = 0.95;

  let pendingBreakout: HTMLElement | null = null;
  breakoutImpl = (el: HTMLElement) => {
    if (phase === "flight-back" && flight) {
      // Direction change mid-return — turn around from where he is.
      slotEl = el;
      const from = lerpRect(flight.start, stageScreenRect(), easeInOutCubic(flight.t));
      phase = "flight";
      flight = { t: 0, dur: FLIGHT_DUR, start: from, back: false };
      targetYaw = IDLE_YAW;
      busy = false;
      void playOnce("jump", 0.22);
      emitState();
      return;
    }
    if (phase !== "stage") return;
    if (!ready || !charRoot) {
      // Model still streaming in — fly the moment it lands.
      pendingBreakout = el;
      return;
    }
    slotEl = el;
    const start = projectCurrentRect();
    if (!start) return;
    phase = "flight";
    flight = { t: 0, dur: FLIGHT_DUR, start, back: false };
    teleported.value = true;
    targetYaw = IDLE_YAW;
    void nextTick(() => resizeToBox());
    busy = false;
    void playOnce("jump", 0.22);
    emitState();
  };

  returnToStageImpl = () => {
    pendingBreakout = null;
    if ((phase !== "summary" && phase !== "flight") || !charRoot || !slotEl) {
      // Not mid-journey (or WebGL bailed) — just make sure we're home.
      if (phase !== "stage") snapToStage();
      return;
    }
    const start =
      phase === "flight" && flight
        ? lerpRect(flight.start, liveSlotRect(), easeInOutCubic(flight.t))
        : liveSlotRect();
    phase = "flight-back";
    flight = { t: 0, dur: BACK_DUR, start, back: true };
    setPushingImpl(false);
    targetYaw = stageYaw;
    busy = false;
    void playOnce("jump", 0.2);
    emitState();
  };

  function snapToStage() {
    slotEl?.style.setProperty("--char-lift", "1"); // hide the slot shadow
    phase = "stage";
    flight = null;
    teleported.value = false;
    pushingOn = false;
    busy = false;
    if (charRoot) {
      charRoot.position.copy(stagePos);
      charRoot.rotation.y = stageYaw;
    }
    targetYaw = stageYaw;
    if (stageIdleAction) crossfadeTo(stageIdleAction, 0.3);
    headFollow = true;
    void nextTick(() => resizeToBox());
    emitState();
  }

  function liveSlotRect() {
    const r = slotEl!.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /** Where the character sits on the (possibly scrolled) stage right now. */
  function stageScreenRect() {
    const hr = host!.getBoundingClientRect();
    return {
      x: hr.left + stageRectUV.x * hr.width,
      y: hr.top + stageRectUV.y * hr.height,
      w: stageRectUV.w * hr.width,
      h: stageRectUV.h * hr.height,
    };
  }

  const lerpRect = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
    t: number
  ) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  });

  playActionImpl = (name: ClipName) => {
    if (phase !== "summary" || pushingOn) return;
    void playOnce(name);
  };

  setPushingImpl = async (on: boolean) => {
    if (!mixer || pushingOn === on) return;
    pushingOn = on;
    targetYaw = on ? PUSH_YAW : IDLE_YAW;
    emitState();
    if (on) {
      const clip = await loadClip("pushing");
      if (!clip || !mixer || !pushingOn) return;
      headFollow = false;
      busy = false;
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      crossfadeTo(action, 0.3);
    } else if (phase === "summary") {
      backToIdle(0.4);
    }
  };

  // ── cursor head-follow ─────────────────────────────────────────────
  let mouse = { x: 0, y: 0 };
  let interpolation = { x: 0.1, y: 0.2 };
  const onMouseMove = (event: MouseEvent) => {
    handleMouseMove(event, (x, y) => (mouse = { x, y }));
  };
  let touchTimer: number | undefined;
  let touchTracking = false;
  const onTouchMove = (e: TouchEvent) => {
    if (!touchTracking) return;
    handleTouchMove(e, (x, y) => (mouse = { x, y }));
  };
  const onTouchStart = () => {
    touchTimer = window.setTimeout(() => (touchTracking = true), 200);
  };
  const onTouchEndEv = () => {
    clearTimeout(touchTimer);
    touchTracking = false;
    handleTouchEnd((x, y, ix, iy) => {
      mouse = { x, y };
      interpolation = { x: ix, y: iy };
    });
  };
  const onResize = () => resizeToBox();

  document.addEventListener("mousemove", onMouseMove);
  container.addEventListener("touchstart", onTouchStart);
  container.addEventListener("touchmove", onTouchMove);
  container.addEventListener("touchend", onTouchEndEv);
  window.addEventListener("resize", onResize);

  // ── load ───────────────────────────────────────────────────────────
  loadCharacter().then(async (gltf) => {
    if (!gltf) return;
    const char = gltf.scene;
    scene.add(char);
    charRoot = char;
    stagePos.copy(char.position);
    stageYaw = char.rotation.y;
    targetYaw = stageYaw;
    headBone = char.getObjectByName("Head") || char.getObjectByName("Neck") || null;
    hipsBone = char.getObjectByName("Hips") || null;
    hipsRestY = hipsBone ? hipsBone.position.y : 0;

    char.updateWorldMatrix(true, true);
    const box = boneBox(char);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    worldH = size.y;
    centerYOffset = center.y - char.position.y;

    // Capture the stage-canvas UV rect of the character for reverse flights.
    const r0 = projectCurrentRect();
    const c0 = renderer.domElement.getBoundingClientRect();
    if (r0 && c0.width > 2 && c0.height > 2) {
      stageRectUV = {
        x: (r0.x - c0.left) / c0.width,
        y: (r0.y - c0.top) / c0.height,
        w: r0.w / c0.width,
        h: r0.h / c0.height,
      };
    }

    mixer = new THREE.AnimationMixer(char);
    mixer.addEventListener("finished", (e: any) => {
      if (pushingOn) return;
      // Flight jumps clamp on their final frame; the flight loop hands
      // control back to idle at landing instead.
      if (phase === "flight" || phase === "flight-back") return;
      if (e.action !== idleFor(phase)) backToIdle();
    });

    // Stage idle = the model's own clip, Head/Neck stripped for cursor-follow
    // (identical to the old HeroCharacter behaviour).
    if (gltf.animations[0]) {
      stageIdleAction = mixer.clipAction(
        stripTracks(gltf.animations[0], ["Head", "Neck"])
      );
      stageIdleAction.play();
      currentAction = stageIdleAction;
    }

    introTimer = window.setTimeout(() => light.turnOnLights(), props.introDelayMs);
    ready = true;
    emit("loaded");
    emitState();
    if (pendingBreakout) {
      const el = pendingBreakout;
      pendingBreakout = null;
      breakoutImpl(el);
    }

    // Summary idle + the small action clips stream in during idle time.
    const prefetch = async () => {
      const waiting = await loadClip("waiting");
      if (waiting && mixer) {
        summaryIdleAction = mixer.clipAction(stripTracks(waiting, ["Head", "Neck"]));
      }
      (["jump", "back_flip", "dancing", "push_ups", "pushing"] as ClipName[]).forEach(
        (n) => void loadClip(n)
      );
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => void prefetch(), { timeout: 3000 });
    } else {
      window.setTimeout(() => void prefetch(), 1200);
    }
  });

  let inViewport = true;
  const visObs = new IntersectionObserver((entries) => {
    inViewport = entries.some((e) => e.isIntersecting);
  });
  visObs.observe(container);

  // ── frame loop ─────────────────────────────────────────────────────
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    // Clamp: after tab-throttling the clock can hand back seconds — an
    // unclamped delta would skip the whole flight in one frame.
    const delta = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(delta);

    if (charRoot && Math.abs(charRoot.rotation.y - targetYaw) > 0.001) {
      charRoot.rotation.y = THREE.MathUtils.lerp(
        charRoot.rotation.y,
        targetYaw,
        phase === "flight" || phase === "flight-back" ? 0.06 : 0.08
      );
    }

    let lift = 0; // 0 grounded → 1 airborne, drives the slot's CSS shadow

    if ((phase === "flight" || phase === "flight-back") && flight && slotEl) {
      flight.t = Math.min(1, flight.t + delta / flight.dur);
      const e = easeInOutCubic(flight.t);
      const target = flight.back ? stageScreenRect() : liveSlotRect();
      const r = lerpRect(flight.start, target, e);
      const arc = Math.sin(Math.PI * e) * window.innerHeight * 0.14;
      placeForRect(r, arc);
      // Slot shadow: blooms late on approach, fades out fast on departure.
      lift = flight.back ? Math.min(1, e * 2) : 1 - e * e * e;
      if (flight.t >= 1) {
        if (flight.back) {
          snapToStage();
        } else {
          phase = "summary";
          flight = null;
          backToIdle(0.4);
        }
      }
    } else if (phase === "summary" && slotEl) {
      placeForRect(liveSlotRect());
      if (hipsBone && charRoot) {
        const rise = (hipsBone.position.y - hipsRestY) * charRoot.scale.y;
        lift = THREE.MathUtils.clamp(rise / (worldH * 0.2), 0, 1);
      }
    }

    if (slotEl && phase !== "stage") {
      slotEl.style.setProperty("--char-lift", lift.toFixed(3));
    }

    // The stage HDR is tuned for the dark doorway; on the white summary
    // page the suit reads near-black. Gently lift the env light while he's
    // off-stage, settle back when he returns.
    const env = (scene as any).environmentIntensity;
    if (typeof env === "number" && env > 0.05) {
      const envTarget = phase === "stage" ? 0.64 : 1.0;
      (scene as any).environmentIntensity = THREE.MathUtils.lerp(env, envTarget, 0.03);
    }

    if (headBone && headFollow) {
      handleHeadRotation(
        headBone,
        mouse.x,
        mouse.y,
        interpolation.x,
        interpolation.y,
        THREE.MathUtils.lerp
      );
    }

    // Render gates: stage phase keeps the old rules (door occlusion +
    // viewport). Overlay phases render only while the journey is on screen.
    let visible: boolean;
    if (phase === "stage") {
      visible = !props.paused && inViewport;
    } else if (phase === "summary" && slotEl) {
      const r = slotEl.getBoundingClientRect();
      visible = r.bottom > 0 && r.top < window.innerHeight && r.right > 0;
    } else {
      visible = true; // mid-flight
    }
    if (visible) renderer.render(scene, camera);
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
    disposeCharacter();
    light.dispose();
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
  <div class="character-container jc-host" ref="hostDiv">
    <Teleport to="body" :disabled="!teleported">
      <div
        class="character-model jc-stage"
        :class="{ 'jc-overlay': teleported }"
        ref="canvasDiv"
      ></div>
    </Teleport>
  </div>
</template>

<style>
/* Unscoped on purpose: the teleported node leaves this component's scope. */
/* Two-class selectors so these beat .character-model's `position: relative`
   regardless of stylesheet injection order. */
.jc-host {
  position: absolute;
  inset: 0;
}
.jc-host .jc-stage {
  position: absolute;
  inset: 0;
}
.jc-stage.jc-overlay {
  position: fixed;
  inset: 0;
  z-index: 60; /* above sections, below the topbar (70) */
  pointer-events: none;
}
</style>
