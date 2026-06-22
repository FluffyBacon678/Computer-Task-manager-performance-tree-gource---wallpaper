export class ResizeHandler {
  constructor(app, onResize) {
    this.app = app;
    this.onResize = onResize;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  handleResize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.onResize?.(width, height);
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}
