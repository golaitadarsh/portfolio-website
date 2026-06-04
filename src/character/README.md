# HeroCharacter — Vue 3 Component

Mouse-driven 3D character ported from the `3d-portfolio` reference. Self-contained: no scroll triggers, no external state, no GSAP. Drop into any Vue 3 component.

## Files

```
src/character/
├── HeroCharacter.vue     # main Vue SFC
├── index.ts              # re-exports
├── character.ts          # GLTF loader + mesh setup
├── animationUtils.ts     # intro / typing / blink / brow-up
├── mouseUtils.ts         # mouse → head rotation
├── lighting.ts           # HDRI + directional + point light
├── boneData.ts           # bone name maps
└── CharacterModel.css    # styles (auto-imported by SFC)

public/
├── models/model.glb              # rigged character
├── models/char_enviorment.hdr    # HDRI
└── draco/{draco_decoder.js,wasm} # draco decoder
```

## Use

```vue
<script setup lang="ts">
import { HeroCharacter } from "./character";
</script>

<template>
  <div style="width: 100%; height: 100vh">
    <HeroCharacter />
  </div>
</template>
```

Parent controls size. Component fills 100% of its parent.

## Props

```ts
interface Props {
  cameraPosition?: [number, number, number];   // default [0, 13.1, 24.7]
  cameraFov?: number;                          // default 14.5
  cameraZoom?: number;                         // default 1.1
  character?: {
    modelPath?: string;        // default "/models/model.glb"
    dracoPath?: string;        // default "/draco/"
    scale?: number;            // default 5.8
    position?: [number, number, number];  // default [0, 3.36, 0]
    facingRadians?: number;    // default 40deg
    shirtColor?: string | null;
    pantColor?: string | null;
  };
  lighting?: {
    hdrPath?: string;          // default "/models/char_enviorment.hdr"
    envIntensity?: number;     // default 0.64
    directionalIntensity?: number;  // default 1
    fadeDuration?: number;     // default 2000 ms
  };
  introDelayMs?: number;       // default 100
}
```

Emits `loaded` when GLTF parse completes.

## Example — custom paths + colors

```vue
<HeroCharacter
  :character="{ shirtColor: '#1e3a8a', pantColor: '#0f172a' }"
  :lighting="{ envIntensity: 0.8 }"
  @loaded="onReady"
/>
```

## Deps

- `three` (already in package.json)
- `three-stdlib` (added during port)
- Vue 3.5+

## Behavior

- Mouse/touch tracks head rotation (clamped, lerped).
- Intro animation plays on mount (`introAnimation` clip from GLB).
- Typing loop (`key1/key2/key5/key6` clips) + brow-up on `.character-hover` div hover.
- Blink starts 2.5s after intro begins.
- HDRI env + directional fade in over `lighting.fadeDuration`.
- Emissive screen pulse drives a cyan point light that reacts to monitor brightness.

## Stripped vs original

Removed: GSAP scroll timelines, LoadingProvider, page-scroll-aware head freeze, monitor scale-on-scroll, character translateX-on-scroll, encrypted-blob loader (`decrypt.ts`), portfolio chrome (`.character-rim` etc).

Kept: every animation, mouse interaction, lighting setup, screen emissive pulse.
