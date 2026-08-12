import * as THREE from "three";
import { DRACOLoader, GLTFLoader } from "three-stdlib";
import type { GLTF } from "three-stdlib";

export interface CharacterOptions {
  modelPath?: string;
  dracoPath?: string;
  scale?: number;
  position?: [number, number, number];
  facingRadians?: number;
  shirtColor?: string | null;
  pantColor?: string | null;
}

/* Precompile the character's shaders, but never let it become a way to lose
   the character entirely.

   renderer.compileAsync() is a nice-to-have: it warms the shaders so the first
   visible frame doesn't hitch. Three implements it by polling the
   KHR_parallel_shader_compile extension — `checkMaterialsReady` reschedules
   itself every 10ms until every material reports ready, with no timeout and no
   rejection path anywhere in it. On drivers where that extension never flips
   COMPLETION_STATUS_KHR (documented on several Intel/ANGLE configurations and
   older mobile GPUs) the returned promise simply never settles.

   That was fatal here, because the model is only added to the scene *after*
   this await: on those machines the character silently never appeared, with no
   error in the console and no fallback — the stage just stayed empty forever.

   A deadline turns a permanent failure into an invisible one. If the compile
   hasn't reported back in time we carry on and let three compile the materials
   lazily on first render, which it does automatically. Worst case is a single
   dropped frame the first time the character is drawn; best case, and the case
   on every machine where the extension behaves, nothing changes at all. */
const COMPILE_DEADLINE_MS = 2500;

function compileWithDeadline(
  renderer: THREE.WebGLRenderer,
  character: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene
): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, COMPILE_DEADLINE_MS);
  });
  const compile = Promise.resolve()
    .then(() => renderer.compileAsync(character, camera, scene))
    /* A compile that throws is also not a reason to lose the character. */
    .catch((err) => {
      console.warn("[character] shader precompile failed, continuing:", err);
    })
    .then(() => {
      clearTimeout(timer);
    });
  return Promise.race([compile, deadline]);
}

const setCharacter = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  opts: CharacterOptions = {}
) => {
  const disposers: (() => void)[] = [];
  const {
    modelPath = "/models/model.glb",
    dracoPath = "/draco/",
    scale = 5.8,
    position = [0, 3.36, 0],
    facingRadians = THREE.MathUtils.degToRad(40),
    shirtColor = null,
    pantColor = null,
  } = opts;

  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(dracoPath);
  loader.setDRACOLoader(dracoLoader);

  /* Upper bound on the whole load. GLTFLoader has no timeout of its own, so a
     stalled 4MB transfer — captive-portal wifi, a proxy that accepts the
     connection and then never sends a byte — left this promise pending
     forever, and with it every piece of UI waiting on the character. Failing
     at a known point is what lets the page show a fallback and move on.
     Generous on purpose: this is a ceiling for the pathological case, not a
     performance budget. */
  const LOAD_DEADLINE_MS = 30000;

  const loadCharacter = () => {
    return new Promise<GLTF | null>((resolve, reject) => {
      let settled = false;
      const finishOk = (g: GLTF) => { if (!settled) { settled = true; clearTimeout(watchdog); resolve(g); } };
      const finishErr = (e: unknown) => { if (!settled) { settled = true; clearTimeout(watchdog); reject(e); } };
      const watchdog = setTimeout(
        () => finishErr(new Error(`character model timed out after ${LOAD_DEADLINE_MS}ms`)),
        LOAD_DEADLINE_MS
      );
      loader.load(
        modelPath,
        async (gltf) => {
          const character = gltf.scene;
          character.scale.setScalar(scale);
          character.position.set(position[0], position[1], position[2]);
          character.rotation.y = facingRadians;
          await compileWithDeadline(renderer, character, camera, scene);

          character.traverse((child: any) => {
            if (child.isMesh) {
              const mesh = child as THREE.Mesh;
              if (mesh.material) {
                if (mesh.name === "BODY.SHIRT" && shirtColor) {
                  const newMat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
                  newMat.color = new THREE.Color(shirtColor);
                  mesh.material = newMat;
                } else if (mesh.name === "Pant" && pantColor) {
                  const newMat = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
                  newMat.color = new THREE.Color(pantColor);
                  mesh.material = newMat;
                }
              }
              child.castShadow = true;
              child.receiveShadow = true;
              mesh.frustumCulled = true;
            }
          });

          /* Cosmetic. The screen-flicker rig depends on specific node names
             inside the GLB, so an exported model that renamed or dropped one
             of them used to throw here — before resolve() — and take the whole
             character down with it over a flickering monitor. */
          try {
            disposers.push(setupScreenEmissive(character));
          } catch (err) {
            console.warn("[character] screen emissive setup failed:", err);
          }
          finishOk(gltf);
          dracoLoader.dispose();
        },
        undefined,
        (error) => {
          console.error("Error loading GLTF model:", error);
          dracoLoader.dispose();
          finishErr(error);
        }
      );
    });
  };

  const dispose = () => {
    disposers.forEach((fn) => fn());
    disposers.length = 0;
  };

  return { loadCharacter, dispose };
};

function setupScreenEmissive(character: THREE.Object3D): () => void {
  let screenLight: any = null;
  let monitor: any = null;

  character.children.forEach((object: any) => {
    if (object.name === "Plane004") {
      object.children.forEach((child: any) => {
        if (!child.material) return;
        child.material.transparent = true;
        child.material.opacity = 1;
        if (child.material.name === "Material.018") {
          monitor = child;
          child.material.color.set("#FFFFFF");
        }
      });
    }
    if (object.name === "screenlight" && object.material) {
      object.material.transparent = true;
      object.material.opacity = 1;
      object.material.emissive.set("#B0F5EA");
      screenLight = object;
    }
  });

  // Screen flicker. The old version paired the interval with a permanent
  // requestAnimationFrame loop that wrote the SAME value every frame (the
  // target only changes when the interval fires) and neither was ever torn
  // down — they kept running after unmount, and stacked one extra rAF loop
  // per route visit. Writing the value directly in the interval produces the
  // identical 200ms-stepped flicker with no per-frame work, and the interval
  // is cleared by the returned disposer.
  let flickerId: ReturnType<typeof setInterval> | null = null;
  if (screenLight?.material) {
    // The old rAF loop wrote intensity 0 on its first frame (interval hadn't
    // ticked yet) — replicate that initial state explicitly.
    screenLight.material.emissiveIntensity = 0;
    flickerId = setInterval(() => {
      if (screenLight?.material) {
        screenLight.material.emissiveIntensity = Math.random() * 8;
      }
    }, 200);
  }

  void monitor;

  return () => {
    if (flickerId !== null) clearInterval(flickerId);
    flickerId = null;
  };
}

export default setCharacter;
