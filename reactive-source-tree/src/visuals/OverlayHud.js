// A small Gource-style overlay: title, clock/date, total load, and a resource colour
// legend. DOM-based (like the debug overlay) so the text stays crisp.
// Each legend entry also reads out its live utilisation, the way Task Manager does, so
// the colour key doubles as the meter: "GPU 55%", "CPU 10%", ...
const LEGEND = [
  ['CPU', 'cpu', (a) => a.value('cpu')],
  ['RAM', 'ram', (a) => a.value('ram')],
  ['GPU', 'gpu', (a) => a.value('gpu')],
  ['DISK', 'disk', (a) => a.value('disk')],
  ['NET', 'network', (a) => Math.max(a.value('netDown'), a.value('netUp'))],
  ['AUDIO', 'audio', (a) => a.value('audioVolume')]
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

  // Build once and keep a handle on each percentage span: the values tick a couple of
  // times a second, and rewriting innerHTML that often would rebuild the whole legend.
  buildLegend(palette) {
    if (!this.legendEl) return;
    this.legendEl.innerHTML = LEGEND.map(([label, key]) => {
      const color = hex(palette.colors[key]);
      return `<span class="hud-leg"><i style="background:${color};box-shadow:0 0 6px ${color}"></i>${label}<b class="hud-val">--%</b></span>`;
    }).join('');
    this.valueEls = [...this.legendEl.querySelectorAll('.hud-val')];
  }

  setPalette(palette) {
    this.buildLegend(palette);
  }

  update(activityState, config, dt, model = null) {
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
      // The process tree has no core node to carry the count, so it lives here instead.
      const processCount = model?.dynamicNodeIds?.size ?? 0;
      const suffix = model?.autoFit && processCount ? `   ${processCount} PROC` : '';
      this.loadEl.textContent = `LOAD ${Math.round(activityState.value('overallLoad') * 100)}%${suffix}`;
    }

    if (this.valueEls) {
      for (let i = 0; i < LEGEND.length; i += 1) {
        const el = this.valueEls[i];
        if (!el) continue;
        const next = `${Math.round(LEGEND[i][2](activityState) * 100)}%`;
        if (el.textContent !== next) el.textContent = next;
      }
    }
  }
}
