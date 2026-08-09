export class PointerInput {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.isDown = false;
    this.justPressed = false;
    this.justReleased = false;
    this.active = false;
    this.id = null;

    if (typeof window === 'undefined') return;
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;

    const move = (event) => {
      if (this.id !== null && event.pointerId !== this.id) return;
      this.x = event.clientX;
      this.y = event.clientY;
      this.active = true;
    };
    const down = (event) => {
      this.id = event.pointerId;
      this.isDown = true;
      this.justPressed = true;
      move(event);
      try {
        event.target?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort in Wallpaper Engine webviews.
      }
      event.preventDefault?.();
    };
    const up = (event) => {
      if (this.id !== null && event.pointerId !== this.id) return;
      move(event);
      this.isDown = false;
      this.justReleased = true;
      this.id = null;
    };
    const cancel = () => {
      this.isDown = false;
      this.justReleased = true;
      this.id = null;
      this.active = false;
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointerup', up, { passive: true });
    window.addEventListener('pointercancel', cancel, { passive: true });
    window.addEventListener('blur', cancel, { passive: true });
  }

  endFrame() {
    this.justPressed = false;
    this.justReleased = false;
  }
}
