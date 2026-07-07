import * as THREE from "three";
import { RGBELoader } from "three-stdlib";

export interface LightingOptions {
  hdrPath?: string;
  envIntensity?: number;
  directionalIntensity?: number;
  fadeDuration?: number;
}

const setLighting = (scene: THREE.Scene, opts: LightingOptions = {}) => {
  const {
    hdrPath = "/models/char_enviorment.hdr",
    envIntensity = 0.64,
    directionalIntensity = 1,
    fadeDuration = 2000,
  } = opts;

  const directionalLight = new THREE.DirectionalLight(0x5eead4, 0);
  directionalLight.position.set(-0.47, -0.32, -1);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  scene.add(directionalLight);

  const pointLight = new THREE.PointLight(0x22d3ee, 0, 100, 3);
  pointLight.position.set(3, 12, 4);
  pointLight.castShadow = true;
  scene.add(pointLight);

  const dirLastSlash = hdrPath.lastIndexOf("/");
  const path = dirLastSlash >= 0 ? hdrPath.slice(0, dirLastSlash + 1) : "";
  const file = dirLastSlash >= 0 ? hdrPath.slice(dirLastSlash + 1) : hdrPath;

  let envTexture: THREE.Texture | null = null;
  new RGBELoader().setPath(path).load(file, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    envTexture = texture;
    scene.environment = texture;
    (scene as any).environmentIntensity = 0;
    (scene as any).environmentRotation?.set?.(5.76, 85.85, 1);
  });

  function setPointLight(screenLight: any) {
    if (!screenLight?.material) {
      pointLight.intensity = 0;
      return;
    }
    if (screenLight.material.opacity > 0.9) {
      pointLight.intensity = screenLight.material.emissiveIntensity * 20;
    } else {
      pointLight.intensity = 0;
    }
  }

  function tween(
    from: number,
    to: number,
    duration: number,
    apply: (v: number) => void
  ) {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      apply(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function turnOnLights() {
    tween(0, envIntensity, fadeDuration, (v) => {
      (scene as any).environmentIntensity = v;
    });
    tween(0, directionalIntensity, fadeDuration, (v) => {
      directionalLight.intensity = v;
    });
  }

  function dispose() {
    envTexture?.dispose();
    envTexture = null;
    scene.environment = null;
    directionalLight.dispose();
    pointLight.dispose();
  }

  return { setPointLight, turnOnLights, dispose };
};

export default setLighting;
