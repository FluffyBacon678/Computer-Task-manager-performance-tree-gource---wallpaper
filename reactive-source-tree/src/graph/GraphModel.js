import { CATEGORY_DEFINITIONS, DEFAULT_NODE_COUNTS } from '../config.js';
import { clamp, hexToNumber, lerp } from '../utils/MathUtils.js';

const categoryActivityKeys = {
  cpu: (activity) => activity.value('cpu'),
  ram: (activity) => activity.value('ram'),
  gpu: (activity) => activity.value('gpu'),
  disk: (activity) => activity.value('disk'),
  network: (activity) => Math.max(activity.value('netDown'), activity.value('netUp')),
  audio: (activity) => activity.value('audioVolume')
};

function seeded(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function makeLeafLabel(categoryId, index) {
  const prefix = {
    cpu: 'worker',
    ram: 'page',
    gpu: 'kernel',
    disk: 'block',
    network: 'route',
    audio: 'band'
  }[categoryId];
  return `${prefix}_${String(index + 1).padStart(2, '0')}`;
}

function safeId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'item';
}

function formatPercent(value) {
  const percent = clamp(value) * 100;
  if (percent > 0 && percent < 1) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

function metricLabel(metric) {
  const labels = {
    cpu: 'CPU',
    ram: 'RAM',
    gpu: 'GPU',
    disk: 'DISK',
    netDown: 'DOWN',
    netUp: 'UP',
    network: 'NET',
    audioBass: 'BASS',
    audioMid: 'MID',
    audioTreble: 'TREBLE',
    audioVolume: 'VOL',
    audio: 'AUDIO',
    temperature: 'TEMP',
    used: 'USED',
    free: 'FREE',
    activity: 'ACTIVE'
  };
  return labels[metric] ?? String(metric).toUpperCase();
}

function metricValue(activityState, metric, fallback = 0) {
  if (metric === 'network') {
    return Math.max(activityState.value('netDown'), activityState.value('netUp'));
  }
  if (metric === 'audio') {
    return activityState.value('audioVolume');
  }
  if (metric === 'core') {
    return activityState.value('overallLoad');
  }

  const value = activityState.value(metric);
  return value || fallback;
}

function processLabel(process, index, metric, config) {
  if (config.showProcessNames && process.name) {
    return process.name.length > 24 ? `${process.name.slice(0, 21)}...` : process.name;
  }

  return `${metric}_proc_${String(index + 1).padStart(2, '0')}`;
}

function processCaptionDetail(process, primaryMetric) {
  const metrics = [
    ['cpu', 'CPU', process.cpu],
    ['ram', 'RAM', process.ram],
    ['gpu', 'GPU', process.gpu],
    ['disk', 'DISK', process.disk]
  ];
  const primary = metrics.find(([key]) => key === primaryMetric);
  const secondary = metrics
    .filter(([key, , value]) => key !== primaryMetric && value > 0.001)
    .sort((a, b) => b[2] - a[2])
    .slice(0, 3);

  const resourceText = [primary, ...secondary]
    .filter(Boolean)
    .map(([, label, value]) => `${label} ${formatPercent(value)}`)
    .join(' | ');
  const threadText = Number.isFinite(process.threads) && process.threads > 0
    ? ` | TH ${process.threads}`
    : '';

  return `${resourceText}${threadText}`;
}

function leafMetric(node) {
  if (node.category === 'network') {
    if (node.label === 'download') return 'netDown';
    if (node.label === 'upload') return 'netUp';
  }

  if (node.category === 'audio') {
    if (node.label === 'bass') return 'audioBass';
    if (node.label === 'mid') return 'audioMid';
    if (node.label === 'treble') return 'audioTreble';
    if (node.label === 'volume') return 'audioVolume';
  }

  if (node.category === 'gpu' && node.label === 'temperature') return 'temperature';
  return node.category;
}

export class GraphModel {
  constructor(config, palette) {
    this.config = config;
    this.palette = palette;
    this.nodes = [];
    this.links = [];
    this.nodeById = new Map();
    this.categoryNodes = new Map();
    this.leavesByCategory = new Map();
    this.dynamicNodeIds = new Set();
    this.dynamicSignature = '';
    this.lastDensity = 0;
    // Stable angular slot per process (metricKey -> Map<pid, slotIndex>) so a process
    // keeps its position between frames instead of jumping as rankings shift.
    this.processSlotState = new Map();
    this.build(config, palette);
  }

  build(config, palette) {
    this.config = config;
    this.palette = palette;
    this.nodes = [];
    this.links = [];
    this.nodeById.clear();
    this.categoryNodes.clear();
    this.leavesByCategory.clear();
    this.dynamicNodeIds.clear();
    this.dynamicSignature = '';
    this.processSlotState.clear();
    this.lastDensity = config.graphDensity;

    const root = this.addNode({
      id: 'root',
      label: 'PC',
      type: 'root',
      category: 'core',
      radius: 22,
      color: palette.colors.core,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0
    });

    const targetLeaves = Math.round(
      clamp(52 * config.graphDensity, DEFAULT_NODE_COUNTS.minLeaves, DEFAULT_NODE_COUNTS.maxLeaves)
    );
    const baseTotal = CATEGORY_DEFINITIONS.reduce((sum, category) => sum + category.leaves.length, 0);
    let remainingLeaves = targetLeaves;

    CATEGORY_DEFINITIONS.forEach((definition, categoryIndex) => {
      const categoryColor = palette.get(definition.id);
      const angle = (definition.angle * Math.PI) / 180;
      const categoryNode = this.addNode({
        id: definition.id,
        label: definition.label,
        type: 'category',
        category: definition.id,
        radius: 12,
        color: categoryColor,
        angle,
        x: Math.cos(angle) * 190,
        y: Math.sin(angle) * 190
      });
      this.categoryNodes.set(definition.id, categoryNode);
      this.addLink(root, categoryNode, definition.id, 1, 148);

      const categoriesLeft = CATEGORY_DEFINITIONS.length - categoryIndex;
      const proportional = Math.round(targetLeaves * (definition.leaves.length / baseTotal));
      const leafCount = categoryIndex === CATEGORY_DEFINITIONS.length - 1
        ? remainingLeaves
        : clamp(proportional, 4, Math.max(4, remainingLeaves - (categoriesLeft - 1) * 4));
      remainingLeaves -= leafCount;

      const leaves = [];
      for (let i = 0; i < leafCount; i += 1) {
        const baseLabel = definition.leaves[i];
        const label = baseLabel ?? makeLeafLabel(definition.id, i - definition.leaves.length);
        const leafAngle = angle + (seeded(i + categoryIndex * 41) - 0.5) * 0.95;
        const leaf = this.addNode({
          id: `${definition.id}:${label}`,
          label,
          type: 'leaf',
          category: definition.id,
          radius: 4.4,
          color: categoryColor,
          angle: leafAngle,
          leafIndex: i,
          x: Math.cos(leafAngle) * (300 + seeded(i + 8) * 90),
          y: Math.sin(leafAngle) * (300 + seeded(i + 11) * 90)
        });
        leaves.push(leaf);
        this.addLink(categoryNode, leaf, definition.id, 0.72, 82);
      }

      for (let i = 1; i < leaves.length; i += 2) {
        this.addLink(leaves[i - 1], leaves[i], definition.id, 0.18, 58, true);
      }

      this.leavesByCategory.set(definition.id, leaves);
    });

    this.addCrossLinks();
  }

  addCrossLinks() {
    const allLeaves = [...this.leavesByCategory.values()].flat();
    const crossLinkCount = Math.min(DEFAULT_NODE_COUNTS.crossLinks, Math.floor(allLeaves.length * 0.34));
    for (let i = 0; i < crossLinkCount; i += 1) {
      const source = allLeaves[(i * 7 + 3) % allLeaves.length];
      const target = allLeaves[(i * 13 + 11) % allLeaves.length];
      if (!source || !target || source.category === target.category) continue;
      const category = i % 2 === 0 ? source.category : target.category;
      this.addLink(source, target, category, 0.04, 180, true);
    }
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
    prepared.color = hexToNumber(prepared.color);
    this.nodes.push(prepared);
    this.nodeById.set(prepared.id, prepared);
    return prepared;
  }

  addLink(source, target, category, strength = 1, distance = 100, secondary = false, dynamic = false) {
    const link = {
      id: `${source.id}->${target.id}:${this.links.length}`,
      source,
      target,
      category,
      strength,
      distance,
      secondary,
      dynamic,
      activity: 0,
      color: this.palette.get(category),
      phase: seeded(this.links.length + 50) * Math.PI * 2
    };
    this.links.push(link);
    return link;
  }

  clearDynamicNodes() {
    if (this.dynamicNodeIds.size === 0) return false;

    const isDynamicEndpoint = (link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source?.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target?.id;
      return this.dynamicNodeIds.has(sourceId) || this.dynamicNodeIds.has(targetId);
    };

    for (const id of this.dynamicNodeIds) {
      this.nodeById.delete(id);
    }

    this.nodes = this.nodes.filter((node) => !this.dynamicNodeIds.has(node.id));
    this.links = this.links.filter((link) => !link.dynamic && !isDynamicEndpoint(link));

    for (const [category, leaves] of this.leavesByCategory.entries()) {
      this.leavesByCategory.set(
        category,
        leaves.filter((node) => !this.dynamicNodeIds.has(node.id))
      );
    }

    this.dynamicNodeIds.clear();
    this.dynamicSignature = '';
    return true;
  }

  // Pick which processes to show for a branch with hysteresis + stable angular slots.
  // A process keeps its slot frame-to-frame, and only leaves once it drops out of a
  // grace band below the cut-off, so the live nodes stop flickering in and out.
  selectProcesses(processes, metric, limit, threshold) {
    const sorted = processes
      .filter((process) => process && process[metric] > threshold)
      .sort((a, b) => b[metric] - a[metric]);

    const rankByPid = new Map();
    sorted.forEach((process, rank) => rankByPid.set(process.pid, rank));

    const slotMap = this.processSlotState.get(metric) ?? new Map();
    const keepBand = limit + 4; // a member survives until it falls below this rank

    const retained = [];
    const usedSlots = new Set();
    const retainedPids = new Set();
    for (const [pid, slot] of slotMap) {
      const rank = rankByPid.get(pid);
      if (rank !== undefined && rank < keepBand && slot < limit) {
        retained.push({ process: sorted[rank], slot });
        usedSlots.add(slot);
        retainedPids.add(pid);
      }
    }

    const freeSlots = [];
    for (let slot = 0; slot < limit; slot += 1) {
      if (!usedSlots.has(slot)) freeSlots.push(slot);
    }

    const added = [];
    let next = 0;
    for (const process of sorted) {
      if (next >= freeSlots.length) break;
      if (retainedPids.has(process.pid)) continue;
      added.push({ process, slot: freeSlots[next] });
      next += 1;
    }

    const result = [...retained, ...added];
    this.processSlotState.set(metric, new Map(result.map(({ process, slot }) => [process.pid, slot])));
    return result;
  }

  buildDynamicItems(liveTree, config) {
    const items = [];
    const processes = Array.isArray(liveTree?.processes) ? liveTree.processes : [];
    const drives = Array.isArray(liveTree?.drives) ? liveTree.drives : [];
    const baseCount = config.liveProcessCount > 0
      ? config.liveProcessCount
      : Math.round(clamp(7 + config.graphDensity * 4, 6, 14));
    const processLimit = config.lowPerformanceMode ? Math.min(5, baseCount) : baseCount;
    const driveLimit = config.lowPerformanceMode ? 2 : 4;

    // One descriptor per branch; GPU can be toggled off from Wallpaper Engine.
    const metricBranches = [
      { metric: 'cpu', threshold: 0.00025, baseAngle: -0.42, step: 0.055, baseRank: 90 },
      { metric: 'ram', threshold: 0.00025, baseAngle: -0.34, step: 0.055, baseRank: 110 },
      { metric: 'gpu', threshold: 0.001, baseAngle: -0.32, step: 0.06, baseRank: 120, enabled: config.enableProcessGpu !== false },
      { metric: 'disk', threshold: 0.001, baseAngle: 0.04, step: 0.06, baseRank: 125 }
    ];

    for (const branch of metricBranches) {
      if (branch.enabled === false) continue;
      const selected = this.selectProcesses(processes, branch.metric, processLimit, branch.threshold);
      for (const { process, slot } of selected) {
        items.push({
          id: `live:${branch.metric}:${process.pid}`,
          parentId: branch.metric,
          label: processLabel(process, slot, branch.metric, config),
          category: branch.metric,
          kind: 'process',
          metric: branch.metric,
          value: process[branch.metric],
          stats: process,
          rank: branch.baseRank + slot,
          angleOffset: branch.baseAngle + slot * branch.step,
          distance: 112
        });
      }
    }

    drives.slice(0, driveLimit).forEach((drive, index) => {
      const driveKey = safeId(drive.name);
      const driveNodeId = `live:drive:${driveKey}`;
      const driveRank = 130 + index * 6;
      items.push({
        id: driveNodeId,
        parentId: 'disk',
        label: drive.name,
        category: 'disk',
        kind: 'drive',
        metric: 'used',
        value: drive.used,
        rank: driveRank,
        angleOffset: -0.28 + index * 0.18,
        distance: 106
      });

      [
        ['used', drive.used],
        ['free', 1 - drive.used],
        ['activity', drive.activity]
      ].forEach(([metric, value], metricIndex) => {
        items.push({
          id: `live:drive:${driveKey}:${metric}`,
          parentId: driveNodeId,
          label: metric,
          category: 'disk',
          kind: 'driveMetric',
          metric,
          value,
          rank: driveRank + metricIndex + 1,
          angleOffset: -0.18 + metricIndex * 0.18,
          distance: 54
        });
      });
    });

    return items;
  }

  syncTelemetry(liveTree, config, palette) {
    if (!config.enableTelemetry || !config.enableLiveProcesses || !liveTree?.updatedAt) {
      return this.clearDynamicNodes();
    }

    const items = this.buildDynamicItems(liveTree, config);
    const topologySignature = JSON.stringify(
      items
        .map((item) => [item.id, item.parentId, item.kind])
        .sort((a, b) => a.join('|').localeCompare(b.join('|')))
    );

    if (topologySignature !== this.dynamicSignature) {
      this.clearDynamicNodes();

      for (const item of items) {
        const parent = this.nodeById.get(item.parentId);
        if (!parent) continue;

        const angle = (parent.angle ?? 0) + item.angleOffset;
        const node = this.addNode({
          id: item.id,
          label: item.label,
          type: 'live',
          category: item.category,
          radius: item.kind === 'drive' ? 7 : 4.2,
          color: palette.get(item.category),
          angle,
          leafIndex: item.rank,
          liveKind: item.kind,
          telemetryMetric: item.metric,
          telemetryValue: clamp(item.value),
          liveStats: item.stats ?? null,
          dynamic: true,
          x: parent.x + Math.cos(angle) * item.distance,
          y: parent.y + Math.sin(angle) * item.distance
        });

        this.dynamicNodeIds.add(node.id);
        if (!this.leavesByCategory.has(item.category)) {
          this.leavesByCategory.set(item.category, []);
        }
        this.leavesByCategory.get(item.category).push(node);
        this.addLink(parent, node, item.category, item.kind === 'driveMetric' ? 0.42 : 0.62, item.distance, false, true);
      }

      this.dynamicSignature = topologySignature;
      return true;
    }

    for (const item of items) {
      const node = this.nodeById.get(item.id);
      if (!node) continue;
      node.label = item.label;
      node.telemetryMetric = item.metric;
      node.telemetryValue = clamp(item.value);
      node.liveStats = item.stats ?? null;
    }

    return false;
  }

  maybeRebuild(config, palette) {
    if (Math.abs(config.graphDensity - this.lastDensity) > 0.08 || palette.mode !== this.palette.mode) {
      this.build(config, palette);
      return true;
    }
    this.config = config;
    this.palette = palette;
    return false;
  }

  updateActivities(activityState, palette) {
    const overall = activityState.value('overallLoad');
    const bass = activityState.value('audioBass');
    const ram = activityState.value('ram');

    for (const node of this.nodes) {
      if (node.type === 'root') {
        node.activity = clamp(overall * 0.72 + bass * 0.55);
        node.value = node.activity;
        node.color = palette.category('core', bass);
        node.targetRadius = lerp(18, 31, clamp(bass * 0.8 + overall * 0.4));
        node.visibleFactor = 1;
        node.glowBoost = 1;
        node.caption = 'PC CORE';
        node.captionDetail = `LOAD ${formatPercent(overall)}`;
        continue;
      }

      const nodeMetric = node.type === 'leaf' ? leafMetric(node) : node.category;
      const categoryActivity = categoryActivityKeys[node.category]?.(activityState) ?? overall;
      node.activity = categoryActivity;
      node.value = node.type === 'leaf'
        ? metricValue(activityState, nodeMetric, categoryActivity)
        : categoryActivity;
      node.color = palette.category(node.category, categoryActivity);

      if (node.type === 'category') {
        node.targetRadius = lerp(9.5, 16.5, categoryActivity);
        node.visibleFactor = 1;
        node.glowBoost = 1;
        node.caption = node.label;
        node.captionDetail = `${metricLabel(node.category)} ${formatPercent(categoryActivity)}`;
      } else if (node.type === 'live') {
        const isProcess = node.liveKind === 'process';
        const value = clamp(node.telemetryValue ?? categoryActivity);
        const visualValue = clamp(Math.sqrt(value));
        node.activity = clamp(categoryActivity * 0.32 + value * 0.86);
        node.value = value;
        node.visualValue = visualValue;
        node.heat = value;
        node.color = palette.category(node.category, node.activity);
        // Live process/drive nodes are the meaningful "balls": keep them readable even
        // when idle and let them brighten well past the structural leaves.
        node.glowBoost = isProcess ? 1.4 : node.liveKind === 'drive' ? 1.12 : 0.95;
        node.visibleFactor = isProcess
          ? clamp(0.5 + node.activity * 1.05)
          : clamp(0.34 + node.activity * 1.2);
        node.caption = node.label;
        node.captionDetail = isProcess
          ? processCaptionDetail(node.liveStats ?? {}, node.telemetryMetric)
          : `${metricLabel(node.telemetryMetric)} ${formatPercent(value)}`;

        if (node.liveKind === 'drive') {
          node.targetRadius = lerp(6, 13.5, visualValue);
        } else if (node.liveKind === 'driveMetric') {
          node.targetRadius = lerp(3.2, 7.2, visualValue);
        } else {
          // Processes scale larger than any synthetic leaf so usage reads at a glance.
          // Lower idle floor than before keeps a busy branch from looking crowded.
          node.targetRadius = lerp(5.5, 17, visualValue);
        }
      } else {
        const base = node.category === 'ram'
          ? clamp((ram - node.leafIndex * 0.055 + 0.52) * 1.2)
          : 1;
        // Synthetic structure recedes: smaller and dimmer so live process nodes dominate.
        node.targetRadius = lerp(3, 6.4, categoryActivity) * base;
        node.visibleFactor = node.category === 'ram' ? clamp(base * 1.25) : 0.62;
        node.glowBoost = 0.55;
        node.caption = node.label;
        node.captionDetail = `${metricLabel(nodeMetric)} ${formatPercent(node.value)}`;
      }
    }

    this.flagBranchLeaders();

    for (const link of this.links) {
      const sourceActivity = link.source.activity ?? 0;
      const targetActivity = link.target.activity ?? 0;
      link.activity = clamp(Math.max(sourceActivity, targetActivity) * (link.secondary ? 0.72 : 1));
      link.color = palette.category(link.category, link.activity);
    }
  }

  // Mark the single hottest live process under each branch so NodeVisual can give it a
  // subtle accent — the "top offender" for that resource.
  flagBranchLeaders() {
    const leaders = new Map();
    for (const id of this.dynamicNodeIds) {
      const node = this.nodeById.get(id);
      if (!node || node.liveKind !== 'process') continue;
      const current = leaders.get(node.category);
      if (!current || node.value > current.value) leaders.set(node.category, node);
    }
    for (const id of this.dynamicNodeIds) {
      const node = this.nodeById.get(id);
      if (!node) continue;
      node.isBranchLeader = node.liveKind === 'process' && leaders.get(node.category) === node;
    }
  }

  getCategoryNode(category) {
    return this.categoryNodes.get(category);
  }

  getOuterNodes() {
    return this.nodes.filter((node) => (node.type === 'leaf' || node.type === 'live') && node.visibleFactor > 0.2);
  }
}
