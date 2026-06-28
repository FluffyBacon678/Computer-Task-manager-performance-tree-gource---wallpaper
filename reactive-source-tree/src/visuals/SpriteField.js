import { Container, Sprite, BLEND_MODES } from 'pixi.js';
import { clamp } from '../utils/MathUtils.js';
import { getGlowTexture } from './GlowTexture.js';

// A pool of additive glow sprites that all share one texture, so Pixi batches them into a
// handful of GPU draw calls. Used like an immediate-mode API (begin / draw / end) so the
// particle systems barely change: each frame we position the active sprites and hide the
// rest — no per-frame geometry tessellation or re-upload.
export class SpriteField {
  constructor(parent, max = 1024) {
    this.container = new Container();
    parent.addChild(this.container);
    this.texture = getGlowTexture();
    this.half = this.texture.width / 2;
    this.sprites = [];
    this.max = max;
    this.index = 0;
  }

  begin() {
    this.index = 0;
  }

  // reach = radius (world units) where the glow fades to nothing.
  draw(x, y, reach, color, alpha) {
    if (this.index >= this.max || alpha <= 0.003 || reach <= 0) return;
    let sprite = this.sprites[this.index];
    if (!sprite) {
      sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.blendMode = BLEND_MODES.ADD;
      this.container.addChild(sprite);
      this.sprites[this.index] = sprite;
    }
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.scale.set(reach / this.half);
    sprite.tint = color;
    sprite.alpha = clamp(alpha);
    this.index += 1;
  }

  end() {
    for (let i = this.index; i < this.sprites.length; i += 1) {
      this.sprites[i].visible = false;
    }
  }
}
