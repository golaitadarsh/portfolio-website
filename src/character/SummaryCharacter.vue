<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import setCharacter from "./character";
import setLighting from "./lighting";
import { handleMouseMove, handleHeadRotation } from "./mouseUtils";
import "./CharacterModel.css";

/**
 * Full-body interactive character for the Summary section.
 *
 * Reuses /models/model.glb (already cached from the hero stage — same
 * Avaturn rig) and layers lightweight animation-only GLBs from
 * /models/anims/ on top: every clip targets the same bone names, so the
 * clips retarget for free.
 *
 *   idle      · waiting.glb  — looping, Head/Neck tracks stripped so the
 *               head keeps following the cursor like the hero character.
 *   entrance  · jump.glb     — one-shot, fired by enter() when the section
 *               scrolls in ("he jumped down here from the stage").
 *   actions   · buttons below the character (one-shot, then back to idle).
 *   pushing   · pushing.glb  — looping while setPushing(true); drives the
 *               summary→education push-out transition. Scroll-scrubbed:
 *               the page reports absolute travel px via setPushTravel(px)
 *               and the clip's playhead is a pure function of it, so the
 *               stride is frame-locked to the columns at any scroll speed
 *               — frozen when the scroll stops, reversed on a retrace.
 */

interface Props {
  paused?: boolean;
  /** Hide the built-in text buttons when the parent renders its own. */
  showActions?: boolean;
}
const props = withDefaults(defineProps<Props>(), { paused: false, showActions: true });

const emit = defineEmits<{
  (e: "loaded"): void;
  (e: "state", s: { ready: boolean; busy: boolean; pushing: boolean }): void;
}>();

const canvasDiv = ref<HTMLDivElement | null>(null);
const ready = ref(false);
const busy = ref(false);
const pushing = ref(false);

const ACTIONS: { key: ClipName; label: string }[] = [
  { key: "jump", label: "Jump" },
  { key: "back_flip", label: "Backflip" },
  { key: "dancing", label: "Dance" },
  { key: "push_ups", label: "Push-ups" },
];

type ClipName = "waiting" | "jump" | "back_flip" | "dancing" | "push_ups" | "pushing";

let cleanup: (() => void) | null = null;

// Exposed API — assigned inside onMounted once the scene exists.
let enterImpl: () => void = () => {};
let setPushingImpl: (on: boolean) => void = () => {};
let setPushTravelImpl: (px: number) => void = () => {};
let playActionImpl: (name: string) => void = () => {};
defineExpose({
  enter: () => enterImpl(),
  setPushing: (on: boolean) => setPushingImpl(on),
  /** Absolute push-out travel in px since the runway start. The pushing
   *  clip's playhead is mapped straight onto it (a scrub, not a speed), so
   *  legs stride exactly with the columns, freeze the instant the scroll
   *  stops, and stride backwards on a retrace. */
  setPushTravel: (px: number) => setPushTravelImpl(px),
  playAction: (name: string) => playActionImpl(name),
});

// Mirror live state to the parent (drives its external action buttons).
watchEffect(() => {
  emit("state", { ready: ready.value, busy: busy.value, pushing: pushing.value });
});

function stripTracks(clip: THREE.AnimationClip, boneNames: string[]) {
  const tracks = clip.tracks.filter(
    (t) => !boneNames.some((b) => t.name.startsWith(`${b}.`))
  );
  return new THREE.AnimationClip(clip.name + "_stripped", clip.duration, tracks);
}

// Pin root translation to its first-frame X/Z (Y kept, so jumps still leave
// the ground). Clips like pushing.glb carry root motion that would walk the
// character out of the camera frame — the page scroll does the traveling
// instead.
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

