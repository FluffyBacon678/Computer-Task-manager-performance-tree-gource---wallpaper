import { Container, Text, TextStyle } from 'pixi.js';
import { clamp } from '../utils/MathUtils.js';

function captionText(node) {
  const title = node.caption || node.label;
  return node.captionDetail ? `${title}\n${node.captionDetail}` : title;
}

function shouldShowLabel(node, config) {
  if (!config.showLabels) return false;
  if (node.visibleFactor <= 0.22) return false;
  if (node.type === 'root' || node.type === 'category' || node.type === 'live') return true;
  if (config.lowPerformanceMode) return false;
  return config.showLabels && config.showSystemLeafLabels;
}

// Higher priority labels win the screen when captions collide. Live process nodes are
// the stars of the visualization, so they outrank everything except the core/branches.
function labelPriority(node) {
  if (node.type === 'root') return 5;
  if (node.type === 'category') return 4;
  if (node.type === 'live') {
    if (node.liveKind === 'process') return 3;
    if (node.liveKind === 'drive') return 2.5;
    return 2;
  }
  return 1;
}

function rectsOverlap(a, b, pad) {
  return (
    a.left - pad < b.right &&
    a.right + pad > b.left &&
    a.top - pad < b.bottom &&
    a.bottom + pad > b.top
  );
}

export class LabelRenderer {
  constructor(parent, palette) {
    this.container = new Container();
    parent.addChild(this.container);
    this.palette = palette;
    this.labels = new Map();
    this.candidates = [];
    this.placed = [];
    this.style = new TextStyle({
      fill: palette.colors.text,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0,
      lineHeight: 12,
      align: 'center',
      stroke: '#020711',
      strokeThickness: 3,
      dropShadow: true,
      dropShadowColor: '#00c8ff',
      dropShadowBlur: 6,
      dropShadowAlpha: 0.72,
      dropShadowDistance: 0
    });
  }

  setPalette(palette) {
    this.palette = palette;
    this.style.fill = palette.colors.text;
    for (const text of this.labels.values()) {
      text.style = this.style;
    }
  }

  update(nodes, config, dt = 0.016) {
    const wanted = new Set();
    this.container.visible = true;
    this.candidates.length = 0;

    for (const node of nodes) {
      if (!shouldShowLabel(node, config)) continue;

      wanted.add(node.id);
      let label = this.labels.get(node.id);
      if (!label) {
        label = new Text(captionText(node), this.style);
        label.lastCaptionText = label.text;
        label.roundPixels = true;
        label.resolution = 2;
        label.fade = 0;
        label.shown = false;
        label.alpha = 0;
        this.labels.set(node.id, label);
        this.container.addChild(label);
      }

      const angle = node.angle ?? -Math.PI / 2;
      const horizontal = Math.cos(angle);
      const vertical = Math.sin(angle);
      const outward = node.type === 'root'
        ? node.renderRadius + 20
        : node.type === 'category'
          ? node.renderRadius + 24
          : node.type === 'live'
            ? node.renderRadius + 18
            : node.renderRadius + 14;
      const anchorX = horizontal < -0.25 ? 1 : horizontal > 0.25 ? 0 : 0.5;
      const anchorY = vertical < -0.25 ? 1 : vertical > 0.25 ? 0 : 0.5;
      const activityAlpha = clamp(0.48 + node.activity * 0.46);

      const nextText = captionText(node);
      if (label.lastCaptionText !== nextText) {
        label.text = nextText;
        label.lastCaptionText = nextText;
      }
      label.x = node.renderX + horizontal * outward;
      label.y = node.renderY + vertical * outward;
      label.anchor.set(anchorX, anchorY);
      // Store the target alpha; the actual alpha is driven by the declutter fade below.
      label.baseAlpha = node.type === 'leaf'
        ? clamp(0.32 + node.activity * 0.46) * node.visibleFactor
        : activityAlpha * node.visibleFactor;
      label.scale.set(node.type === 'root' ? 1.05 : node.type === 'category' ? 0.98 : node.type === 'live' ? 0.9 : 0.78);

      this.candidates.push({
        label,
        baseVisible: node.visibleFactor > 0.25,
        priority: labelPriority(node),
        activity: node.activity ?? 0
      });
    }

    // Labels whose node is gone this frame fade out instead of popping off.
    for (const [id, label] of this.labels.entries()) {
      if (!wanted.has(id)) label.declutterShow = false;
    }

    this.declutter(config);
    this.applyFade(dt, wanted);
  }

  // Greedy anti-overlap pass: place highest priority / currently-shown / most active
  // captions first and hide any lower one whose box collides. Sorting shown labels ahead
  // of equal-priority newcomers gives incumbency, which (with the fade) stops flicker.
  declutter(config) {
    const candidates = this.candidates;
    candidates.sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.label.shown === a.label.shown ? 0 : b.label.shown ? 1 : -1) ||
        b.activity - a.activity
    );

    const density = config.labelDensity ?? 1;
    const pad = Math.max(-2, (1.2 - density) * 6);

    const placed = this.placed;
    placed.length = 0;

    for (const candidate of candidates) {
      const label = candidate.label;
      if (!candidate.baseVisible) {
        label.declutterShow = false;
        continue;
      }

      const width = label.width;
      const height = label.height;
      const left = label.x - label.anchor.x * width;
      const top = label.y - label.anchor.y * height;
      const rect = { left, top, right: left + width, bottom: top + height };

      let collides = false;
      for (let i = 0; i < placed.length; i += 1) {
        if (rectsOverlap(rect, placed[i], pad)) {
          collides = true;
          break;
        }
      }

      label.declutterShow = !collides;
      if (!collides) placed.push(rect);
    }
  }

  // Ease every label's visibility toward its decluttered target and prune labels that
  // have fully faded out and are no longer wanted, so the Text pool stays bounded.
  applyFade(dt, wanted) {
    const k = Math.min(1, dt * 11);
    for (const [id, label] of this.labels.entries()) {
      const target = label.declutterShow ? 1 : 0;
      label.fade += (target - label.fade) * k;
      label.shown = label.declutterShow === true;
      label.alpha = (label.baseAlpha ?? 0) * label.fade;
      label.visible = label.fade > 0.02;

      if (!wanted.has(id) && label.fade <= 0.02) {
        this.container.removeChild(label);
        label.destroy();
        this.labels.delete(id);
      }
    }
  }
}
