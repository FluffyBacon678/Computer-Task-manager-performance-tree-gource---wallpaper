// Tracks the cursor in screen (CSS-pixel) space and eases an "influence" value so the
// graph reacts to the mouse only while it is being moved, then relaxes when it goes idle.
// Works in a browser and in Wallpaper Engine (which forwards normal pointer events).
export class PointerInput {
  constructor() {
    this.x = (typeof window !== 'undefined' ? window.innerWidth : 0) / 2;
    this.y = (typeof window !== 'undefined' ? window.innerHeight : 0) / 2;
    this.time = 0;
    this.lastMoveAt = -10;
    this.influence = 0;

    if (typeof window === 'undefined') return;

    const onMove = (event) => {
      this.x = event.clientX;
      this.y = event.clientY;
      this.lastMoveAt = this.time;
    };
    const onLeave = () => {
      this.lastMoveAt = -10;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', onLeave, { passive: true });
  }

  update(dt) {
    this.time += dt;
    const target = this.time - this.lastMoveAt < 1.5 ? 1 : 0;
    this.influence += (target - this.influence) * Math.min(1, dt * 5);
  }
}
