import { BLEND_MODES, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS, ROUTABLE_STATIONS, stationById } from '../config.js';
import { clamp, formatPercent, TAU } from '../utils/MathUtils.js';

function seeded(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function pct(value) {
  return formatPercent(value ?? 0);
}

function drawEllipseArc(graphics, cx, cy, rx, ry, start, end, steps = 40) {
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    if (i === 0) graphics.moveTo(x, y);
    else graphics.lineTo(x, y);
  }
}

export class PipelineRenderer {
  constructor(stage) {
    this.root = new Container();
    stage.addChild(this.root);

    this.background = new Graphics();
    this.radar = new Graphics();
    this.wells = new Graphics();
    this.glow = new Graphics();
    this.tasks = new Graphics();
    this.labelsLayer = new Container();
    this.glow.blendMode = BLEND_MODES.ADD;

    this.root.addChild(this.background, this.radar, this.glow, this.wells, this.tasks, this.labelsLayer);

    this.labels = new Map();
    this.stars = Array.from({ length: 120 }, (_, index) => ({
      x: seeded(index + 1),
      y: seeded(index + 200),
      r: 0.45 + seeded(index + 400) * 1.25,
      a: 0.05 + seeded(index + 600) * 0.16
    }));

    this.stationStyle = new TextStyle({
      fill: COLORS.text,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
      letterSpacing: 0,
      align: 'center',
      stroke: '#020309',
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: '#2dd4ff',
      dropShadowBlur: 5,
      dropShadowAlpha: 0.5,
      dropShadowDistance: 0
    });

    this.taskStyle = new TextStyle({
      fill: 0xe8fbff,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 9,
      fontWeight: '700',
      lineHeight: 11,
      letterSpacing: 0,
      align: 'center',
      stroke: '#020309',
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: '#7dd3fc',
      dropShadowBlur: 4,
      dropShadowAlpha: 0.36,
      dropShadowDistance: 0
    });

    this.detailStyle = new TextStyle({
      fill: 0xf4fbff,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 14,
      letterSpacing: 0,
      stroke: '#010309',
      strokeThickness: 4
    });
  }

  render(model, activityState, config, time) {
    this.width = model.width;
    this.height = model.height;
    const seenLabels = new Set();

    this.drawBackground(model, activityState, time);
    this.drawRadar(model, activityState, time);
    this.drawWells(model, activityState, seenLabels, time);
    this.drawTasks(model, config, seenLabels, time);
    this.finishLabels(seenLabels);
  }

  radarGeometry(model) {
    const core = model.stationMap.get('queue');
    const cpu = model.stationMap.get('cpu');
    const gpu = model.stationMap.get('gpu');
    const ram = model.stationMap.get('ram');
    const disk = model.stationMap.get('disk');
    return {
      cx: core?.x ?? model.width * 0.5,
      cy: core?.y ?? model.height * 0.52,
      rx: Math.max(120, (gpu?.x ?? model.width * 0.82) - (core?.x ?? model.width * 0.5)),
      ry: Math.max(100, (disk?.y ?? model.height * 0.86) - (core?.y ?? model.height * 0.52)),
      cpu,
      gpu,
      ram,
      disk,
      core
    };
  }

  drawBackground(model, activityState, time) {
    const width = model.width;
    const height = model.height;
    const { cx, cy } = this.radarGeometry(model);
    const load = activityState.value('overallLoad');

    this.background.clear();
    this.background.beginFill(COLORS.background, 1);
    this.background.drawRect(0, 0, width, height);
    this.background.endFill();

    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      this.background.beginFill(COLORS.backgroundAlt, 0.16 - t * 0.02 + load * 0.015);
      this.background.drawEllipse(cx, cy, width * (0.18 + t * 0.22), height * (0.14 + t * 0.17));
      this.background.endFill();
    }

    this.background.lineStyle(1, COLORS.grid, 0.045);
    const gap = 68;
    for (let x = -width * 0.1 + (time * 4) % gap; x < width * 1.08; x += gap) {
      this.background.moveTo(x, 0);
      this.background.lineTo(x - width * 0.09, height);
    }

