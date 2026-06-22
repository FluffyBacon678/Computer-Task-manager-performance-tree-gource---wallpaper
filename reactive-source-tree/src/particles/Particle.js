export class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.size = 2;
    this.color = 0xffffff;
    this.alpha = 1;
    this.mode = 'free';
    this.sourceNode = null;
    this.targetNode = null;
    this.link = null;
    this.pathProgress = 0;
    this.speed = 1;
    this.category = 'core';
    this.phase = Math.random() * Math.PI * 2;
  }

  reset() {
    this.active = false;
    this.sourceNode = null;
    this.targetNode = null;
    this.link = null;
    return this;
  }
}
