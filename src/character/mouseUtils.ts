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

export const handleHeadRotation = (
  headBone: THREE.Object3D,
  mouseX: number,
  mouseY: number,
  interpolationX: number,
  interpolationY: number,
  lerp: (x: number, y: number, t: number) => number
) => {
  if (!headBone) return;
  const maxRotationX = Math.PI / 6;
  const maxRotationY = Math.PI / 4.5;
  const defaultLookUpRotation = -0.2;
  const defaultLookLeftRotation = -0.08;
  const maxLookUpRotation = 0.6;
  const maxLookDownRotation = 0.06;
  const maxYawRotation = Math.PI / 4.5;
  const targetRotationX = THREE.MathUtils.clamp(
    defaultLookUpRotation - mouseY * maxRotationX,
    -maxLookUpRotation,
    maxLookDownRotation
  );
  const targetRotationY = THREE.MathUtils.clamp(
    defaultLookLeftRotation + mouseX * maxRotationY,
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
};
