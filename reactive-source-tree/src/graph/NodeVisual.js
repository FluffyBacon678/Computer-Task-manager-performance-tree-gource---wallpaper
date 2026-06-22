import { drawGlowCircle } from '../visuals/GlowUtils.js';
import { clamp, lerp, TAU } from '../utils/MathUtils.js';

export class NodeVisual {
  constructor(graphics) {
    this.graphics = graphics;
  }

  draw(node, activityState, config, time) {
    const visible = node.visibleFactor ?? 1;
    if (visible <= 0.03) return;

    const activity = node.activity ?? 0;
    // glowBoost (set per-node in GraphModel) lets live process nodes read brighter
    // than the structural synthetic leaves, which are pushed into the background.
    const boost = node.glowBoost ?? 1;
    const pulse = node.type === 'root'
      ? activityState.value('audioBass') * Math.sin(time * 9) * 1.8
      : Math.sin(time * 2.4 + node.phase) * activity * 0.75;
    const radius = Math.max(0.5, node.renderRadius + pulse);
    const alpha = Math.min(1, (0.42 + activity * 0.55) * boost) * visible;
    const glowStrengthBase = config.lowPerformanceMode ? config.glowStrength * 0.45 : config.glowStrength;

    drawGlowCircle(
      this.graphics,
      node.renderX,
      node.renderY,
      radius,
      node.color,
      alpha,
      glowStrengthBase * (node.type === 'root' ? 1.6 : boost),
      node.type === 'leaf' || config.lowPerformanceMode ? 2 : 4
    );

    if (node.type === 'root') {
      this.graphics.lineStyle(1.4, 0xffffff, 0.58 + activity * 0.34);
      this.graphics.drawCircle(node.renderX, node.renderY, radius * 1.55 + activity * 4);
      this.graphics.lineStyle(0.8, 0xaeeeff, 0.24);
      this.graphics.drawCircle(node.renderX, node.renderY, radius * 2.35 + activity * 8);
    } else if (node.type === 'category') {
      const orbit = radius * lerp(1.8, 2.5, activity);
      this.graphics.lineStyle(0.75, node.color, 0.2 + activity * 0.18);
      this.graphics.drawCircle(node.renderX, node.renderY, orbit);
    } else if (node.type === 'live') {
      const isProcess = node.liveKind === 'process';
      const ringRadius = radius * (isProcess ? 2.15 : 1.7);
      const progress = clamp(node.visualValue ?? node.value ?? 0);
      // heat = raw resource share (0..1); drives ring thickness and core brightness so
      // a heavier process is unmistakably "louder" than a light one.
      const heat = clamp(node.heat ?? node.value ?? 0);

      // Faint background track so the empty part of the ring still reads as a gauge.
      this.graphics.lineStyle({
        width: isProcess ? 2.4 : 1.6,
        color: 0x0c1b29,
        alpha: 0.6
      });
      this.graphics.drawCircle(node.renderX, node.renderY, ringRadius);

      // Coloured usage arc in the node's branch colour.
      this.graphics.lineStyle({
        width: isProcess ? 3 + heat * 1.8 : 2,
        color: node.color,
        alpha: 0.6 + progress * 0.36,
        cap: 'round'
      });
      this.graphics.arc(
        node.renderX,
        node.renderY,
        ringRadius,
        -Math.PI / 2,
        -Math.PI / 2 + TAU * progress
      );

      if (isProcess) {
        // Bright white core that grows with usage; on the ADD-blended node layer this
        // makes hot processes pop forward as the focal points of the graph.
        this.graphics.beginFill(0xffffff, Math.min(0.85, 0.18 + heat * 0.55) * visible);
        this.graphics.drawCircle(node.renderX, node.renderY, Math.max(0.8, radius * 0.42));
        this.graphics.endFill();

        if (!config.lowPerformanceMode) {
          this.graphics.lineStyle(0.8, 0xffffff, 0.16 + progress * 0.28);
          this.graphics.drawCircle(node.renderX, node.renderY, ringRadius + 4);
        }
      }
    }
  }
}
