import { Graphics } from 'pixi.js';
import { clamp, lerp } from '../utils/MathUtils.js';
import { LinkVisual } from './LinkVisual.js';
import { NodeVisual } from './NodeVisual.js';
import { LabelRenderer } from '../visuals/LabelRenderer.js';

export class GraphRenderer {
  constructor(layers, palette) {
    this.layers = layers;
    this.palette = palette;

    this.linkGraphics = new Graphics();
    this.glowGraphics = new Graphics();
    this.nodeGraphics = new Graphics();
    this.layers.graphLineLayer.addChild(this.linkGraphics);
    this.layers.glowLayer.addChild(this.glowGraphics);
    this.layers.nodeLayer.addChild(this.nodeGraphics);

    this.linkVisual = new LinkVisual(this.linkGraphics);
    this.nodeVisual = new NodeVisual(this.nodeGraphics);
    this.labelRenderer = new LabelRenderer(this.layers.uiLayer, palette);
  }

  setPalette(palette) {
    this.palette = palette;
    this.labelRenderer.setPalette(palette);
  }

  updateVisualInterpolation(model, dt) {
    const factor = clamp(1 - Math.pow(0.0005, dt));
    for (const node of model.nodes) {
      node.renderX = lerp(node.renderX ?? node.x, node.x, factor);
      node.renderY = lerp(node.renderY ?? node.y, node.y, factor);
      node.renderRadius = lerp(node.renderRadius ?? node.targetRadius, node.targetRadius, factor * 0.82);
    }
  }

  render(model, activityState, config, time, dt) {
    this.updateVisualInterpolation(model, dt);

    this.linkGraphics.clear();
    this.nodeGraphics.clear();
    this.glowGraphics.clear();

    const glowStrength = config.lowPerformanceMode ? config.glowStrength * 0.42 : config.glowStrength;
    for (const link of model.links) {
      if ((link.source.visibleFactor ?? 1) <= 0.04 || (link.target.visibleFactor ?? 1) <= 0.04) continue;
      this.linkVisual.draw(link, time, glowStrength, config.lowPerformanceMode);
    }

    for (const node of model.nodes) {
      this.nodeVisual.draw(node, activityState, config, time);
    }

    this.labelRenderer.update(model.nodes, config, dt);
  }
}
