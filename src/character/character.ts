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

  const loadCharacter = () => {
    return new Promise<GLTF | null>((resolve, reject) => {
      loader.load(
        modelPath,
        async (gltf) => {
          const character = gltf.scene;
          character.scale.setScalar(scale);
          character.position.set(position[0], position[1], position[2]);
          character.rotation.y = facingRadians;
          await renderer.compileAsync(character, camera, scene);

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

          disposers.push(setupScreenEmissive(character));
          resolve(gltf);
          dracoLoader.dispose();
        },
        undefined,
        (error) => {
          console.error("Error loading GLTF model:", error);
          reject(error);
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
