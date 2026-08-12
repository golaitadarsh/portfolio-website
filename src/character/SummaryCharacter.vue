<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import setCharacter from "./character";
import setLighting from "./lighting";
import { handleMouseMove, handleHeadRotation } from "./mouseUtils";
import { tuneRenderer } from "../perf/deviceTier";
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
  /** Model could not be loaded — the stage should stop waiting on it. */
  (e: "failed"): void;
  (e: "state", s: {
    ready: boolean;
    busy: boolean;
    pushing: boolean;
    /** Clip currently playing as a one-shot, or null while idling. */
    active: string | null;
  }): void;
  /** Rig geometry became available — the parent should re-measure. */
  (e: "metrics"): void;
}>();

/**
 * Rig metrics, all expressed in CANVAS-HEIGHT units.
 *
 * The camera frames the body by HEIGHT (fitH below), so every distance the
 * character occupies on screen is a fixed multiple of the canvas height and
 * nothing else. The projection confirms it algebraically: horizontal NDC
 * carries a 1/aspect, and px = ndc · canvasW/2 = ndc · canvasH · aspect/2, so
 * aspect cancels. Publishing ratios instead of px is what makes the push-out
 * land identically on a 13" laptop and a 27" monitor.
 */
export interface PushMetrics {
  /** Lead-hand reach left of the canvas centre, ÷ canvas height. */
  reachRatio: number;
  /** Trailing-heel extent right of the canvas centre, ÷ canvas height. */
  extentRatio: number;
  /** Column px that advance the pushing clip by one second of its timeline. */
  pxPerClipSec: number;
  /** Live canvas height in px (== the staged slot height). */
  canvasH: number;
}

const canvasDiv = ref<HTMLDivElement | null>(null);
const ready = ref(false);
const busy = ref(false);
const pushing = ref(false);
// Which one-shot is on screen right now. Drives the button's pressed look —
// the buttons stay live while a clip runs (see playOnce), so "playing" has to
// be shown rather than enforced by disabling.
const active = ref<ClipName | null>(null);

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
let getPushMetricsImpl: () => PushMetrics | null = () => null;
defineExpose({
  enter: () => enterImpl(),
  setPushing: (on: boolean) => setPushingImpl(on),
  /** Absolute push-out travel in px since the runway start. The pushing
   *  clip's playhead is mapped straight onto it (a scrub, not a speed), so
   *  legs stride exactly with the columns, freeze the instant the scroll
   *  stops, and stride backwards on a retrace. */
  setPushTravel: (px: number) => setPushTravelImpl(px),
  playAction: (name: string) => playActionImpl(name),
  /** Live rig geometry for the page's push choreography, or null until the
   *  model and the pushing clip have both streamed in (or forever, if WebGL
   *  is unavailable — the caller falls back to its own constants). */
  getPushMetrics: (): PushMetrics | null => getPushMetricsImpl(),
});