onMounted(() => {
  const container = canvasDiv.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const scene = new THREE.Scene();

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return; // progressive enhancement — leave the empty stage
  }
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    26,
    rect.width / Math.max(1, rect.height),
    0.1,
    1000
  );

  const clock = new THREE.Clock();
  const light = setLighting(scene);
  const { loadCharacter, dispose: disposeCharacter } = setCharacter(
    renderer,
    scene,
    camera,
    // Face slightly left, toward the summary text he'll be pushing.
    { facingRadians: THREE.MathUtils.degToRad(-14) }
  );

  let mixer: THREE.AnimationMixer | null = null;
  let headBone: THREE.Object3D | null = null;
  let charRoot: THREE.Object3D | null = null;
  let rafId = 0;
  let entered = false;

  // Yaw targets — mostly-front while idling, left profile while pushing
  // (he shoves the summary text toward the left edge of the screen).
  const IDLE_YAW = THREE.MathUtils.degToRad(-14);
  const PUSH_YAW = THREE.MathUtils.degToRad(-80);
  let targetYaw = IDLE_YAW;

  // ── clip management ────────────────────────────────────────────────
  const clipCache = new Map<ClipName, Promise<THREE.AnimationClip | null>>();
  const loader = new GLTFLoader();
  function loadClip(name: ClipName): Promise<THREE.AnimationClip | null> {
    let p = clipCache.get(name);
    if (!p) {
      p = new Promise((resolve) => {
        loader.load(
          `/models/anims/${name}.glb`,
          (gltf) =>
            resolve(gltf.animations[0] ? lockRootXZ(gltf.animations[0]) : null),
          undefined,
          () => resolve(null)
        );
      });
      clipCache.set(name, p);
    }
    return p;
  }

  let idleAction: THREE.AnimationAction | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  const actionByClip = new Map<THREE.AnimationClip, ClipName>();
  // Head follows the cursor only while idling — one-shot clips carry their
  // own Head tracks and the manual write would fight them.
  let headFollow = false;

  function crossfadeTo(action: THREE.AnimationAction, dur = 0.35) {
    if (currentAction && currentAction !== action) {
      currentAction.fadeOut(dur);
    }
    action.reset().fadeIn(dur).play();
    currentAction = action;
  }

  function backToIdle(dur = 0.45) {
    if (!idleAction) return;
    headFollow = true;
    busy.value = false;
    crossfadeTo(idleAction, dur);
  }

  async function playOnce(name: ClipName) {
    if (!mixer || busy.value) return;
    busy.value = true;
    const clip = await loadClip(name);
    if (!clip || !mixer) {
      busy.value = false;
      return;
    }
    headFollow = false;
    actionByClip.set(clip, name);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    crossfadeTo(action, 0.3);
  }

  // Scroll-scrubbed stride: the parent reports the push-out's absolute
  // travel in px, and the clip's playhead is a pure function of it —
  // PUSH_PX_PER_SEC px of column travel advances the clip by one second of
  // its 1× timeline (wrapping over the loop). No playback clock at all:
  // scroll fast = fast strides, stop = frozen mid-stride, retrace = strides
  // in reverse. Legs and columns can never drift apart.
  const PUSH_PX_PER_SEC = 520; // column px per second of clip time — sets stride length
  let pushAction: THREE.AnimationAction | null = null;
  let pushTravel = 0;
  setPushTravelImpl = (px: number) => {
    pushTravel = px;
  };

  // The parent can request the pushing pose before the model has streamed in
  // (fast scroll straight to the exit runway on a cold cache) — remember the
  // wish and apply it as soon as the mixer exists.
  let wantPushing = false;
  setPushingImpl = async (on: boolean) => {
    wantPushing = on;
    if (!mixer || pushing.value === on) return;
    pushing.value = on;
    targetYaw = on ? PUSH_YAW : IDLE_YAW;
    if (on) {
      const clip = await loadClip("pushing");
      // State may have flipped back while the clip streamed in.
      if (!clip || !mixer || !pushing.value) return;
      headFollow = false;
      busy.value = false;
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      // timeScale stays 0 for the clip's whole life — animate() scrubs the
      // playhead from the reported travel instead. Crossfade weights ride
      // mixer time, so the fade-in still plays over a frozen pose.
      action.timeScale = 0;
      pushAction = action;
      crossfadeTo(action, 0.3);
    } else {
      pushTravel = 0;
      pushAction = null;
      backToIdle(0.4);
    }
  };

  let pendingEnter = false;
  enterImpl = () => {
    if (entered) return;
    if (!ready.value) {
      // Model still streaming in — fire the jump as soon as idle starts.
      pendingEnter = true;
      return;
    }
    entered = true;
    void playOnce("jump");
  };

  // ── mouse head-follow (idle only) ──────────────────────────────────
  let mouse = { x: 0, y: 0 };
  const onMouseMove = (e: MouseEvent) =>
    handleMouseMove(e, (x, y) => (mouse = { x, y }));
  document.addEventListener("mousemove", onMouseMove);

  const onResize = () => {
    const r = container.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);

  loadCharacter().then(async (gltf) => {
    if (!gltf) return;
    const char = gltf.scene;
    scene.add(char);
    headBone = char.getObjectByName("Head") || char.getObjectByName("Neck") || null;

    // Frame the full body from bone world positions. Box3.setFromObject on
    // skinned meshes reads bind-pose geometry that ignores armature scaling
    // on this rig (measured ~62 units tall vs the ~10 the render shows), so
    // the skeleton is the only trustworthy body envelope.
    char.updateWorldMatrix(true, true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    let boneCount = 0;
    char.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        box.expandByPoint(o.getWorldPosition(v));
        boneCount++;
      }
    });
    if (boneCount === 0) box.setFromObject(char);
    // Bones stop at joints — pad for skull top, soles and outstretched arms.
    const pad = box.getSize(new THREE.Vector3()).y * 0.09;
    box.expandByScalar(pad);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fitH = size.y * 1.32;
    const dist = fitH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position.set(center.x, center.y + size.y * 0.04, center.z + dist);
    camera.lookAt(center.x, center.y + size.y * 0.02, center.z);
    camera.updateProjectionMatrix();

    charRoot = char;
    mixer = new THREE.AnimationMixer(char);
    mixer.addEventListener("finished", (e: any) => {
      // Every one-shot lands back on idle — unless the push loop has
      // taken over in the meantime.
      if (e.action !== idleAction && !pushing.value) backToIdle();
    });

    const idleClip = await loadClip("waiting");
    if (idleClip && mixer) {
      idleAction = mixer.clipAction(stripTracks(idleClip, ["Head", "Neck"]));
      idleAction.play();
      currentAction = idleAction;
      headFollow = true;
    } else if (gltf.animations[0] && mixer) {
      // Fallback: model's own idle if waiting.glb failed to load.
      idleAction = mixer.clipAction(stripTracks(gltf.animations[0], ["Head", "Neck"]));
      idleAction.play();
      currentAction = idleAction;
      headFollow = true;
    }

    light.turnOnLights();
    ready.value = true;
    emit("loaded");
    // Push requested while the model was still streaming in — honor it now
    // (takes precedence over the queued entrance jump).
    if (wantPushing && !pushing.value) {
      pendingEnter = false;
      entered = true;
      void setPushingImpl(true);
    } else if (pendingEnter) {
      pendingEnter = false;
      entered = true;
      void playOnce("jump");
    }

    // Prefetch the small action clips once idle is running.
    const prefetch = () =>
      (["jump", "back_flip", "dancing", "push_ups", "pushing"] as ClipName[]).forEach(
        (n) => void loadClip(n)
      );
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(prefetch, { timeout: 3000 });
    } else {
      window.setTimeout(prefetch, 1200);
    }
  });

  // Out of the viewport = fully asleep: no mixer stepping, no head-follow,
  // no render — the loop stops re-arming and the IntersectionObserver
  // restarts it on re-entry. getDelta() on wake swallows the sleep gap so
  // the clip resumes exactly where it froze instead of jumping ahead.
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

  const animate = () => {
    if (!inViewport) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(animate);
    // Cap the step so a background-tab pause can't fast-forward the rig.
    const delta = Math.min(clock.getDelta(), 0.066);
    if (pushing.value && pushAction) {
      // Scrub: playhead is a pure function of the reported travel, wrapped
      // over the loop. timeScale is 0, so mixer.update never advances it —
      // it only drives the crossfade weights.
      const dur = pushAction.getClip().duration;
      const t = (pushTravel / PUSH_PX_PER_SEC) % dur;
      pushAction.time = t < 0 ? t + dur : t;
    }
    if (mixer) mixer.update(delta);
    if (charRoot && Math.abs(charRoot.rotation.y - targetYaw) > 0.001) {
      charRoot.rotation.y = THREE.MathUtils.lerp(charRoot.rotation.y, targetYaw, 0.08);
    }
    if (headBone && headFollow) {
      handleHeadRotation(headBone, mouse.x, mouse.y, 0.1, 0.2, THREE.MathUtils.lerp);
    }
    if (!props.paused) {
      renderer.render(scene, camera);
    }
  };
  animate();

  cleanup = () => {
    cancelAnimationFrame(rafId);
    visObs.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
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

  function onActionClick(name: ClipName) {
    void playOnce(name);
  }
  actionHandler = onActionClick;
  playActionImpl = (name: string) => void playOnce(name as ClipName);
});

