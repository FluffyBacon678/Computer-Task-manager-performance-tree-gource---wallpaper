import { forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { clamp, lerp } from '../utils/MathUtils.js';

// Layout for the live process tree. Same job as GraphLayout but tuned for hundreds of
// nodes and for a hierarchy whose shape comes from the data (ancestry) rather than a
// fixed set of branches: each node is drawn toward the ring for its depth and the
// angular sector its subtree owns, while charge/collide keep siblings from stacking.
// Ring radius per depth, with diminishing spacing. Windows process chains run deep
// (services.exe -> svchost.exe -> ... can reach 12+ levels), so linear spacing would
// fling the tips a thousand-plus pixels out. This asymptotes just under 500px: the
// shape of the hierarchy still reads, but the whole tree stays framable.
export function ringRadius(depth) {
  return 110 + 380 * (1 - Math.exp(-(Math.max(1, depth) - 1) / 3.2));
}

function radialTreeForce(config) {
  let nodes = [];

  function force(alpha) {
    const spread = lerp(0.85, 1.25, clamp((config.graphDensity ?? 1) / 1.8));
    for (const node of nodes) {
      if (node.type === 'root') continue;
      const depth = node.depth ?? 1;
      const radius = ringRadius(depth) * spread;
      const angle = node.targetAngle ?? 0;
      const targetX = Math.cos(angle) * radius;
      const targetY = Math.sin(angle) * radius;
      // Shallow nodes hold their ring tightly (they define the shape); deep leaves are
      // looser so they can billow outward like foliage.
      const strength = depth <= 1 ? 0.09 : 0.055;
      node.vx += (targetX - node.x) * strength * alpha;
      node.vy += (targetY - node.y) * strength * alpha;
    }
  }

  force.initialize = (nextNodes) => {
    nodes = nextNodes;
  };

  return force;
}

export class ProcessTreeLayout {
  constructor(model, activityState, config) {
    this.model = model;
    this.activityState = activityState;
    this.config = config;
    this.pointer = {
      x: 0, y: 0, active: false, mode: 'focus',
      strength: 0, radius: 240, focusStrength: 0, focusRadius: 150
    };
    this.createSimulation();
  }

  setPointer(x, y, active, mode, strength, radius) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = active;
    this.pointer.mode = mode;
    this.pointer.strength = strength;
    this.pointer.radius = radius;
  }

  makePointerForce() {
    const layout = this;
    let nodes = [];
    function force(alpha) {
      const p = layout.pointer;
      if (!p.active || (p.mode !== 'attract' && p.mode !== 'repel') || p.strength <= 0) return;
      const radius2 = p.radius * p.radius;
      const sign = p.mode === 'repel' ? -1 : 1;
      for (const node of nodes) {
        if (node.type === 'root') continue;
        const dx = p.x - node.x;
        const dy = p.y - node.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > radius2 || dist2 < 1) continue;
        const dist = Math.sqrt(dist2);
        const f = (sign * p.strength * (1 - dist / p.radius) * alpha) / dist;
        node.vx += dx * f;
        node.vy += dy * f;
      }
    }
    force.initialize = (nextNodes) => {
      nodes = nextNodes;
    };
    return force;
  }

  makeFocusForce() {
    const layout = this;
    let nodes = [];
    function force(alpha) {
      const p = layout.pointer;
      if (!p.active || p.mode !== 'focus' || p.focusStrength <= 0) return;
      const focused = layout.model?.focusedId
        ? layout.model.nodeById.get(layout.model.focusedId)
        : null;
      if (!focused) return;
      const radius2 = p.focusRadius * p.focusRadius;
      for (const node of nodes) {
        if (node === focused || node.type === 'root') continue;
        const dx = node.x - focused.x;
        const dy = node.y - focused.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > radius2 || dist2 < 1) continue;
        const dist = Math.sqrt(dist2);
        const f = (p.focusStrength * (1 - dist / p.focusRadius) * alpha) / dist;
        node.vx += dx * f;
        node.vy += dy * f;
      }
    }
    force.initialize = (nextNodes) => {
      nodes = nextNodes;
    };
    return force;
  }

  createSimulation() {
    this.simulation = forceSimulation(this.model.nodes)
      .force(
        'link',
        forceLink(this.model.links)
          .id((node) => node.id)
          .distance((link) => link.distance)
          .strength((link) => link.strength)
      )
      // Weaker per-node repulsion than the resource graph: with a few hundred nodes the
      // summed charge would otherwise blow the tree apart.
      .force('charge', forceManyBody().strength((node) => (node.type === 'root' ? -420 : -46)))
      .force(
        'collide',
        forceCollide((node) => (node.targetRadius ?? 4) + 7).strength(0.8).iterations(1)
      )
      .force('radialTree', radialTreeForce(this.config))
      .force('pointer', this.makePointerForce())
      .force('focus', this.makeFocusForce())
      .alphaDecay(0.03)
      .velocityDecay(0.42)
      .stop();
  }

  reset(model, activityState, config) {
    this.model = model;
    this.activityState = activityState;
    this.config = config;
    this.createSimulation();
    this.simulation.alpha(0.9);
    this.step(30);
  }

  // Processes come and go constantly, so re-bind rather than rebuild: survivors keep
  // their positions and only a gentle re-heat is applied.
  syncTopology(model) {
    this.model = model;
    this.simulation.nodes(model.nodes);
    this.simulation.force('link').links(model.links);
    this.simulation.alpha(Math.max(this.simulation.alpha(), 0.3));
    this.step(4);
  }

  updateForces() {
    this.simulation.force('collide').radius((node) => (node.targetRadius ?? 4) + 7);
  }

  step(iterations = 1) {
    this.updateForces();
    const activity = this.activityState.value('overallLoad');
    const pointerBoost = this.pointer.active && this.pointer.mode !== 'off' ? 0.1 : 0;
    this.simulation.alphaTarget(lerp(0.035, 0.11, activity) + pointerBoost);
    this.simulation.tick(iterations);
  }
}
