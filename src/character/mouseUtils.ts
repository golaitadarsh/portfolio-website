import * as THREE from "three";

export const handleMouseMove = (
  event: MouseEvent,
  setMousePosition: (x: number, y: number) => void
) => {
  const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  setMousePosition(mouseX, mouseY);
};

export const handleTouchMove = (
  event: TouchEvent,
  setMousePosition: (x: number, y: number) => void
) => {
  const mouseX = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
  const mouseY = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
  setMousePosition(mouseX, mouseY);
};

export const handleTouchEnd = (
  setMousePosition: (
    x: number,
    y: number,
    interpolationX: number,
    interpolationY: number
  ) => void
) => {
  setTimeout(() => {
    setMousePosition(0, 0, 0.03, 0.03);
    setTimeout(() => {
      setMousePosition(0, 0, 0.1, 0.2);
    }, 1000);
  }, 2000);
};

// Rest roll per head bone, captured on first call — the sway must oscillate
// around the rig's own neutral tilt, not force it to zero (the two characters
// use different rigs and may not share a zero-roll rest pose).
const baseRollByBone = new WeakMap<THREE.Object3D, number>();

export const handleHeadRotation = (
  headBone: THREE.Object3D,
  mouseX: number,
  mouseY: number,
  interpolationX: number,
  interpolationY: number,
  lerp: (x: number, y: number, t: number) => number,
  time = 0
) => {
  if (!headBone) return;
  const maxRotationX = Math.PI / 6;
  const maxRotationY = Math.PI / 4.5;
  const defaultLookUpRotation = -0.2;
  const defaultLookLeftRotation = -0.08;
  const maxLookUpRotation = 0.6;
  const maxLookDownRotation = 0.06;
  const maxYawRotation = Math.PI / 4.5;
  // Ambient idle sway so the head reads as alive even when the cursor never
  // moves (scroll-only visitors). Two incommensurate sine frequencies per
  // axis keep the wander from visibly repeating; the amplitude is small
  // enough that active cursor-follow always dominates it.
  const swayYaw =
    (Math.sin(time * 0.55) * 0.6 + Math.sin(time * 0.21 + 1.7) * 0.4) * 0.12;
  const swayPitch =
    (Math.sin(time * 0.38 + 0.9) * 0.6 + Math.sin(time * 0.15 + 3.0) * 0.4) *
    0.042;
  // A touch of roll makes the wander read as a head, not a turret — necks
  // never yaw without a hint of tilt.
  const swayRoll =
    (Math.sin(time * 0.47 + 2.2) * 0.6 + Math.sin(time * 0.19 + 0.6) * 0.4) *
    0.02;
  const targetRotationX = THREE.MathUtils.clamp(
    defaultLookUpRotation + swayPitch - mouseY * maxRotationX,
    -maxLookUpRotation,
    maxLookDownRotation
  );
  const targetRotationY = THREE.MathUtils.clamp(
    defaultLookLeftRotation + swayYaw + mouseX * maxRotationY,
    -maxYawRotation,
    maxYawRotation
  );

  headBone.rotation.y = lerp(
    headBone.rotation.y,
    targetRotationY,
    interpolationY
  );
  headBone.rotation.x = lerp(
    headBone.rotation.x,
    targetRotationX,
    interpolationX
  );
  let baseRoll = baseRollByBone.get(headBone);
  if (baseRoll === undefined) {
    baseRoll = headBone.rotation.z;
    baseRollByBone.set(headBone, baseRoll);
  }
  headBone.rotation.z = lerp(
    headBone.rotation.z,
    baseRoll + swayRoll,
    interpolationX
  );
};