// Mirror live state to the parent (drives its external action buttons).
watchEffect(() => {
  emit("state", {
    ready: ready.value,
    busy: busy.value,
    pushing: pushing.value,
    active: active.value,
  });
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

/* Named so onMounted can guard the whole body in one place — see the
   matching note in HeroCharacter.vue. Every path out of here reports. */
function mountStage() {
  const container = canvasDiv.value;
  if (!container) {
    emit("failed");
    return;
  }
  const rect = container.getBoundingClientRect();
  const scene = new THREE.Scene();

  /* No WebGL2 on this browser (Lockdown Mode, a driver blocklist, an in-app
     WebView — see perf/webgl.ts). This used to `return` bare, which was the
     worst version of the failure on this component: `ready` stayed false
     forever, so the section's control panel sat there permanently un-lit
     waiting for a rig that was never going to arrive. */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (err) {
    console.error("[SummaryCharacter] WebGL unavailable:", err);
    emit("failed");
    return;
  }
  tuneRenderer(renderer);
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);

  /* Provisional disposer — replaced by the real one at the end of this
     function. Keeps a half-built stage from leaking its context if anything
     below throws; contexts are capped per page and the browser evicts the
     oldest, so a leak here blanks a canvas somewhere else. */
  cleanup = () => {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };

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
    active.value = null;
    playSeq++; // cancel any clip still streaming in
    crossfadeTo(idleAction, dur);
  }

  // Bumped on every play/cancel request. A clip fetch is async, so a click
  // that lands mid-fetch has to be able to invalidate the earlier one —
  // otherwise the slower load wins and the character plays the wrong thing.
  let playSeq = 0;

  // Nothing here blocks: a running clip is never a reason to ignore a click.
  // Another action interrupts on the spot, and the same action again drops
  // back to idle, so the viewer is never held hostage by a long clip.
  async function playOnce(name: ClipName) {
    if (!mixer || pushing.value) return;
    if (active.value === name) {
      backToIdle(0.3);
      return;
    }
    const seq = ++playSeq;
    busy.value = true;
    active.value = name;
    const clip = await loadClip(name);
    if (seq !== playSeq) return; // superseded while the clip streamed in
    if (!clip || !mixer) {
      busy.value = false;
      active.value = null;
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
  // travel in px, and the clip's playhead is a pure function of it — one
  // second of the clip's 1× timeline per PUSH_CANVASH_PER_SEC of canvas
  // height travelled (wrapping over the loop). No playback clock at all:
  // scroll fast = fast strides, stop = frozen mid-stride, retrace = strides
  // in reverse. Legs and columns can never drift apart.
  //
  // Stride length is a property of the BODY, so the cadence has to be measured
  // in body-sized units. It used to be a flat 520 px/sec, which meant the same
  // scroll produced ~1.9× more gliding on a short laptop than on a tall
  // monitor — the character is drawn 1.87× larger there, but the constant
  // never noticed. 0.62 canvas-heights/sec is that same 520 px on a 1080p
  // display, so the tuned look is preserved at the most common desktop height
  // and now holds at every other one. Lower = more strides per scrolled px.
  const PUSH_CANVASH_PER_SEC = 0.62;
  const canvasH = () => Math.max(1, renderer.domElement.clientHeight || rect.height);
  const pushPxPerSec = () => PUSH_CANVASH_PER_SEC * canvasH();
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
      active.value = null;
      playSeq++; // scroll owns the rig now — drop any in-flight one-shot
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

  // ── rig metrics ────────────────────────────────────────────────────
  // How far the character actually extends on either side of the canvas
  // centre while pushing. The page used to guess this with a hand-picked
  // "0.20 of the slot height"; the rig's real lead-hand reach is 0.54, so he
  // walked ~0.27 slot-heights too far and shoved his hand through the text.
  // Nothing here is a constant to maintain — it is sampled from the clip.
  let padRatio = 0;
  let pushExtents: { reachRatio: number; extentRatio: number } | null = null;

  function measurePushExtents(clip: THREE.AnimationClip) {
    if (!charRoot) return null;
    const bones: THREE.Object3D[] = [];
    charRoot.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.push(o);
    });
    if (bones.length === 0) return null;

    // Snapshot every bone: the live idle clip has its Head/Neck tracks
    // stripped, so those bones would keep whatever this pass leaves behind.
    // (Nothing renders mid-function — JS is single-threaded — so the restore
    // is complete before the next frame either way.)
    const snap = bones.map((b) => ({
      b,
      p: b.position.clone(),
      q: b.quaternion.clone(),
      s: b.scale.clone(),
    }));
    const yaw0 = charRoot.rotation.y;

    // A private mixer so the live one's bindings and weights are untouched.
    const sampler = new THREE.AnimationMixer(charRoot);
    const act = sampler.clipAction(clip);
    act.play();
    charRoot.rotation.y = PUSH_YAW; // measure in the pose he'll hold

    const v = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    const STEPS = 96; // whole stride cycle — we want the extreme, not a frame
    for (let i = 0; i < STEPS; i++) {
      act.time = (i / STEPS) * clip.duration;
      sampler.update(0); // applies the pose at act.time
      charRoot.updateWorldMatrix(true, true);
      for (const b of bones) {
        v.setFromMatrixPosition(b.matrixWorld).project(camera);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
      }
    }

    act.stop();
    sampler.uncacheRoot(charRoot);
    for (const s of snap) {
      s.b.position.copy(s.p);
      s.b.quaternion.copy(s.q);
      s.b.scale.copy(s.s);
    }
    charRoot.rotation.y = yaw0;
    charRoot.updateWorldMatrix(true, true);

    if (!isFinite(minX) || !isFinite(maxX)) return null;
    // ndc → px is ndc · canvasW/2, and canvasW = canvasH · aspect while ndc.x
    // already carries a 1/aspect — so halving gives canvas-HEIGHT units, the
    // one frame of reference that is the same on every display.
    const half = camera.aspect / 2;
    return {
      reachRatio: -minX * half + padRatio,
      extentRatio: maxX * half + padRatio,
    };
  }

  getPushMetricsImpl = () => {
    if (!pushExtents) return null;
    return {
      reachRatio: pushExtents.reachRatio,
      extentRatio: pushExtents.extentRatio,
      pxPerClipSec: pushPxPerSec(),
      canvasH: canvasH(),
    };
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
  // ResizeObserver, not window.resize: the staged layout sizes the character
  // column from the rig (see --sum-char-col), so the canvas can change width
  // without the window ever changing. A window-only listener left the canvas
  // at its old size until the next real resize, and every measurement the
  // page takes off this element would have been stale.
  const sizeObs = new ResizeObserver(onResize);
  sizeObs.observe(container);

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

    // Ratio the framing pad occupies on screen — reused below, because the
    // same "bones stop at joints" caveat applies to the pushing hand: the
    // last finger joint is not the fingertip.
    padRatio = pad / fitH;

    charRoot = char;
    mixer = new THREE.AnimationMixer(char);
    mixer.addEventListener("finished", (e: any) => {
      // Every one-shot lands back on idle — unless the push loop has taken
      // over, or it is an interrupted clip finishing out at zero weight
      // (fadeOut leaves it playing) and would yank the new one off screen.
      if (e.action === idleAction || e.action !== currentAction) return;
      if (!pushing.value) backToIdle();
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

    // The page cannot place him against the summary text until it knows how
    // far his arm actually reaches, so the pushing clip is fetched eagerly
    // (not with the idle prefetch below) and measured the moment it lands.
    void loadClip("pushing").then((clip) => {
      if (!clip || pushExtents) return;
      pushExtents = measurePushExtents(clip);
      if (pushExtents) emit("metrics");
    });

    // Prefetch the remaining action clips once idle is running.
    const prefetch = () =>
      (["jump", "back_flip", "dancing", "push_ups"] as ClipName[]).forEach(
        (n) => void loadClip(n)
      );
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(prefetch, { timeout: 3000 });
    } else {
      window.setTimeout(prefetch, 1200);
    }
  }).catch((err) => {
    // Nothing was catching this. A failure anywhere in the chain above — the
    // model download, the shader precompile, the idle clip — left the promise
    // rejected, `ready` false and "loaded" never emitted. The summary stage
    // reads that state as "still arriving" and waits for it forever, which is
    // why a failed character took the whole section down with it rather than
    // just being an empty plinth. Report it and let the section move on.
    console.error("[SummaryCharacter] model failed to load:", err);
    emit("failed");
  });

  // See the matching note in HeroCharacter: a lost context is silent and
  // permanent unless the default is prevented, and this rig is the second of
  // several on the page — the most likely one to be evicted if the browser's
  // per-page context cap is reached.
  const glCanvas = renderer.domElement;
  /* preventDefault makes a restore possible, not certain — a context evicted
     over the browser's per-page cap never comes back. Give it a window, then
     fail properly so the section drops the rig and its controls instead of
     showing a live panel wired to a blank canvas. */
  const RESTORE_GRACE_MS = 6000;
  let restoreTimer: number | undefined;
  const onContextLost = (e: Event) => {
    e.preventDefault();
    console.warn("[SummaryCharacter] WebGL context lost; pausing render loop");
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;
    clearTimeout(restoreTimer);
    restoreTimer = window.setTimeout(function giveUp() {
      // A backgrounded tab is the ordinary reason a restore is late.
      if (document.hidden) {
        restoreTimer = window.setTimeout(giveUp, RESTORE_GRACE_MS);
        return;
      }
      console.error("[SummaryCharacter] WebGL context never restored; falling back");
      emit("failed");
    }, RESTORE_GRACE_MS);
  };
  const onContextRestored = () => {
    console.warn("[SummaryCharacter] WebGL context restored; resuming");
    clearTimeout(restoreTimer);
    clock.getDelta();
    if (rafId === 0 && inViewport) rafId = requestAnimationFrame(animate);
  };
  glCanvas.addEventListener("webglcontextlost", onContextLost);
  glCanvas.addEventListener("webglcontextrestored", onContextRestored);

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
    if (pushing.value && pushAction) {
      // Scrub: playhead is a pure function of the reported travel, wrapped
      // over the loop. timeScale is 0, so mixer.update never advances it —
      // it only drives the crossfade weights.
      const dur = pushAction.getClip().duration;
      const t = (pushTravel / pushPxPerSec()) % dur;
      pushAction.time = t < 0 ? t + dur : t;
    }
    if (mixer) mixer.update(delta);
    if (charRoot && Math.abs(charRoot.rotation.y - targetYaw) > 0.001) {
      charRoot.rotation.y = THREE.MathUtils.lerp(charRoot.rotation.y, targetYaw, 0.08);
    }
    if (headBone && headFollow) {
      handleHeadRotation(headBone, mouse.x, mouse.y, 0.1, 0.2, THREE.MathUtils.lerp, swayTime);
    }
    if (!props.paused) {
      renderer.render(scene, camera);
    }
  };
  animate();

  cleanup = () => {
    cancelAnimationFrame(rafId);
    clearTimeout(restoreTimer);
    visObs.disconnect();
    document.removeEventListener("mousemove", onMouseMove);
    disposeCharacter();
    light.dispose();
    sizeObs.disconnect();
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
    glCanvas.removeEventListener("webglcontextlost", onContextLost);
    glCanvas.removeEventListener("webglcontextrestored", onContextRestored);
    renderer.dispose();
    // dispose() releases three's GPU objects but not the WebGL context itself
    // — see the same note in HeroCharacter.vue. Contexts are a capped global
    // resource; leaking them blanks a canvas elsewhere on the page.
    renderer.forceContextLoss();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  function onActionClick(name: ClipName) {
    void playOnce(name);
  }
  actionHandler = onActionClick;
  playActionImpl = (name: string) => void playOnce(name as ClipName);
}