    for (let i = 0; i < this.stars.length; i += 1) {
      const star = this.stars[i];
      const twinkle = 0.65 + Math.sin(time * 0.75 + i * 0.9) * 0.35;
      this.background.beginFill(0x83e7ff, star.a * twinkle);
      this.background.drawCircle(star.x * width, star.y * height, star.r);
      this.background.endFill();
    }
  }

  drawRadar(model, activityState, time) {
    const { cx, cy, rx, ry, cpu, ram, gpu, disk } = this.radarGeometry(model);
    this.radar.clear();
    this.glow.clear();

    this.glow.beginFill(0x123149, 0.08 + activityState.value('overallLoad') * 0.035);
    this.glow.drawEllipse(cx, cy, rx * 1.08, ry * 1.08);
    this.glow.endFill();

    for (let i = 1; i <= 4; i += 1) {
      const k = i / 4;
      this.radar.lineStyle(1, 0x9bdfff, 0.055 + i * 0.018);
      this.radar.drawEllipse(cx, cy, rx * k, ry * k);
    }

    const spokes = [cpu, ram, gpu, disk].filter(Boolean);
    for (const station of spokes) {
      this.radar.lineStyle(1.1, station.color, 0.12 + station.value * 0.22);
      this.radar.moveTo(cx, cy);
      this.radar.lineTo(station.x, station.y);
    }

    const arcs = [
      ['cpu', Math.PI * 0.72, Math.PI * 1.28],
      ['ram', -Math.PI * 0.78, -Math.PI * 0.22],
      ['gpu', -Math.PI * 0.28, Math.PI * 0.28],
      ['disk', Math.PI * 0.22, Math.PI * 0.78]
    ];
    for (const [id, start, end] of arcs) {
      const station = model.stationMap.get(id);
      if (!station) continue;
      this.radar.lineStyle(2.2 + station.value * 2, station.color, 0.22 + station.value * 0.34);
      drawEllipseArc(this.radar, cx, cy, rx * 0.97, ry * 0.97, start + time * 0.025, end + time * 0.025);
    }

    this.radar.beginFill(0xffffff, 0.18);
    this.radar.drawCircle(cx, cy, 5 + activityState.value('overallLoad') * 8);
    this.radar.endFill();
    this.radar.lineStyle(1, 0xaeeeff, 0.22);
    this.radar.drawCircle(cx, cy, 22 + activityState.value('overallLoad') * 18);
  }

  drawWells(model, activityState, seenLabels, time) {
    this.wells.clear();
    for (const station of model.stations) {
      const value = clamp(station.value);
      const isCore = station.id === 'queue';
      const radius = isCore ? 24 + value * 18 : 18 + value * 26;

      this.wells.beginFill(station.color, isCore ? 0.12 : 0.14 + value * 0.12);
      this.wells.drawCircle(station.x, station.y, radius);
      this.wells.endFill();

      this.wells.lineStyle(1, station.color, 0.22 + value * 0.24);
      this.wells.drawCircle(station.x, station.y, radius + 10 + Math.sin(time * 1.2 + station.x) * 2);
      this.wells.lineStyle(2, station.color, 0.5 + value * 0.28);
      this.wells.arc(station.x, station.y, radius + 4, -Math.PI / 2 + time * 0.14, -Math.PI / 2 + time * 0.14 + TAU * value);

      let labelX = station.x;
      let labelY = station.y;
      let anchorX = 0.5;
      let anchorY = 0.5;
      if (station.id === 'cpu') {
        labelX -= radius + 18;
        anchorX = 1;
      } else if (station.id === 'gpu') {
        labelX += radius + 18;
        anchorX = 0;
      } else if (station.id === 'ram') {
        labelY -= radius + 18;
        anchorY = 1;
      } else if (station.id === 'disk' || station.id === 'network') {
        labelY += radius + 18;
        anchorY = 0;
      } else {
        labelY += radius + 16;
        anchorY = 0;
      }
      this.setLabel(`station:${station.id}`, `${station.short} ${pct(value)}`, labelX, labelY, this.stationStyle, anchorX, anchorY, seenLabels, isCore ? 0.58 : 0.86);
    }

    const network = model.stationMap.get('network');
    if (network) {
      const down = pct(activityState.value('netDown'));
      const up = pct(activityState.value('netUp'));
      this.setLabel('network:rates', `DOWN ${down}  UP ${up}`, network.x, network.y + 54, this.stationStyle, 0.5, 0, seenLabels, 0.64);
    }
  }

  drawTasks(model, config, seenLabels, time) {
    this.tasks.clear();
    const ordered = [...model.tasks].sort((a, b) => a.score - b.score);

    for (const task of ordered) {
      if (task.alpha <= 0.03) continue;
      const station = stationById(task.station);
      const color = station.color;
      const focus = Math.max(task.focus ?? 0, task.grab ?? 0);
      const radius = model.taskRadius(task);
      const value = clamp(task.metricValue);
      const alpha = task.alpha * (0.46 + value * 0.32 + focus * 0.22);
      const driftX = Math.cos(time * 0.55 + task.phase) * (1.2 + value * 2.8) * (1 - focus * 0.55);
      const driftY = Math.sin(time * 0.65 + task.phase * 1.3) * (1.2 + value * 2.6) * (1 - focus * 0.55);
      const x = task.x + driftX;
      const y = task.y + driftY;

      this.glow.beginFill(color, (0.035 + value * 0.075 + focus * 0.08) * task.alpha);
      this.glow.drawCircle(x, y, radius * (2.4 + focus * 1.4));
      this.glow.endFill();

      this.tasks.beginFill(0x03101a, 0.8 * task.alpha);
      this.tasks.drawCircle(x, y, radius);
      this.tasks.endFill();
      this.tasks.beginFill(color, alpha);
      this.tasks.drawCircle(x, y, radius * (0.46 + value * 0.24));
      this.tasks.endFill();

      let start = -Math.PI / 2 + time * 0.12 + task.phase;
      for (const id of ROUTABLE_STATIONS) {
        const share = task.affinity?.[id] ?? 0;
        if (share <= 0.04) continue;
        const arc = Math.max(0.07, TAU * share * 0.72);
        this.tasks.lineStyle(1.2 + share * 1.6, stationById(id).color, (0.3 + share * 0.34) * task.alpha);
        this.tasks.arc(x, y, radius + 3.5 + share * 3, start, start + arc);
        start += arc + 0.1;
      }

      if (focus > 0.04) {
        this.tasks.lineStyle(1.2, 0xffffff, 0.52 * focus);
        this.tasks.drawCircle(x, y, radius + 10 + Math.sin(time * 8) * 1.2);
        this.tasks.lineStyle(0.8, color, 0.46 * focus);
        this.tasks.drawCircle(x, y, radius + 17);
      }

      const important = false;
      if (config.showLabels && (focus > 0.24 || important)) {
        const label = focus > 0.45 ? `${task.name}\n${station.short} ${pct(value)}` : task.name;
        this.setLabel(`task:${task.id}`, label, x, y - radius - 9, this.taskStyle, 0.5, 1, seenLabels, focus > 0.45 ? 1 : 0.42);
      }

      if (focus > 0.45) this.drawDetail(task, x + radius + 18, y - 68, seenLabels);
    }
  }

  drawDetail(task, x, y, seenLabels) {
    const s = task.stats ?? {};
    const station = stationById(task.station);
    const lines = [
      task.name,
      `${station.label}  ${pct(task.metricValue)}`,
      `CPU ${pct(s.cpu)}   RAM ${pct(s.ram)}`,
      `GPU ${pct(s.gpu)}   DISK ${pct(s.disk)}`,
      `PID ${task.pid}${Number.isFinite(s.threads) ? `   TH ${s.threads}` : ''}`
    ];
    const text = lines.join('\n');
    const width = 210;
    const height = 86;
    const cardX = Math.max(16, Math.min(x, (this.width ?? 1280) - width - 16));
    const cardY = Math.max(16, Math.min(y, (this.height ?? 720) - height - 16));

    this.tasks.beginFill(0x020813, 0.82);
    this.tasks.lineStyle(1, station.color, 0.5);
    this.tasks.drawRoundedRect(cardX, cardY, width, height, 6);
    this.tasks.endFill();
    this.setLabel(`detail:${task.id}`, text, cardX + 10, cardY + 9, this.detailStyle, 0, 0, seenLabels, 1);
  }

  setLabel(id, text, x, y, style, anchorX, anchorY, seenLabels, alpha = 1) {
    seenLabels.add(id);
    let label = this.labels.get(id);
    if (!label) {
      label = new Text(text, style);
      label.resolution = 2;
      label.roundPixels = true;
      this.labels.set(id, label);
      this.labelsLayer.addChild(label);
    }
    if (label.text !== text) label.text = text;
    label.style = style;
    label.x = x;
    label.y = y;
    label.anchor.set(anchorX, anchorY);
    label.alpha = alpha;
    label.visible = true;
  }

  finishLabels(seenLabels) {
    for (const [id, label] of this.labels) {
      if (seenLabels.has(id)) continue;
      label.visible = false;
    }
  }
}