let actionHandler: (name: ClipName) => void = () => {};

onBeforeUnmount(() => {
  cleanup?.();
});
</script>

<template>
  <div class="sc-wrap" :class="{ 'is-pushing': pushing }">
    <div class="sc-stage character-model" ref="canvasDiv"></div>
    <div class="sc-actions" v-show="ready && props.showActions" aria-label="Character actions">
      <span class="sc-actions-hint">Make him move —</span>
      <button
        v-for="a in ACTIONS"
        :key="a.key"
        type="button"
        class="sc-btn"
        :disabled="busy || pushing"
        @click="actionHandler(a.key)"
      >{{ a.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.sc-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sc-stage {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}
.sc-actions {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding-top: 0.75rem;
  transition: opacity 0.3s ease;
}
.is-pushing .sc-actions {
  opacity: 0;
  pointer-events: none;
}
.sc-actions-hint {
  font: 500 0.62rem/1 var(--f-mono, monospace);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint, #999);
  margin-right: 0.35rem;
}
.sc-btn {
  appearance: none;
  border: 1px solid var(--rule, #ddd);
  background: transparent;
  color: var(--ink, #111);
  font: 600 0.68rem/1 var(--f-mono, monospace);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 0.55em 0.95em;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease,
    transform 0.18s ease;
}
.sc-btn:hover:not(:disabled) {
  background: var(--ink, #111);
  color: var(--accent, #d9f24f);
  border-color: var(--ink, #111);
  transform: translateY(-1px);
}
.sc-btn:active:not(:disabled) { transform: translateY(0); }
.sc-btn:disabled { opacity: 0.4; cursor: default; }
</style>