let actionHandler: (name: ClipName) => void = () => {};

onMounted(() => {
  try {
    mountStage();
  } catch (err) {
    // Vue turns a throw from a lifecycle hook into a console warning and
    // carries on, which here meant an empty plinth beside a dead control
    // panel. Any failure lands on the same honest outcome as the others.
    console.error("[SummaryCharacter] stage init failed:", err);
    try {
      cleanup?.();
    } catch {
      /* teardown must not mask the original failure */
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
  <div class="sc-wrap" :class="{ 'is-pushing': pushing }">
    <div class="sc-stage character-model" ref="canvasDiv"></div>
    <div class="sc-actions" v-show="ready && props.showActions" aria-label="Character actions">
      <span class="sc-actions-hint">Make him move —</span>
      <button
        v-for="a in ACTIONS"
        :key="a.key"
        type="button"
        class="sc-btn"
        :class="{ 'is-active': active === a.key }"
        :aria-pressed="active === a.key"
        :title="active === a.key ? `Stop ${a.label}` : a.label"
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
  font: 600 0.62rem/1 var(--f-mono, monospace);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft, #555);
  margin-right: 0.35rem;
}
.sc-btn {
  appearance: none;
  /* Hairline --rule pills disappear on white — these have to look pressable. */
  border: 1.5px solid rgba(9, 9, 11, 0.45);
  background: var(--paper-2, #f6f6f4);
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
/* Playing right now — filled, not dimmed. Still clickable (click = stop). */
.sc-btn.is-active {
  background: var(--ink, #111);
  color: var(--accent, #d9f24f);
  border-color: var(--ink, #111);
}
</style>
