import { drawGlowCircle } from '../visuals/GlowUtils.js';
import { clamp, lerp, TAU } from '../utils/MathUtils.js';

const BLOOM_DURATION = 0.55;
const DEATH_DURATION = 0.6;

// Gentle overshoot so a node "blooms" in rather than scaling linearly.
function easeOutBack(t) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const p = t - 1;
  return 1 + c3 * p * p * p + c1 * p * p;
}

export class NodeVisual {
  constructor(graphics) {
    this.graphics = graphics;
  }

  draw(node, activityState, config, time) {
    const visible = node.visibleFactor ?? 1;
    const flare = node.flare ?? 0;
    const focus = node.focus ?? 0;

    // Lifecycle envelope: bloom in on birth, shrink + fade on death.
    let lifeScale = 1;
    let lifeAlpha = 1;
    if (node.birthTime != null) {
      const age = time - node.birthTime;
      if (age < BLOOM_DURATION) {
        const t = clamp(age / BLOOM_DURATION);
        lifeScale = easeOutBack(t);
        lifeAlpha = clamp(t * 1.5);
      }
    }
    if (node.dying) {
      const d = clamp((time - node.deathTime) / DEATH_DURATION);
      lifeScale *= 1 - d;
      lifeAlpha *= 1 - d;
    }
    if (visible * lifeAlpha <= 0.03) return;

    const activity = node.activity ?? 0;
    const boost = node.glowBoost ?? 1;
    const pulse = node.type === 'root'
      ? activityState.value('audioBass') * Math.sin(time * 9) * 1.8
      : Math.sin(time * 2.4 + node.phase) * activity * 0.75;
    const birthFlash = node.birthTime != null && time - node.birthTime < 0.3
      ? (1 - (time - node.birthTime) / 0.3) * 0.5
      : 0;
    const radius = Math.max(0.5, (node.renderRadius + pulse) * lifeScale * (1 + flare * 0.22 + focus * 0.9));
    const alpha = Math.min(1, (0.42 + activity * 0.55) * boost + flare * 0.55 + birthFlash + focus * 0.4) * visible * lifeAlpha;
    const glowStrengthBase = (config.lowPerformanceMode ? config.glowStrength * 0.45 : config.glowStrength) * (1 + flare * 0.8 + focus * 1.1);

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

    if (focus > 0.06) {
      this.graphics.lineStyle(1.3, 0xffffff, 0.5 * focus);
      this.graphics.drawCircle(node.renderX, node.renderY, radius + 6 + focus * 4);
    }

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
      const heat = clamp(node.heat ?? node.value ?? 0);
      const ringAlpha = lifeAlpha;

      this.graphics.lineStyle({
        width: isProcess ? 2.4 : 1.6,
        color: 0x0c1b29,
        alpha: 0.6 * ringAlpha
      });
      this.graphics.drawCircle(node.renderX, node.renderY, ringRadius);

      this.graphics.lineStyle({
        width: isProcess ? 3 + heat * 1.8 : 2,
        color: node.color,
        alpha: (0.6 + progress * 0.36) * ringAlpha,
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
        this.graphics.beginFill(0xffffff, Math.min(0.9, 0.05 + heat * 0.7 + flare * 0.4) * visible * lifeAlpha);
        this.graphics.drawCircle(node.renderX, node.renderY, Math.max(0.6, radius * (0.3 + heat * 0.28)));
        this.graphics.endFill();

        if (!config.lowPerformanceMode) {
          this.graphics.lineStyle(0.8, 0xffffff, (0.16 + progress * 0.28) * ringAlpha);
          this.graphics.drawCircle(node.renderX, node.renderY, ringRadius + 4);

          if (node.isBranchLeader) {
            this.graphics.lineStyle(1.2, node.color, (0.5 + progress * 0.34) * ringAlpha);
            this.graphics.drawCircle(node.renderX, node.renderY, ringRadius + 7.5);
          }
        }
      }
    }
  }
}
