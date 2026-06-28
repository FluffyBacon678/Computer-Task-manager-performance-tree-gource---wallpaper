// Watches the measured FPS and produces a 0.45..1 "quality scale" that the particle
// systems multiply into their counts. When the machine can't keep up it eases down; when
// there is headroom it eases back up. This lets one wallpaper run smoothly across very
// different GPUs (e.g. a 1050Ti to a 2070S) instead of being tuned for a single machine.
//
// It only scales the cheap, plentiful work (particle counts) — not the render resolution —
// so adapting never reallocates GPU framebuffers or causes a hitch.
export class AdaptiveQuality {
  constructor() {
    this.scale = 1;
    this.accumulator = 0;
  }

  update(fps, dt, enabled) {
    if (!enabled) {
      this.scale = Math.min(1, this.scale + dt * 0.5);
      return this.scale;
    }
    this.accumulator += dt;
    if (this.accumulator < 0.6) return this.scale;
    this.accumulator = 0;

    if (fps < 45) {
      this.scale = Math.max(0.45, this.scale - 0.12);
    } else if (fps > 57 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.06);
    }
    return this.scale;
  }
}
