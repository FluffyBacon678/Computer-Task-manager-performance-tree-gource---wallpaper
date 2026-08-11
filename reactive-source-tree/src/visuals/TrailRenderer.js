import { BLEND_MODES, RenderTexture, SCALE_MODES, Sprite } from 'pixi.js';

// Gource-style motion persistence. The particle/pulse/beam layers are rendered into a
// pair of ping-pong render textures: each frame the previous frame is stamped back
// slightly faded, then the fresh light is drawn on top — so everything that moves
// leaves a fading comet tail. Runs entirely on the GPU (two texture passes and one
// additive composite; no per-particle CPU cost).
//
// Sharpness matters here. The textures MUST match the renderer's resolution: at a lower
// resolution every trailed pixel is upscaled on composite, which softens all the moving
// light (and on a HiDPI panel halves the detail outright). The ping-pong also resamples
// the previous frame every frame, so any mismatch compounds into progressive mush —
// matching resolution keeps that blit pixel-aligned and effectively lossless.
export class TrailRenderer {
  constructor(renderer, source, width, height) {
    this.renderer = renderer;
    this.source = source;
    this.resolution = renderer.resolution || 1;
    this.textureA = this.createTexture(width, height);
    this.textureB = this.createTexture(width, height);
    this.fadeSprite = new Sprite(this.textureA);
    // The on-stage composite. Sources are pure additive light, so ADD is exact.
    this.sprite = new Sprite(this.textureA);
    this.sprite.blendMode = BLEND_MODES.ADD;
  }

  createTexture(width, height) {
    // A hidden/minimized window can report 0x0 at load; a zero-sized framebuffer throws.
    return RenderTexture.create({
      width: Math.max(1, width),
      height: Math.max(1, height),
      resolution: this.resolution,
      scaleMode: SCALE_MODES.NEAREST // 1:1 blit — no filtering to soften the feedback loop
    });
  }

  resize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    // Follow the renderer if Render Scale changed, otherwise a stale resolution would
    // quietly reintroduce the upscale blur.
    const resolution = this.renderer.resolution || 1;
    if (resolution !== this.resolution) {
      this.resolution = resolution;
      this.textureA.destroy(true);
      this.textureB.destroy(true);
      this.textureA = this.createTexture(w, h);
      this.textureB = this.createTexture(w, h);
      this.fadeSprite.texture = this.textureA;
      this.sprite.texture = this.textureA;
      return;
    }
    this.textureA.resize(w, h);
    this.textureB.resize(w, h);
  }

  // persistence = seconds for a trail to fade to ~37%. Framerate independent.
  update(dt, persistence = 0.09) {
    const fade = Math.exp(-dt / Math.max(0.01, persistence));
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
