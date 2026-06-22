import { clamp, lerp } from '../utils/MathUtils.js';
import { createNoise2D } from '../utils/Noise.js';

export class CameraController {
  constructor(container, width, height) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.noise = createNoise2D(442);
    this.scale = 1;
    this.x = width / 2;
    this.y = height / 2;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  update(activityState, config, time, dt) {
    const baseScale = clamp(Math.min(this.width / 1120, this.height / 780), 0.62, 1.55);
    const wideCorrection = this.width / this.height > 2.8 ? 1.08 : 1;
    const load = activityState.value('overallLoad') * config.intensity;
    const bass = activityState.value('audioBass');
    const targetScale = baseScale * wideCorrection * (1 + load * 0.035 + bass * 0.018);
    const driftAmount = config.cameraDrift ? lerp(3, 18, load) : 0;
    const driftX = (this.noise(time * 0.018, 7) - 0.5) * driftAmount;
    const driftY = (this.noise(4, time * 0.015) - 0.5) * driftAmount;
    const targetX = this.width / 2 + driftX;
    const targetY = this.height / 2 + driftY;
    const factor = clamp(1 - Math.pow(0.0001, dt));

    this.scale = lerp(this.scale, targetScale, factor);
    this.x = lerp(this.x, targetX, factor);
    this.y = lerp(this.y, targetY, factor);

    this.container.position.set(this.x, this.y);
    this.container.scale.set(this.scale);
  }
}
