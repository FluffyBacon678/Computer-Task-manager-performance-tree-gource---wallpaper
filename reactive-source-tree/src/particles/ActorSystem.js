import { Graphics } from 'pixi.js';
import { clamp } from '../utils/MathUtils.js';

// A roaming "scheduler" actor — the closest analog to Gource's committer avatars. It
// drifts with friction and a max speed toward whichever process is hottest, and fires a
// beam that lights the process up when it gets close.
export class ActorSystem {
  constructor(parent, palette) {
    this.palette = palette;
    this.graphics = new Graphics();
    parent.addChild(this.graphics);
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.phase = 0;
    this.targetId = null;
    this.retarget = 0;
    this.beamCooldown = 0;
    this.spawned = false;
  }

  setPalette(palette) {
    this.palette = palette;
  }

  pickHottest(model) {
    let best = null;
    let bestVal = 0.05;
    for (const id of model.dynamicNodeIds) {
      const node = model.nodeById.get(id);
      if (!node || node.liveKind !== 'process') continue;
      const value = node.value ?? 0;
      if (value > bestVal) {
        bestVal = value;
        best = node;
      }
    }
    return best;
  }

  update(model, beamSystem, config, dt) {
    if (!config.enableActor) {
      this.graphics.clear();
      return;
    }
    this.phase += dt;
    const root = model.nodeById.get('root');
    if (!this.spawned && root) {
      this.x = root.renderX;
      this.y = root.renderY;
      this.spawned = true;
    }

    this.retarget -= dt;
    let target = this.targetId ? model.nodeById.get(this.targetId) : null;
    if (this.retarget <= 0 || !target) {
      target = this.pickHottest(model);
      this.targetId = target?.id ?? null;
      this.retarget = 1.6 + Math.random() * 1.6;
    }

    const tx = target ? target.renderX : root ? root.renderX : 0;
    const ty = target ? target.renderY : root ? root.renderY : 0;
    // Orbit a point near the target rather than sitting on top of it.
    const ox = tx + Math.cos(this.phase * 1.3) * 46;
    const oy = ty + Math.sin(this.phase * 1.3) * 46;
    this.vx += (ox - this.x) * 1.7 * dt;
    this.vy += (oy - this.y) * 1.7 * dt;
    this.vx *= 0.92;
    this.vy *= 0.92;
    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = 360;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vy = (this.vy / speed) * maxSpeed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.beamCooldown -= dt;
    if (target && this.beamCooldown <= 0) {
      const dist = Math.hypot(tx - this.x, ty - this.y);
      if (dist < 150) {
        beamSystem.spawn(this.x, this.y, target.renderX, target.renderY, target.color);
        target.flare = clamp((target.flare ?? 0) + 0.55);
        this.beamCooldown = 0.45 + Math.random() * 0.7;
      }
    }
  }

  render(config) {
    this.graphics.clear();
    if (!config.enableActor || !this.spawned) return;
    const color = this.palette.colors.coreAccent;
    const x = this.x;
    const y = this.y;

    this.graphics.lineStyle(1.2, color, 0.5);
    this.graphics.drawCircle(x, y, 9);

    this.graphics.lineStyle(1.6, color, 0.75);
    for (let i = 0; i < 4; i += 1) {
      const angle = this.phase * 1.8 + (i * Math.PI) / 2;
      this.graphics.moveTo(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10);
      this.graphics.lineTo(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
    }

    this.graphics.beginFill(color, 0.45);
    this.graphics.drawCircle(x, y, 6);
    this.graphics.endFill();
    this.graphics.beginFill(0xffffff, 0.9);
    this.graphics.drawCircle(x, y, 2.6);
    this.graphics.endFill();

    if (!config.lowPerformanceMode) {
      this.graphics.beginFill(color, 0.08 * config.glowStrength);
      this.graphics.drawCircle(x, y, 18);
      this.graphics.endFill();
    }
  }
}
