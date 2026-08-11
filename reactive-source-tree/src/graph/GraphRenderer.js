import { BLEND_MODES, Graphics } from 'pixi.js';
import { clamp, lerp } from '../utils/MathUtils.js';
import { LinkVisual } from './LinkVisual.js';
import { NodeVisual } from './NodeVisual.js';
import { LabelRenderer } from '../visuals/LabelRenderer.js';
import { SpriteField } from '../visuals/SpriteField.js';

export class GraphRenderer {
  constructor(layers, palette) {
    this.layers = layers;
    this.palette = palette;

    this.linkGraphics = new Graphics();
    // Links are pure glow strokes, so they blend additively (overlaps brighten instead of
    // occluding). Node graphics stay on normal blending: the gauges draw dark backing
    // rings that ADD would erase.
    this.linkGraphics.blendMode = BLEND_MODES.ADD;
    this.nodeGraphics = new Graphics();
    this.layers.graphLineLayer.addChild(this.linkGraphics);
    this.layers.nodeLayer.addChild(this.nodeGraphics);
    // Node halos are batched GPU sprites in the (otherwise unused) glow layer, which sits
    // behind the node cores/rings — so the crisp cores stay on top.
    // Sized for the process-tree mode, which can carry a few hundred nodes at once
    // (plus the ones mid fade-out) — all still batched into a handful of draw calls.
    this.glowField = new SpriteField(this.layers.glowLayer, 640);

    this.linkVisual = new LinkVisual(this.linkGraphics);
    this.nodeVisual = new NodeVisual(this.nodeGraphics, this.glowField);
    this.labelRenderer = new LabelRenderer(this.layers.uiLayer, palette);
  }

  setPalette(palette) {
    this.palette = palette;
    this.labelRenderer.setPalette(palette);
  }

  updateVisualInterpolation(model, dt, time = 0) {
    const factor = clamp(1 - Math.pow(0.0005, dt));
    for (const node of model.nodes) {
      node.renderX = lerp(node.renderX ?? node.x, node.x, factor);
      node.renderY = lerp(node.renderY ?? node.y, node.y, factor);
      node.renderRadius = lerp(node.renderRadius ?? node.targetRadius, node.targetRadius, factor * 0.82);

      // Render-only sway: each node drifts on its own slow lissajous so the constellation
      // is never frozen, even when the force sim has settled and everything is idle. Two
      // detuned frequencies per axis keep it from reading as a uniform throb, and the
      // amplitude is a couple of pixels — it breathes rather than wobbles.
      const sway = node.type === 'root' ? 0 : 1.6 + (node.activity ?? 0) * 2.2;
      if (sway > 0) {
        const p = node.phase;
        node.renderX += (Math.sin(time * 0.53 + p) + Math.sin(time * 0.31 + p * 1.7) * 0.6) * sway;
        node.renderY += (Math.cos(time * 0.47 + p * 1.3) + Math.cos(time * 0.29 + p) * 0.6) * sway;
      }
    }
  }

  render(model, activityState, config, time, dt, worldRotation = 0, worldScale = 1) {
    this.updateVisualInterpolation(model, dt, time);

    this.linkGraphics.clear();
    this.nodeGraphics.clear();
    this.glowField.begin();

    const glowStrength = config.lowPerformanceMode ? config.glowStrength * 0.42 : config.glowStrength;
    // Each link pass is a CPU-tessellated curve. The process tree can have hundreds of
    // links, so scale the effective quality down with link count — the extra glow passes
    // shed automatically and only the crisp core line survives on a dense tree.
    const linkLoad = model.links.length > 150 ? 0.5 : model.links.length > 90 ? 0.7 : 1;
    const quality = (config.qualityScale ?? 1) * linkLoad;
    for (const link of model.links) {
      if ((link.source.visibleFactor ?? 1) <= 0.04 || (link.target.visibleFactor ?? 1) <= 0.04) continue;
      this.linkVisual.draw(link, time, glowStrength, config.lowPerformanceMode, quality);
    }

    for (const node of model.nodes) {
      this.nodeVisual.draw(node, activityState, config, time);
    }

    // Draw nodes mid fade-out, then purge ones whose death envelope has finished.
    if (model.dyingNodes && model.dyingNodes.length) {
      for (let i = model.dyingNodes.length - 1; i >= 0; i -= 1) {
        const node = model.dyingNodes[i];
        if (time - node.deathTime >= 0.65) {
          model.dyingNodes.splice(i, 1);
          continue;
        }
        this.nodeVisual.draw(node, activityState, config, time);
      }
    }

    this.glowField.end();
    // Labels counter-scale against the camera only when the model drives its own zoom
    // (the process tree's auto-fit); the resource view's zoom is stable and keeps its
    // hand-tuned label sizing.
    this.labelRenderer.update(model.nodes, config, dt, worldRotation, model.autoFit ? worldScale : 1);
  }
}
