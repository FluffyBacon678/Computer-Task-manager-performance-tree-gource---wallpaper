import { Particle } from './Particle.js';

export class ParticlePool {
  constructor(maxParticles = 500) {
    this.particles = [];
    this.resize(maxParticles);
  }

  resize(maxParticles) {
    this.maxParticles = Math.max(0, Math.floor(maxParticles));
    while (this.particles.length < this.maxParticles) {
      this.particles.push(new Particle());
    }
    if (this.particles.length > this.maxParticles) {
      for (let i = this.maxParticles; i < this.particles.length; i += 1) {
        this.particles[i].reset();
      }
    }
  }

  acquire() {
    for (let i = 0; i < this.maxParticles; i += 1) {
      const particle = this.particles[i];
      if (!particle.active) {
        particle.active = true;
        return particle;
      }
    }
    return null;
  }

  activeCount() {
    let count = 0;
    for (let i = 0; i < this.maxParticles; i += 1) {
      if (this.particles[i].active) count += 1;
    }
    return count;
  }
}
