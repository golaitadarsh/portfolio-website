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
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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
  let handBone: THREE.Object3D | null = null;
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
  // The stage frames him passport-close: his full-body bbox projects ~3
  // viewports tall. Lerping that straight to the small summary slot shrinks
  // him 4-5× mid-air over the white page — reads as a broken zoom, not a
  // jump. Both journeys are one-shot cinematics: the page scroll-tweens
  // underneath with user scroll locked (Portfolio.vue), so the timeline can
  // never be scrubbed into a half-stage/half-summary state.
  //
  // Forward — THE FALL:
  //   recede · he steps BACK into the doorway (a real 3D depth move — the
  //            solver pushes him away from the camera) until he's full-body
  //            at roughly slot size, while the dark stage still fills the
  //            screen. Matches the jump clip's crouch anticipation.
  //   fall   · he steps off the edge and free-falls: gravity easing (slow
  //            start, accelerating), a slight body lean, the page rushing
  //            up past him, landing in the slot on the jump clip's crouch.
  // Reverse — THE ROPE:
  //   grab   · a rope drops from above the frame down to his hand.
  //   pull   · he's hauled up in rhythmic tugs (speed pulses, hand-over-
  //            hand) while the page tweens back to the stage; the rope
  //            sways and stays pinned to his hand bone every frame.
  //   step-in· at the doorway the rope retracts off the top and he steps
  //            forward into the original passport close-up.
  let flight: {
    t: number;
    dur: number;
    start: { x: number; y: number; w: number; h: number };
    back: boolean;
    fromStage: boolean;
    fromSlot: boolean;
  } | null = null;
  const FLIGHT_DUR = 2.0; // keep in sync with Portfolio's DESCEND_MS
  const BACK_DUR = 1.9; // keep in sync with Portfolio's RETURN_MS
  const RECEDE = 0.3; // forward: share of flight spent receding on stage
  const GRAB = 0.16; // reverse: share spent dropping the rope to his hand
  const PULL_END = 0.78; // reverse: rope pull ends at the doorway
  const TUGS = 3; // hand-over-hand pulls during the rise

  // Gravity read: starts slow, accelerates, still carrying speed at touch-
  // down so the landing crouch absorbs real momentum (e = 2t² - t³).
  const fallEase = (t: number) => t * t * (2 - t);
  // Monotonic rise whose speed pulses TUGS times — each pull is a distinct
  // heave on the rope. Derivative = 1 - A·cos(2πNt) stays positive (A<1).
  const tugEase = (t: number) => {
    const A = 0.75;
    const p = t - (A / (2 * Math.PI * TUGS)) * Math.sin(2 * Math.PI * TUGS * t);
    return easeInOutCubic(p);
  };

  /** Full-body rect standing in the doorway — recede target / leap origin.
   *  Anchored to the live stage rect so it scrolls with the page. */
  function launchRect() {
    const st = stageScreenRect();
    const vh = window.innerHeight;
    const slotH = slotEl ? slotEl.getBoundingClientRect().height : vh * 0.6;
    const h = Math.min(vh * 0.66, slotH * 1.1);
    const w = h * (st.w / Math.max(1, st.h));
    // Head stays put (top anchored): shrinking downward from the head reads
    // as stepping back, not deflating.
    return { x: st.x + st.w / 2 - w / 2, y: st.y, w, h };
  }

  /** Piecewise flight path at time fraction t.
   *  `fall` — 0..1 progress through the forward free-fall (drives the lean).
   *  `rope` — 0..1 how far the rope has dropped / how attached it still is.
   *  `pull` — 0..1 progress through the rope pull (drives the sway). */
  function flightFrame(
    f: NonNullable<typeof flight>,
    tNow: number
  ): {
    r: { x: number; y: number; w: number; h: number };
    fall: number;
    rope: number;
    pull: number;
  } {
    if (!f.back) {
      if (tNow < RECEDE) {
        const e = easeOutCubic(tNow / RECEDE);
        // Stage-origin flights track the live stage rect so he stays glued
        // to the (scrolling) doorway while receding; converted mid-air
        // flights recede from wherever they were.
        const from = f.fromStage ? stageScreenRect() : f.start;
        return { r: lerpRect(from, launchRect(), e), fall: 0, rope: 0, pull: 0 };
      }
      const u = (tNow - RECEDE) / (1 - RECEDE);
      const e = fallEase(u);
      return { r: lerpRect(launchRect(), liveSlotRect(), e), fall: u, rope: 0, pull: 0 };
    }
    // Reverse. Summary-origin returns ride the live slot until the rope has
    // him (the page is already tweening up — staying glued to the slot reads
    // as "still standing on the page"); converted mid-air returns hang where
    // they were.
    const origin = () => (f.fromSlot && slotEl ? liveSlotRect() : f.start);
    if (tNow < GRAB) {
      return { r: origin(), fall: 0, rope: easeOutCubic(tNow / GRAB), pull: 0 };
    }
    if (tNow < PULL_END) {
      const u = (tNow - GRAB) / (PULL_END - GRAB);
      return { r: lerpRect(origin(), launchRect(), tugEase(u)), fall: 0, rope: 1, pull: u };
    }
    const e = easeInOutCubic((tNow - PULL_END) / (1 - PULL_END));
    return { r: lerpRect(launchRect(), stageScreenRect(), e), fall: 0, rope: 1 - e, pull: 1 };
  }

  // ── rope ───────────────────────────────────────────────────────────
  // A dark ink line in the SAME scene (same camera, same depth as him) —
  // a quadratic tube from above the top frustum edge down to his hand
  // bone, rebuilt per frame so it stays pinned whatever the pose does.
  let ropeMesh: THREE.Mesh | null = null;
  let ropeMat: THREE.MeshBasicMaterial | null = null;

  /** drop: 0 hidden → 1 fully attached to the hand. sway: -1..1 pendulum. */
  function updateRope(drop: number, sway: number) {
    if (drop <= 0.001 || !charRoot) {
      if (ropeMesh) ropeMesh.visible = false;
      return;
    }
    const hand = new THREE.Vector3();
    (handBone || headBone || charRoot).getWorldPosition(hand);
    // Anchor above the visible frame at his depth so the rope always runs
    // off the top of the screen, never dangles from a visible point.
    const ndc = hand.clone().project(camera);
    const anchor = new THREE.Vector3(ndc.x + sway * 0.04, 1.4, ndc.z).unproject(camera);
    const tip = anchor.clone().lerp(hand, drop);
    const mid = anchor.clone().lerp(tip, 0.55);
    mid.x += sway * worldH * 0.05; // slight bow — reads as slack + swing
    const curve = new THREE.QuadraticBezierCurve3(anchor, mid, tip);
    const geo = new THREE.TubeGeometry(curve, 12, worldH * 0.012, 6);
    if (!ropeMesh) {
      ropeMat = new THREE.MeshBasicMaterial({ color: 0x2b2318 });
      ropeMesh = new THREE.Mesh(geo, ropeMat);
      ropeMesh.frustumCulled = false;
      scene.add(ropeMesh);
    } else {
      ropeMesh.geometry.dispose();
      ropeMesh.geometry = geo;
    }
    ropeMesh.visible = true;
  }

  let pendingBreakout: HTMLElement | null = null;
  breakoutImpl = (el: HTMLElement) => {
    if (phase === "flight-back" && flight) {
      // Direction change mid-return — turn around from where he is.
      slotEl = el;
      const from = flightFrame(flight, flight.t).r;
      phase = "flight";
      flight = { t: 0, dur: FLIGHT_DUR, start: from, back: false, fromStage: false, fromSlot: false };
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
    // Re-capture the stage UV rect NOW, while he verifiably sits on stage.
    // The load-time capture can race the hero driver's layout pass and
    // measure a collapsed canvas — a garbage UV silently throws every
    // stage-anchored flight rect thousands of pixels off screen.
    const c0 = renderer.domElement.getBoundingClientRect();
    if (c0.width > 2 && c0.height > 2) {
      stageRectUV = {
        x: (start.x - c0.left) / c0.width,
        y: (start.y - c0.top) / c0.height,
        w: start.w / c0.width,
        h: start.h / c0.height,
      };
    }
    phase = "flight";
    flight = { t: 0, dur: FLIGHT_DUR, start, back: false, fromStage: true, fromSlot: false };
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
    const fromSlot = phase === "summary";
    const start =
      phase === "flight" && flight
        ? flightFrame(flight, flight.t).r
        : liveSlotRect();
    phase = "flight-back";
    flight = { t: 0, dur: BACK_DUR, start, back: true, fromStage: false, fromSlot };
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
      charRoot.rotation.z = 0;
    }
    updateRope(0, 0);
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
    handBone =
      char.getObjectByName("RightHand") || char.getObjectByName("LeftHand") || null;
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
    if (import.meta.env.DEV) {
      (window as any).__jc = {
        rects: () => ({
          stageRectUV,
          stage: stageScreenRect(),
          launch: launchRect(),
          projected: projectCurrentRect(),
          host: host!.getBoundingClientRect(),
          phase,
          flightT: flight?.t ?? null,
        }),
      };
    }
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
      const fr = flightFrame(flight, flight.t);
      placeForRect(fr.r, 0);
      if (charRoot) {
        // Forward: a slight backward lean sells the free-fall; eases out
        // right before touchdown so the crouch lands square.
        // Reverse: a small pendulum swing while he hangs on the rope.
        const leanTarget = !flight.back
          ? Math.sin(Math.PI * Math.min(1, fr.fall * 1.15)) * 0.07
          : fr.rope >= 1
            ? Math.sin(flight.t * 13) * 0.035 * (1 - fr.pull * 0.6)
            : 0;
        charRoot.rotation.z = THREE.MathUtils.lerp(charRoot.rotation.z, leanTarget, 0.15);
      }
      if (flight.back) {
        const sway = Math.sin(flight.t * 13) * (1 - fr.pull * 0.6);
        updateRope(fr.rope, sway);
      } else {
        updateRope(0, 0); // a converted direction-change must drop the rope
      }
      // Slot shadow: forward, it blooms only at the very end of the fall
      // (impact); reverse, it's gone the instant the rope lifts him.
      lift = flight.back
        ? Math.min(1, flight.t / GRAB)
        : 1 - Math.pow(fr.fall, 5);
      if (flight.t >= 1) {
        if (flight.back) {
          snapToStage();
        } else {
          phase = "summary";
          flight = null;
          if (charRoot) charRoot.rotation.z = 0;
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
    if (ropeMesh) {
      scene.remove(ropeMesh);
      ropeMesh.geometry.dispose();
      ropeMat?.dispose();
      ropeMesh = null;
    }
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
