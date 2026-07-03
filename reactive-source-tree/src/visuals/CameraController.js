import { clamp, lerp } from '../utils/MathUtils.js';
import { createNoise2D } from '../utils/Noise.js';

function wrapAngle(angle) {
  return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export class CameraController {
  // containers: every camera-driven container (world back, trail scene, world overlay)
  // gets the same transform so they stay perfectly registered.
  constructor(containers, width, height) {
    this.containers = Array.isArray(containers) ? containers : [containers];
    this.width = width;
    this.height = height;
    this.noise = createNoise2D(442);
    this.scale = 1;
    this.x = width / 2;
    this.y = height / 2;
    // Gravity state: smoothed activity center-of-mass (world coords) and a springy
    // lean rotation with angular velocity, so the tree swings rather than snaps.
    this.massX = 0;
    this.massY = 0;
    this.mass = 0;
    this.rotation = 0;
    this.rotationVel = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  // Activity-weighted center of mass of the constellation. Live process balls dominate;
  // branch hubs contribute so the effect also works in demo mode (no telemetry).
  measureMass(model) {
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;
    if (model) {
      for (const node of model.nodes) {
        let weight = 0;
        if (node.type === 'live' && node.liveKind === 'process') {
          weight = (node.value ?? 0) * 1.2;
        } else if (node.type === 'category') {
          weight = (node.activity ?? 0) * 0.7;
        }
        if (weight <= 0.003) continue;
        sumX += node.x * weight;
        sumY += node.y * weight;
        sumW += weight;
      }
    }
    return sumW > 0
      ? { x: sumX / sumW, y: sumY / sumW, mass: clamp(sumW / 3.5) }
      : { x: 0, y: 0, mass: 0 };
  }

  update(activityState, config, time, dt, model) {
    const baseScale = clamp(Math.min(this.width / 1120, this.height / 780), 0.62, 1.55);
    const wideCorrection = this.width / this.height > 2.8 ? 1.08 : 1;
    const load = activityState.value('overallLoad') * config.intensity;
    const bass = activityState.value('audioBass');
    const targetScale = baseScale * wideCorrection * (1 + load * 0.035 + bass * 0.018);
    const driftAmount = config.cameraDrift ? lerp(3, 18, load) : 0;
    const driftX = (this.noise(time * 0.018, 7) - 0.5) * driftAmount;
    const driftY = (this.noise(4, time * 0.015) - 0.5) * driftAmount;
    const factor = clamp(1 - Math.pow(0.0001, dt));

    // --- Gravity (Gource-style): the busy side of the tree has weight. ---
    const gravity = config.gravityStrength ?? 1;
    const measured = this.measureMass(gravity > 0.01 ? model : null);
    const massFactor = clamp(1 - Math.pow(0.02, dt)); // heavy smoothing, ~2s settle
    this.massX = lerp(this.massX, measured.x, massFactor);
    this.massY = lerp(this.massY, measured.y, massFactor);
    this.mass = lerp(this.mass, measured.mass, massFactor);

    // Lean: rotate so the heavy side sags toward the bottom of the screen — a weighted
    // wheel, not a full flip. Capped fraction of the way, spring + damping so shifting
    // load makes the whole constellation swing toward the new heavy branch.
    let targetRotation = 0;
    const massRadius = Math.hypot(this.massX, this.massY);
    if (gravity > 0.01 && this.mass > 0.02 && massRadius > 24) {
      const heavyAngle = Math.atan2(this.massY, this.massX);
      const towardDown = wrapAngle(Math.PI / 2 - heavyAngle);
      targetRotation = clamp(
        towardDown * 0.3 * this.mass * gravity,
        -0.5 * gravity,
        0.5 * gravity
      );
    }
    this.rotationVel += ((targetRotation - this.rotation) * 2.1 - this.rotationVel * 2.4) * dt;
    this.rotation += this.rotationVel * dt;

    // Pull: pan a fraction toward the (rotated) center of mass so the action gravitates
    // to center screen, clamped so the tree never wanders far from center.
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rotatedMassX = this.massX * cos - this.massY * sin;
    const rotatedMassY = this.massX * sin + this.massY * cos;
    const pullLimit = 85 * gravity;
    const pullX = clamp(-rotatedMassX * this.scale * 0.32 * this.mass * gravity, -pullLimit, pullLimit);
    const pullY = clamp(-rotatedMassY * this.scale * 0.32 * this.mass * gravity, -pullLimit, pullLimit);

    const targetX = this.width / 2 + driftX + pullX;
    const targetY = this.height / 2 + driftY + pullY;

    this.scale = lerp(this.scale, targetScale, factor);
    this.x = lerp(this.x, targetX, factor);
    this.y = lerp(this.y, targetY, factor);

    for (const container of this.containers) {
      container.position.set(this.x, this.y);
      container.scale.set(this.scale);
      container.rotation = this.rotation;
    }
  }
}
