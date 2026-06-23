import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY
} from 'd3-force';
import { SIMULATION } from '../config.js';
import { clamp, lerp } from '../utils/MathUtils.js';

function radialClusterForce(activityState, config) {
  let nodes = [];

  function force(alpha) {
    const ramExpansion = 1 + activityState.value('ram') * 0.34;
    const loadExpansion = 1 + activityState.value('overallLoad') * 0.12;
    const densityScale = lerp(0.9, 1.18, clamp(config.graphDensity / 1.8));
    const scale = ramExpansion * loadExpansion * densityScale;

    for (const node of nodes) {
      if (node.type === 'root') continue;

      const angle = node.angle ?? 0;
      const categoryRadius = 170 * scale;
      const leafBaseRadius = 306 * scale;
      let targetX;
      let targetY;
      let strength;

      if (node.type === 'category') {
        targetX = Math.cos(angle) * categoryRadius;
        targetY = Math.sin(angle) * categoryRadius;
        strength = 0.055;
      } else {
        const categorySpread = 54 + node.leafIndex * 7.5;
        const radius = leafBaseRadius + (node.leafIndex % 5) * 24 + categorySpread * 0.24;
        const arc = angle + Math.sin(node.phase + node.leafIndex) * 0.08;
        targetX = Math.cos(arc) * radius;
        targetY = Math.sin(arc) * radius;
        strength = 0.018;
      }

      node.vx += (targetX - node.x) * strength * alpha;
      node.vy += (targetY - node.y) * strength * alpha;
    }
  }

  force.initialize = (nextNodes) => {
    nodes = nextNodes;
  };

  return force;
}

export class GraphLayout {
  constructor(model, activityState, config) {
    this.model = model;
    this.activityState = activityState;
    this.config = config;
    // Mouse interaction: nodes within radius are attracted to / repelled from the cursor
    // (attract/repel modes), or pushed away from the focused node (focus mode). Updated
    // each frame from main via setPointer().
    this.pointer = { x: 0, y: 0, active: false, mode: 'focus', strength: 0, radius: 240, focusStrength: 0, focusRadius: 150 };
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
        const falloff = 1 - dist / p.radius;
        const f = (sign * p.strength * falloff * alpha) / dist;
        node.vx += dx * f;
        node.vy += dy * f;
      }
    }
    force.initialize = (nextNodes) => {
      nodes = nextNodes;
    };
    return force;
  }

  // Focus mode: push every other node away from the focused node so it can be singled out
  // and read. The focused node is pinned (by HoverController) so it holds still.
  makeFocusForce() {
    const layout = this;
    let nodes = [];
    function force(alpha) {
      const p = layout.pointer;
      if (!p.active || p.mode !== 'focus' || p.focusStrength <= 0) return;
      const focused = layout.model && layout.model.focusedId
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
        const falloff = 1 - dist / p.focusRadius;
        const f = (p.focusStrength * falloff * alpha) / dist;
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
          .distance((link) => this.linkDistance(link))
          .strength((link) => link.strength)
      )
      .force(
        'charge',
        forceManyBody().strength((node) => {
          if (node.type === 'root') return SIMULATION.repulsion * 1.55;
          if (node.type === 'category') return SIMULATION.repulsion * 1.1;
          return SIMULATION.repulsion * 0.36;
        })
      )
      .force(
        'collide',
        forceCollide((node) => node.targetRadius + SIMULATION.collidePadding)
          .strength(0.85)
          .iterations(2)
      )
      .force('x', forceX(0).strength((node) => (node.type === 'root' ? 0.2 : 0.006)))
      .force('y', forceY(0).strength((node) => (node.type === 'root' ? 0.2 : 0.006)))
      .force('radialCluster', radialClusterForce(this.activityState, this.config))
      .force('pointer', this.makePointerForce())
      .force('focus', this.makeFocusForce())
      .alphaDecay(SIMULATION.alphaDecay)
      .velocityDecay(SIMULATION.velocityDecay)
      .stop();
  }

  reset(model, activityState, config) {
    this.model = model;
    this.activityState = activityState;
    this.config = config;
    this.createSimulation();
    this.simulation.alpha(0.85);
    this.step(40);
  }

  // Incremental update for live process/drive nodes appearing or disappearing.
  // Re-binds the existing simulation to the new node/link arrays (preserving the
  // positions of nodes that stayed) and gives only a gentle re-heat, so the whole
  // constellation no longer lurches every time the top-process set changes.
  syncTopology(model) {
    this.model = model;
    this.simulation.nodes(model.nodes);
    this.simulation.force('link').links(model.links);
    this.simulation.alpha(Math.max(this.simulation.alpha(), 0.32));
    this.step(6);
  }

  linkDistance(link) {
    const ramExpansion = 1 + this.activityState.value('ram') * 0.35;
    const loadExpansion = 1 + this.activityState.value('overallLoad') * 0.12;
    const densityCompression = lerp(1.06, 0.82, clamp((this.config.graphDensity - 0.4) / 1.4));
    return link.distance * ramExpansion * loadExpansion * densityCompression;
  }

  updateForces() {
    const link = this.simulation.force('link');
    link.distance((item) => this.linkDistance(item));

    const collide = this.simulation.force('collide');
    collide.radius((node) => node.targetRadius + SIMULATION.collidePadding);
  }

  step(iterations = 1) {
    this.updateForces();
    const activity = this.activityState.value('overallLoad');
    const pointerBoost = this.pointer.active && this.pointer.mode !== 'off' ? 0.12 : 0;
    this.simulation.alphaTarget(lerp(0.04, 0.13, activity) + pointerBoost);
    this.simulation.tick(iterations);
  }
}
