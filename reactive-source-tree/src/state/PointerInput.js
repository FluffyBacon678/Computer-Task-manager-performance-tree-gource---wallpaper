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
    this.isDown = false;
    this.justPressed = false;
    this.justReleased = false;
    this.pointerId = null;

    if (typeof window === 'undefined') return;

    const onMove = (event) => {
      if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
      this.x = event.clientX;
      this.y = event.clientY;
      this.lastMoveAt = this.time;
    };
    const onDown = (event) => {
      this.pointerId = event.pointerId;
      this.isDown = true;
      this.justPressed = true;
      onMove(event);
      try {
        event.target?.setPointerCapture?.(event.pointerId);
      } catch {
        // Some Wallpaper Engine/webview targets do not expose pointer capture.
      }
      event.preventDefault?.();
    };
    const onUp = (event) => {
      if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
      onMove(event);
      this.isDown = false;
      this.justReleased = true;
      this.pointerId = null;
    };
    const onLeave = () => {
      if (!this.isDown) this.lastMoveAt = -10;
    };
    const onCancel = (event = {}) => {
      if (event.pointerId !== undefined && this.pointerId !== null && event.pointerId !== this.pointerId) return;
      this.isDown = false;
      this.justReleased = true;
      this.pointerId = null;
      this.lastMoveAt = -10;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', () => onCancel(), { passive: true });
  }

  update(dt) {
    this.time += dt;
    const target = this.isDown || this.time - this.lastMoveAt < 1.5 ? 1 : 0;
    this.influence += (target - this.influence) * Math.min(1, dt * 5);
  }

  endFrame() {
    this.justPressed = false;
    this.justReleased = false;
  }
}
