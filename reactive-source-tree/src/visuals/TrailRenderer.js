import { BLEND_MODES, RenderTexture, Sprite } from 'pixi.js';

// Gource-style motion persistence. The particle/pulse/beam layers are rendered into a
// pair of ping-pong render textures: each frame the previous frame is stamped back
// slightly faded, then the fresh light is drawn on top — so everything that moves
// leaves a fading comet tail. Runs entirely on the GPU (two texture passes and one
// additive composite; no per-particle CPU cost).
//
// The textures live at resolution 1 (CSS pixels) regardless of the renderer's
// resolution: trails read better slightly soft, and it costs 4x less on HiDPI panels.
export class TrailRenderer {
  constructor(renderer, source, width, height) {
    this.renderer = renderer;
    this.source = source;
    // A hidden/minimized window can report 0x0 at load; a zero-sized framebuffer throws.
    // Start at 1x1 in that case — the resize handler fixes it once real dimensions exist.
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.textureA = RenderTexture.create({ width: w, height: h });
    this.textureB = RenderTexture.create({ width: w, height: h });
    this.fadeSprite = new Sprite(this.textureA);
    // The on-stage composite. Sources are pure additive light, so ADD is exact.
    this.sprite = new Sprite(this.textureA);
    this.sprite.blendMode = BLEND_MODES.ADD;
  }

  resize(width, height) {
    this.textureA.resize(Math.max(1, width), Math.max(1, height));
    this.textureB.resize(Math.max(1, width), Math.max(1, height));
  }

  // persistence = seconds for a trail to fade to ~37%. Framerate independent.
  update(dt, persistence = 0.15) {
    const fade = Math.exp(-dt / persistence);
    this.fadeSprite.texture = this.textureA;
    this.fadeSprite.alpha = fade;
    this.renderer.render(this.fadeSprite, { renderTexture: this.textureB, clear: true });
    this.renderer.render(this.source, { renderTexture: this.textureB, clear: false });
    const swap = this.textureA;
    this.textureA = this.textureB;
    this.textureB = swap;
    this.sprite.texture = this.textureA;
  }
}
