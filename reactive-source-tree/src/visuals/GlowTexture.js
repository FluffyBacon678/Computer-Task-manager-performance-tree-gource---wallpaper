import { Texture } from 'pixi.js';

// A single soft radial-glow texture, baked once into a canvas and uploaded to the GPU.
// Every glowing dot (particles, edge packets) is then drawn as a tinted additive sprite of
// this texture instead of re-tessellating filled circles on the CPU each frame — which both
// offloads the work to the GPU's batched sprite renderer and gives a smooth gradient (no
// banding) for free.
let glowTexture = null;

export function getGlowTexture() {
  if (glowTexture) return glowTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.16, 'rgba(255,255,255,0.92)');
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.13)');
  gradient.addColorStop(0.8, 'rgba(255,255,255,0.03)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  glowTexture = Texture.from(canvas);
  return glowTexture;
}
