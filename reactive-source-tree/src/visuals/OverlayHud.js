// A small Gource-style overlay: title, clock/date, total load, and a resource colour
// legend. DOM-based (like the debug overlay) so the text stays crisp.
const LEGEND = [
  ['CPU', 'cpu'],
  ['RAM', 'ram'],
  ['GPU', 'gpu'],
  ['DISK', 'disk'],
  ['NET', 'network'],
  ['AUDIO', 'audio']
];

function hex(value) {
  return `#${(value ?? 0xffffff).toString(16).padStart(6, '0')}`;
}

export class OverlayHud {
  constructor(palette) {
    this.el = document.getElementById('hud');
    this.titleEl = document.getElementById('hud-title');
    this.clockEl = document.getElementById('hud-clock');
    this.dateEl = document.getElementById('hud-date');
    this.loadEl = document.getElementById('hud-load');
    this.legendEl = document.getElementById('hud-legend');
    this.lastClock = '';
    this.accumulator = 1;
    this.buildLegend(palette);
  }

  buildLegend(palette) {
    if (!this.legendEl) return;
    this.legendEl.innerHTML = LEGEND.map(([label, key]) => {
      const color = hex(palette.colors[key]);
      return `<span class="hud-leg"><i style="background:${color};box-shadow:0 0 6px ${color}"></i>${label}</span>`;
    }).join('');
  }

  setPalette(palette) {
    this.buildLegend(palette);
  }

  update(activityState, config, dt) {
    if (!this.el) return;
    const show = config.showHud;
    this.el.style.display = show ? 'block' : 'none';
    if (!show) return;

    this.accumulator += dt;
    if (this.accumulator < 0.5) return;
    this.accumulator = 0;

    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      if (this.clockEl) this.clockEl.textContent = clock;
      if (this.dateEl) {
        this.dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      }
    }
    if (this.loadEl) {
      this.loadEl.textContent = `LOAD ${Math.round(activityState.value('overallLoad') * 100)}%`;
    }
  }
}
