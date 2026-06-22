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

function topByMetric(items, metric, limit, threshold = 0.00025) {
  return [...items]
    .filter((item) => item && item[metric] > threshold)
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, limit);
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

  buildDynamicItems(liveTree, config) {
    const items = [];
    const processes = Array.isArray(liveTree?.processes) ? liveTree.processes : [];
    const drives = Array.isArray(liveTree?.drives) ? liveTree.drives : [];
    const processLimit = config.lowPerformanceMode
      ? 5
      : Math.round(clamp(7 + config.graphDensity * 4, 6, 14));
    const driveLimit = config.lowPerformanceMode ? 2 : 4;

    topByMetric(processes, 'cpu', processLimit).forEach((process, index) => {
      items.push({
        id: `live:cpu:${process.pid}`,
        parentId: 'cpu',
        label: processLabel(process, index, 'cpu', config),
        category: 'cpu',
        kind: 'process',
        metric: 'cpu',
        value: process.cpu,
        stats: process,
        rank: 90 + index,
        angleOffset: -0.42 + index * 0.055,
        distance: 112
      });
    });

    topByMetric(processes, 'ram', processLimit).forEach((process, index) => {
      items.push({
        id: `live:ram:${process.pid}`,
        parentId: 'ram',
        label: processLabel(process, index, 'ram', config),
        category: 'ram',
        kind: 'process',
        metric: 'ram',
        value: process.ram,
        stats: process,
        rank: 110 + index,
        angleOffset: -0.34 + index * 0.055,
        distance: 112
      });
    });

    topByMetric(processes, 'gpu', processLimit, 0.001).forEach((process, index) => {
      items.push({
        id: `live:gpu:${process.pid}`,
        parentId: 'gpu',
        label: processLabel(process, index, 'gpu', config),
        category: 'gpu',
        kind: 'process',
        metric: 'gpu',
        value: process.gpu,
        stats: process,
        rank: 120 + index,
        angleOffset: -0.32 + index * 0.06,
        distance: 112
      });
    });

    topByMetric(processes, 'disk', processLimit, 0.001).forEach((process, index) => {
      items.push({
        id: `live:disk:${process.pid}`,
        parentId: 'disk',
        label: processLabel(process, index, 'disk', config),
        category: 'disk',
        kind: 'process',
        metric: 'disk',
        value: process.disk,
        stats: process,
        rank: 125 + index,
        angleOffset: 0.04 + index * 0.06,
        distance: 112
      });
    });

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
          ? clamp(0.52 + node.activity * 1)
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
          node.targetRadius = lerp(7, 18, visualValue);
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

    for (const link of this.links) {
      const sourceActivity = link.source.activity ?? 0;
      const targetActivity = link.target.activity ?? 0;
      link.activity = clamp(Math.max(sourceActivity, targetActivity) * (link.secondary ? 0.72 : 1));
      link.color = palette.category(link.category, link.activity);
    }
  }

  getCategoryNode(category) {
    return this.categoryNodes.get(category);
  }

  getOuterNodes() {
    return this.nodes.filter((node) => (node.type === 'leaf' || node.type === 'live') && node.visibleFactor > 0.2);
  }
}
