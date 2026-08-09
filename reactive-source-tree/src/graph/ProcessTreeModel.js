import { clamp, lerp } from '../utils/MathUtils.js';
import { ringRadius } from './ProcessTreeLayout.js';

// A Gource-style live process tree: the hierarchy IS the parent/child ancestry of the
// running processes (like Gource's directory tree), and the "commits" are processes
// starting and exiting. A spawned process blooms in and fires a beam from its parent;
// an exited process fades out. Watching it for a while shows the machine's actual
// activity over time — what launched what, and when.
//
// Exposes the same surface as GraphModel so GraphRenderer / the particle systems /
// LabelRenderer / HoverController / CameraController all work unchanged.

const COLOR_KEYS = ['cpu', 'ram', 'gpu', 'disk', 'network', 'audio'];

// Stable colour per process NAME (not pid), so every chrome.exe shares a colour the way
// Gource colours files by extension — families read as one organism.
function colorKeyForName(name) {
  let hash = 0;
  const text = String(name || '?').toLowerCase();
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return COLOR_KEYS[hash % COLOR_KEYS.length];
}

function seeded(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function formatPercent(value) {
  const percent = clamp(value) * 100;
  if (percent > 0 && percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

const SPAWN_GLOW_SECONDS = 25; // how long a freshly spawned process stays "hot"

export class ProcessTreeModel {
  constructor(config, palette) {
    this.config = config;
    this.palette = palette;
    this.nodes = [];
    this.links = [];
    this.nodeById = new Map();
    this.categoryNodes = new Map();
    this.dynamicNodeIds = new Set();
    this.dyingNodes = [];
    this.beamEvents = [];
    // Queued {x, y, color} for PulseSystem: a process exiting gets a collapsing ring, so
    // deaths read as events the way spawns do (beam + bloom) instead of quietly fading.
    this.deathEvents = [];
    this.now = 0;
    this.focusedId = null;
    this.draggedId = null;
    // This tree's size depends on how deep the machine's ancestry happens to run, so it
    // opts into the camera's shrink-to-fit; the fixed resource constellation does not.
    this.autoFit = true;
    // Lifecycle bookkeeping
    this.knownPids = new Set();   // pids seen in the previous snapshot
    this.spawnTimes = new Map();  // pid -> scene time when we first saw it
    this.seededOnce = false;      // first snapshot shouldn't look like a mass spawn
    this.signature = '';
    this.events = [];             // recent spawn/exit events (for the HUD feed)
    this.build();
  }

  // No synthetic core node: this view is about the processes themselves, so the
  // top-level processes ARE the roots and the centre stays open. The radial force
  // keeps the constellation centred without anything pinned at the origin.
  build() {
    this.nodes = [];
    this.links = [];
    this.nodeById.clear();
    this.dynamicNodeIds.clear();
    this.dyingNodes = [];
    this.beamEvents = [];
    this.signature = '';
  }

  addNode(node) {
    const prepared = {
      activity: 0,
      value: 0,
      caption: '',
      captionDetail: '',
      visibleFactor: 1,
      targetRadius: node.radius,
      renderX: node.x ?? 0,
      renderY: node.y ?? 0,
      renderRadius: node.radius,
      phase: seeded(this.nodes.length + 1) * Math.PI * 2,
      ...node
    };
    this.nodes.push(prepared);
    this.nodeById.set(prepared.id, prepared);
    return prepared;
  }

  addLink(source, target, category, strength, distance) {
    const link = {
      id: `${source.id}->${target.id}`,
      source,
      target,
      category,
      strength,
      distance,
      secondary: false,
      dynamic: true,
      activity: 0,
      color: this.palette.get(category),
      phase: seeded(this.links.length + 50) * Math.PI * 2
    };
    this.links.push(link);
    return link;
  }

  // Choose which processes to display when there are more than the budget. Keeps the
  // tree connected: anything selected drags its ancestors in, since a child cannot be
  // drawn without the chain that spawned it.
  selectVisible(records, byPid, limit) {
    const childCount = new Map();
    for (const record of records) {
      childCount.set(record.ppid, (childCount.get(record.ppid) ?? 0) + 1);
    }

    const scored = records.map((record) => {
      const age = this.spawnTimes.has(record.pid) ? this.now - this.spawnTimes.get(record.pid) : 999;
      const freshness = age < SPAWN_GLOW_SECONDS ? 1 - age / SPAWN_GLOW_SECONDS : 0;
      const kids = childCount.get(record.pid) ?? 0;
      return {
        record,
        score:
          record.cpu * 2.4 +
          record.mem * 0.9 +
          freshness * 3 +          // just-spawned processes always earn a slot
          Math.min(kids, 8) * 0.22 // parents keep the tree's shape readable
      };
    });
    scored.sort((a, b) => b.score - a.score);

    const keep = new Set();
    for (const item of scored) {
      if (keep.size >= limit) break;
      keep.add(item.record.pid);
    }
    // Pull in ancestors so every kept node has an unbroken path to the root.
    for (const pid of [...keep]) {
      let cursor = byPid.get(pid);
      let guard = 0;
      while (cursor && guard < 64) {
        const parent = byPid.get(cursor.ppid);
        if (!parent || keep.has(parent.pid)) break;
        keep.add(parent.pid);
        cursor = parent;
        guard += 1;
      }
    }
    return keep;
  }

  // Fan the tree out radially: every subtree owns an angular sector sized by how many
  // descendants it has, so siblings spread and families stay together (Gource's look).
  // Pure computation returning angle/depth per pid — it runs BEFORE the nodes are built
  // so a newly spawned process can be placed correctly the moment it is created.
  computeAngles(rootsList, childrenOf, sizeOf) {
    const angleByPid = new Map();
    const depthByPid = new Map();

    const assign = (pid, start, end, depth) => {
      angleByPid.set(pid, (start + end) / 2);
      depthByPid.set(pid, depth);
      const kids = childrenOf.get(pid);
      if (!kids || !kids.length) return;
      const total = kids.reduce((sum, kid) => sum + sizeOf.get(kid), 0) || 1;
      let cursor = start;
      for (const kid of kids) {
        const share = (end - start) * (sizeOf.get(kid) / total);
        assign(kid, cursor, cursor + share, depth + 1);
        cursor += share;
      }
    };

    const total = rootsList.reduce((sum, pid) => sum + sizeOf.get(pid), 0) || 1;
    let cursor = -Math.PI;
    for (const pid of rootsList) {
      const share = Math.PI * 2 * (sizeOf.get(pid) / total);
      assign(pid, cursor, cursor + share, 1);
      cursor += share;
    }
    return { angleByPid, depthByPid };
  }

  syncTelemetry(liveTree, config, palette) {
    const tree = Array.isArray(liveTree?.tree) ? liveTree.tree : null;
    if (!config.enableTelemetry || !tree || !tree.length) {
      // Without the helper there is no ancestry data at all, so there is nothing to draw.
      if (this.nodes.length > 0) {
        this.build();
        return true;
      }
      return false;
    }

    this.palette = palette;
    const byPid = new Map();
    for (const record of tree) {
      if (record && Number.isFinite(record.pid)) byPid.set(record.pid, record);
    }

    // --- lifecycle: diff against the previous snapshot -------------------------------
    const livePids = new Set(byPid.keys());
    const spawned = [];
    if (this.seededOnce) {
      for (const pid of livePids) {
        if (!this.knownPids.has(pid)) spawned.push(pid);
      }
    }
    for (const pid of livePids) {
      if (!this.spawnTimes.has(pid)) {
        this.spawnTimes.set(pid, this.seededOnce ? this.now : this.now - SPAWN_GLOW_SECONDS);
      }
    }
    for (const pid of this.knownPids) {
      if (!livePids.has(pid)) {
        this.spawnTimes.delete(pid);
        const record = this.lastRecords?.get(pid);
        if (record) this.pushEvent('exit', record.name, pid);
      }
    }
    for (const pid of spawned) {
      this.pushEvent('spawn', byPid.get(pid)?.name, pid);
    }
    this.knownPids = livePids;
    this.lastRecords = byPid;
    this.seededOnce = true;

    // --- selection + hierarchy -------------------------------------------------------
    const budget = Math.max(20, Math.round(config.maxTreeNodes ?? 220));
    const keep = byPid.size > budget ? this.selectVisible(tree, byPid, budget) : livePids;

    const childrenOf = new Map();
    const rootsList = [];
    for (const pid of keep) {
      const record = byPid.get(pid);
      if (!record) continue;
      const parent = byPid.get(record.ppid);
      if (!parent || !keep.has(parent.pid) || parent.pid === pid) {
        rootsList.push(pid);
      } else {
        if (!childrenOf.has(parent.pid)) childrenOf.set(parent.pid, []);
        childrenOf.get(parent.pid).push(pid);
      }
    }
    // Deterministic ordering keeps a process in the same sector between refreshes.
    rootsList.sort((a, b) => a - b);
    for (const kids of childrenOf.values()) kids.sort((a, b) => a - b);

    // Subtree sizes drive each sector's angular share.
    const sizeOf = new Map();
    const measure = (pid, guard = 0) => {
      if (sizeOf.has(pid)) return sizeOf.get(pid);
      if (guard > 64) return 1;
      const kids = childrenOf.get(pid) ?? [];
      let size = 1;
      for (const kid of kids) size += measure(kid, guard + 1);
      sizeOf.set(pid, size);
      return size;
    };
    for (const pid of keep) measure(pid);

    const signature = `${[...keep].sort((a, b) => a - b).join(',')}`;
    if (signature === this.signature) {
      // Same topology: just refresh the live metrics on existing nodes.
      for (const pid of keep) {
        const node = this.nodeById.get(`proc:${pid}`);
        const record = byPid.get(pid);
        if (node && record) {
          node.cpuValue = record.cpu;
          node.memValue = record.mem;
        }
      }
      return false;
    }

    // --- rebuild the node/link graph, preserving survivors ---------------------------
    const previous = new Map();
    for (const id of this.dynamicNodeIds) {
      const node = this.nodeById.get(id);
      if (node) previous.set(id, node);
    }

    this.nodes = [];
    this.links = [];
    this.nodeById.clear();
    this.dynamicNodeIds.clear();

    // Angles/depths up front so a brand-new node knows where it belongs immediately.
    const { angleByPid, depthByPid } = this.computeAngles(rootsList, childrenOf, sizeOf);

    const created = [];
    const addProcess = (pid, depth, guard = 0) => {
      if (guard > 64) return null;
      const record = byPid.get(pid);
      if (!record) return null;
      const id = `proc:${pid}`;
      const colorKey = colorKeyForName(record.name);
      const old = previous.get(id);
      const angle = angleByPid.get(pid) ?? old?.targetAngle ?? 0;
      const radius = ringRadius(depth);
      // Where a node starts life: survivors keep their spot; a NEWLY spawned process is
      // born right on top of the parent that launched it and is then pushed out to its
      // ring by the layout — so it visibly emerges from its parent (and the spawn beam
      // stays short instead of streaking across the screen).
      const parentNode = this.nodeById.get(`proc:${record.ppid}`);
      const birthX = old ? old.x : parentNode ? parentNode.x + (Math.random() - 0.5) * 16 : Math.cos(angle) * radius;
      const birthY = old ? old.y : parentNode ? parentNode.y + (Math.random() - 0.5) * 16 : Math.sin(angle) * radius;
      const node = this.addNode({
        id,
        label: record.name,
        type: 'live',
        liveKind: 'process',
        category: colorKey,
        colorKey,
        pid,
        ppid: record.ppid,
        depth,
        targetAngle: angle,
        radius: 5,
        color: palette.get(colorKey),
        cpuValue: record.cpu,
        memValue: record.mem,
        x: birthX,
        y: birthY,
        labelable: false
      });
      if (old) {
        node.renderX = old.renderX;
        node.renderY = old.renderY;
        node.renderRadius = old.renderRadius;
        node.birthTime = old.birthTime;
        node.flare = old.flare ?? 0;
      } else {
        // Start the render position at the birth point too, otherwise the interpolator
        // would ease it in from (0,0) and draw a streak across the scene.
        node.renderX = birthX;
        node.renderY = birthY;
        node.birthTime = this.now;
      }
      this.dynamicNodeIds.add(id);
      created.push(node);
      const kids = childrenOf.get(pid) ?? [];
      for (const kid of kids) addProcess(kid, depth + 1, guard + 1);
      return node;
    };

    for (const pid of rootsList) addProcess(pid, 1);

    // Link each node to the process that spawned it. Top-level processes have no parent
    // in view and simply stand on their own — there is no core to tie them to.
    for (const node of created) {
      const parent = this.nodeById.get(`proc:${node.ppid}`);
      if (!parent) continue;
      this.addLink(parent, node, node.colorKey, 0.62, 74);
    }

    // Depths from the sector walk override the recursion depth for any node reached by a
    // different path, keeping ring placement consistent with the angle assignment.
    for (const node of created) {
      const depth = depthByPid.get(node.pid);
      if (depth !== undefined) node.depth = depth;
    }

    // Newly spawned processes: bloom + a beam travelling out from the parent that
    // launched them, so you SEE what called what.
    for (const pid of spawned) {
      const node = this.nodeById.get(`proc:${pid}`);
      if (!node) continue;
      const parent = this.nodeById.get(`proc:${node.ppid}`);
      if (parent && this.beamEvents.length < 24) {
        this.beamEvents.push({ sourceId: parent.id, targetId: node.id, color: node.color });
      }
    }

    // Nodes that vanished this refresh fade out instead of popping, and mark the spot
    // with a ring so an exit is as visible as an arrival.
    for (const [id, old] of previous) {
      if (!this.nodeById.has(id)) {
        old.dying = true;
        old.deathTime = this.now;
        this.dyingNodes.push(old);
        if (this.deathEvents.length < 16) {
          this.deathEvents.push({ x: old.renderX, y: old.renderY, color: old.color });
        }
      }
    }

    this.signature = signature;
    return true;
  }

  pushEvent(kind, name, pid) {
    this.events.push({ kind, name: name || '?', pid, time: this.now });
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }

  updateActivities(activityState, palette, dt = 0.016) {
    const overall = activityState.value('overallLoad');
    const bass = activityState.value('audioBass');
    const cpuSignal = activityState.value('cpu');
    const flareDecay = Math.exp(-dt / 0.8);
    this.captionTimer = (this.captionTimer ?? 0) - dt;
    const refreshCaptions = this.captionTimer <= 0;
    if (refreshCaptions) this.captionTimer = 0.22;

    // Label budget: only the nodes worth naming get a Text object, otherwise 200+
    // labels would be both unreadable and expensive to rasterize.
    const labelCandidates = [];

    for (const node of this.nodes) {
      const cpu = clamp(node.cpuValue ?? 0);
      const mem = clamp(node.memValue ?? 0);
      const load = clamp(cpu * 0.75 + mem * 0.45);
      const age = this.now - (this.spawnTimes.get(node.pid) ?? -999);
      const freshness = age >= 0 && age < SPAWN_GLOW_SECONDS ? 1 - age / SPAWN_GLOW_SECONDS : 0;

      node.value = load;
      node.visualValue = clamp(Math.sqrt(load));
      node.heat = load;
      node.activity = clamp(load * 0.9 + freshness * 0.5);
      node.freshness = freshness;

      // Usage jumps flare the node (Gource's "light up when touched").
      const rise = load - (node.lastValue ?? load);
      if (rise > 0.03) node.flare = clamp((node.flare ?? 0) + rise * 3);
      node.flare = (node.flare ?? 0) * flareDecay;
      node.lastValue = load;

      node.color = palette.category(node.colorKey, node.activity);
      // Deeper nodes are smaller — the tree tapers outward like Gource's file leaves.
      const depthTaper = Math.max(0.55, 1 - (node.depth - 1) * 0.12);
      node.targetRadius = lerp(3.4, 15, node.visualValue) * depthTaper + freshness * 2.4;
      node.glowBoost = 1.05 + freshness * 0.9;
      node.visibleFactor = clamp(0.45 + node.activity * 1.1 + freshness * 0.6);

      if (refreshCaptions) {
        node.caption = node.label;
        node.captionDetail = `CPU ${formatPercent(cpu)} | RAM ${formatPercent(mem)}`;
      }

      node.labelable = false;
      labelCandidates.push(node);
    }

    // Name the most interesting processes: freshly spawned first, then the busiest.
    const maxLabels = this.config?.lowPerformanceMode ? 12 : 26;
    labelCandidates.sort(
      (a, b) => (b.freshness * 2 + b.value) - (a.freshness * 2 + a.value)
    );
    for (let i = 0; i < Math.min(maxLabels, labelCandidates.length); i += 1) {
      labelCandidates[i].labelable = true;
    }

    for (const link of this.links) {
      const sourceActivity = link.source.activity ?? 0;
      const targetActivity = link.target.activity ?? 0;
      link.activity = clamp(Math.max(sourceActivity, targetActivity));
      link.color = palette.category(link.category, link.activity);
    }
  }

  // Particle/pulse systems ask for a representative node per colour family; give them
  // the busiest process of that colour so emissions still come from meaningful places.
  getCategoryNode(category) {
    let best = null;
    for (const id of this.dynamicNodeIds) {
      const node = this.nodeById.get(id);
      if (!node || node.colorKey !== category) continue;
      if (!best || (node.activity ?? 0) > (best.activity ?? 0)) best = node;
    }
    return best;
  }

  getOuterNodes() {
    return this.nodes.filter((node) => node.type === 'live' && node.visibleFactor > 0.2);
  }

  maybeRebuild(config, palette) {
    this.config = config;
    const paletteChanged = palette.mode !== this.palette.mode;
    this.palette = palette;
    if (paletteChanged) {
      this.signature = ''; // force a colour refresh on the next telemetry sync
    }
    return false;
  }
}
