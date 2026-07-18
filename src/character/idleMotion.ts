import * as THREE from "three";

/** Ambient torso motion layered on top of the mixer: a slow breathing rise on
 *  the chest and a barely-there weight shift on the lower spine. Amplitudes
 *  sit an order of magnitude below the animation clip so they read as
 *  "alive", never as a new gesture. */

interface MotionBone {
  bone: THREE.Object3D;
  /** true → the mixer rewrites this bone every frame, so the offset is
   *  post-multiplied onto that fresh pose (self-correcting, no drift).
   *  false → the bone is static; its rest pose is captured once and the
   *  offset is applied absolutely on top of it. */
  mixerDriven: boolean;
  rest: THREE.Quaternion;
}

const setupIdleMotion = (
  root: THREE.Object3D,
  clips: THREE.AnimationClip[]
) => {
  const animatedNodes = new Set<string>();
  clips.forEach((clip) =>
    clip.tracks.forEach((track) => {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      if (nodeName) animatedNodes.add(nodeName);
    })
  );

  const register = (names: string[]): MotionBone | null => {
    for (const name of names) {
      const bone = root.getObjectByName(name);
      if (bone) {
        return {
          bone,
          mixerDriven: animatedNodes.has(bone.name),
          rest: bone.quaternion.clone(),
        };
      }
    }
    return null;
  };

  const chest = register(["Spine2", "Spine1", "spine003"]);
  const lowerSpine = register(["Spine", "spine001"]);

  const euler = new THREE.Euler();
  const offset = new THREE.Quaternion();

  const apply = (b: MotionBone, x: number, y: number, z: number) => {
    offset.setFromEuler(euler.set(x, y, z));
    if (b.mixerDriven) {
      b.bone.quaternion.multiply(offset);
    } else {
      b.bone.quaternion.copy(b.rest).multiply(offset);
    }
  };

  /** Call once per frame, AFTER mixer.update() — the mixer stomps any bone
   *  it animates, so offsets written before it would be lost. */
  const update = (time: number) => {
    // ~14 breaths/min; a soft chest rise, not a bounce.
    const breath = Math.sin(time * 1.5);
    // Weight never sits perfectly still — two incommensurate sines per axis,
    // same trick as the head sway, so the drift doesn't visibly loop.
    const shiftYaw =
      (Math.sin(time * 0.23 + 0.8) * 0.6 + Math.sin(time * 0.11 + 2.4) * 0.4) *
      0.02;
    const shiftRoll =
      (Math.sin(time * 0.17 + 1.9) * 0.6 + Math.sin(time * 0.07 + 0.3) * 0.4) *
      0.012;
    if (chest) apply(chest, breath * 0.016, 0, breath * 0.004);
    if (lowerSpine) apply(lowerSpine, breath * 0.006, shiftYaw, shiftRoll);
  };

  return { update };
};

export default setupIdleMotion;
