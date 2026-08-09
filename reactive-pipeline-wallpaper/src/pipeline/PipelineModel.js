import { RESOURCE_WEIGHTS, ROUTABLE_STATIONS, STATIONS } from '../config.js';
import { clamp, damp, safeName } from '../utils/MathUtils.js';

const PROCESS_FLOOR = 0.01;
const HOME_HYSTERESIS = 0.77;
const RESOURCE_ANGLES = {
  cpu: Math.PI,
  ram: -Math.PI / 2,
  gpu: 0,
  disk: Math.PI / 2
};

function seeded(value) {
  const n = Math.sin(Number(value) * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function weightedScore(process) {
  return clamp(
    (process.cpu ?? 0) * RESOURCE_WEIGHTS.cpu +
    (process.ram ?? 0) * RESOURCE_WEIGHTS.ram +
    (process.gpu ?? 0) * RESOURCE_WEIGHTS.gpu +
    (process.disk ?? 0) * RESOURCE_WEIGHTS.disk
  );
}

export class PipelineModel {
  constructor(config) {
    this.config = config;
    this.width = 1280;
    this.height = 720;
    this.time = 0;
    this.tasks = [];
    this.taskByPid = new Map();
    this.homeByPid = new Map();
    this.visiblePids = new Set();
    this.stationSlots = new Map();
    this.stationMap = new Map();
    this.stations = [];
    this.drives = [];
    this.focusedId = null;
    this.draggedId = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.setSize(this.width, this.height);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    const cx = width * 0.5;
    const cy = height * 0.52;
    const rx = Math.min(width * 0.32, 560);
    const ry = Math.min(height * 0.34, 285);
    const positions = {
      queue: { x: cx, y: cy, angle: 0, fieldRadius: Math.min(width, height) * 0.13 },
      cpu: { x: cx - rx, y: cy, angle: RESOURCE_ANGLES.cpu, fieldRadius: Math.min(width, height) * 0.17 },
      ram: { x: cx, y: cy - ry, angle: RESOURCE_ANGLES.ram, fieldRadius: Math.min(width, height) * 0.17 },
      gpu: { x: cx + rx, y: cy, angle: RESOURCE_ANGLES.gpu, fieldRadius: Math.min(width, height) * 0.17 },
      disk: { x: cx, y: cy + ry, angle: RESOURCE_ANGLES.disk, fieldRadius: Math.min(width, height) * 0.17 },
      network: { x: cx + rx * 0.72, y: cy + ry * 0.7, angle: Math.PI / 4, fieldRadius: Math.min(width, height) * 0.12 }
    };
    this.stations = STATIONS.map((station) => ({
      ...station,
      ...(positions[station.id] ?? positions.queue),
      value: this.stationMap.get(station.id)?.value ?? 0,
      pulse: this.stationMap.get(station.id)?.pulse ?? 0
    }));
    this.stationMap = new Map(this.stations.map((station) => [station.id, station]));
  }

  selectProcesses(processes, limit) {
    const sorted = processes
      .filter((process) => process && weightedScore(process) > PROCESS_FLOOR)
      .sort((a, b) => weightedScore(b) - weightedScore(a));
    const rankByPid = new Map(sorted.map((process, index) => [process.pid, index]));
    const grace = limit + 8;
    const selected = [];
    const chosen = new Set();

    const take = (process) => {
      if (selected.length >= limit || chosen.has(process.pid)) return;
      selected.push(process);
      chosen.add(process.pid);
    };

    for (const process of sorted) {
      if (this.visiblePids.has(process.pid) && rankByPid.get(process.pid) < grace) take(process);
    }
    for (const process of sorted) take(process);

    this.visiblePids = chosen;
    return selected;
  }

  routeProcess(process) {
    let best = 'cpu';
    let bestValue = -1;
    for (const station of ROUTABLE_STATIONS) {
      const weighted = (process[station] ?? 0) * RESOURCE_WEIGHTS[station];
      if (weighted > bestValue) {
        best = station;
        bestValue = weighted;
      }
    }

    const previous = this.homeByPid.get(process.pid);
    if (previous && ROUTABLE_STATIONS.includes(previous)) {
      const previousWeighted = (process[previous] ?? 0) * RESOURCE_WEIGHTS[previous];
      if (previousWeighted >= bestValue * HOME_HYSTERESIS) return previous;
    }
    return best;
  }

  assignSlots(station, pids) {
    const previous = this.stationSlots.get(station) ?? new Map();
    const used = new Set();
    const nextSlots = new Map();

    for (const pid of pids) {
      const slot = previous.get(pid);
      if (slot !== undefined && !used.has(slot)) {
        nextSlots.set(pid, slot);
        used.add(slot);
      }
    }

    let next = 0;
    for (const pid of pids) {
      if (nextSlots.has(pid)) continue;
      while (used.has(next)) next += 1;
      nextSlots.set(pid, next);
      used.add(next);
    }

    this.stationSlots.set(station, nextSlots);
    return nextSlots;
  }

  sync(liveTree, config = this.config) {
    const processes = Array.isArray(liveTree?.processes) ? liveTree.processes : [];
    const selected = this.selectProcesses(processes, config.maxProcesses ?? 28);
    const seen = new Set();
    const nextHomes = new Map();
    const pidsByStation = new Map();

    for (const process of selected) {
      const station = this.routeProcess(process);
      nextHomes.set(process.pid, station);
      if (!pidsByStation.has(station)) pidsByStation.set(station, []);
      pidsByStation.get(station).push(process.pid);
    }

    const slotMaps = new Map();
    for (const [station, pids] of pidsByStation) {
      slotMaps.set(station, this.assignSlots(station, pids));
    }
    for (const station of [...this.stationSlots.keys()]) {
      if (!pidsByStation.has(station)) this.stationSlots.delete(station);
    }

    for (const process of selected) {
      const pid = process.pid;
      const id = `task:${pid}`;
      const station = nextHomes.get(pid);
      const slot = slotMaps.get(station)?.get(pid) ?? 0;
      let task = this.taskByPid.get(pid);
      if (!task) {
        const queue = this.stationMap.get('queue');
        const target = this.targetForProcess(process, station, slot);
        task = {
          id,
          pid,
          name: safeName(process.name, `process_${pid}`),
          station,
          previousStation: 'queue',
          x: queue ? queue.x : target.x,
          y: target.y + (seeded(pid) - 0.5) * 52,
          targetX: target.x,
          targetY: target.y,
          slot,
          rank: 0,
          affinity: target.affinity,
          phase: seeded(pid + 31) * Math.PI * 2,
          stats: process,
          score: weightedScore(process),
          metricValue: clamp(process[station] ?? 0),
          bornAt: this.time,
          lastSeenAt: this.time,
          changedAt: this.time,
          alpha: 0,
          focus: 0,
          grab: 0,
          dying: false
        };
        this.taskByPid.set(pid, task);
      }

      if (task.station !== station) {
        task.previousStation = task.station;
        task.station = station;
        task.changedAt = this.time;
      }

      const target = this.targetForProcess(process, station, slot);
      task.name = safeName(process.name, task.name);
      task.stats = process;
      task.score = weightedScore(process);
      task.metricValue = clamp(process[station] ?? 0);
      task.slot = slot;
      task.rank = selected.indexOf(process);
      task.affinity = target.affinity;
      task.targetX = target.x;
      task.targetY = target.y;
      task.lastSeenAt = this.time;
      task.dying = false;
      seen.add(pid);
    }

    for (const [pid, task] of this.taskByPid) {
      if (seen.has(pid)) continue;
      task.dying = true;
      if (!task.deadAt) task.deadAt = this.time;
      if (this.time - task.deadAt > 1.1) this.taskByPid.delete(pid);
    }

    this.homeByPid = nextHomes;
    this.tasks = [...this.taskByPid.values()];
    this.drives = Array.isArray(liveTree?.drives) ? liveTree.drives : [];
  }

  targetForProcess(process, stationId, slot = 0) {
    const queue = this.stationMap.get('queue');
    const home = this.stationMap.get(stationId) ?? queue;
    const values = ROUTABLE_STATIONS.map((id) => ({
      id,
      weighted: Math.max(0, (process[id] ?? 0) * RESOURCE_WEIGHTS[id])
    }));
    const totalSignal = values.reduce((sum, item) => sum + item.weighted, 0);
    const score = weightedScore(process);
    const cx = queue?.x ?? this.width * 0.5;
    const cy = queue?.y ?? this.height * 0.5;

    let vx = 0;
    let vy = 0;
    for (const item of values) {
      const angle = RESOURCE_ANGLES[item.id] ?? 0;
      vx += Math.cos(angle) * item.weighted;
      vy += Math.sin(angle) * item.weighted;
    }

    const homeAngle = RESOURCE_ANGLES[stationId] ?? home.angle ?? 0;
    const homePull = Math.max(0.08, totalSignal * 0.58);
    vx += Math.cos(homeAngle) * homePull;
    vy += Math.sin(homeAngle) * homePull;
    const angle = Math.atan2(vy, vx);
    const radiusMin = Math.min(this.width, this.height) * 0.08;
    const radiusMax = Math.min(this.width, this.height) * 0.33;
    const intensity = clamp(Math.sqrt(score));
    const baseRadius = radiusMin + radiusMax * intensity;

    const slots = this.stationSlots.get(stationId)?.size ?? 1;
    const center = (slots - 1) / 2;
    const ring = Math.floor(slot / 7);
    const local = seeded(process.pid + slot * 19) * Math.PI * 2 + slot * 0.71;
    const spread = 18 + ring * 19 + Math.min(34, Math.abs(slot - center) * 2.8);
    const tangent = angle + Math.PI / 2;
    const radialOffset = Math.cos(local) * spread * 0.45;
    const tangentOffset = Math.sin(local) * spread;
    const x = cx + Math.cos(angle) * (baseRadius + radialOffset) + Math.cos(tangent) * tangentOffset;
    const y = cy + Math.sin(angle) * (baseRadius + radialOffset) + Math.sin(tangent) * tangentOffset;

    return {
      x,
      y,
      affinity: Object.fromEntries(values.map((item) => [item.id, totalSignal > 0 ? item.weighted / totalSignal : 0]))
    };
  }

  stationActivity(stationId, activityState) {
    if (stationId === 'queue') return Math.max(0.08, activityState.value('overallLoad') * 0.35);
    if (stationId === 'network') return Math.max(activityState.value('netDown'), activityState.value('netUp'));
    return activityState.value(stationId);
  }

  update(dt, activityState, pointer) {
    this.time += dt;

    for (const station of this.stations) {
      const nextValue = this.stationActivity(station.id, activityState);
      station.value = damp(station.value, nextValue, 5, dt);
      station.pulse = damp(station.pulse, nextValue > 0.55 ? nextValue : 0, 3, dt);
    }

    this.handlePointer(pointer);

    for (const task of this.tasks) {
      const focused = task.id === this.focusedId;
      const grabbed = task.id === this.draggedId;
      task.focus = damp(task.focus, focused ? 1 : 0, 9, dt);
      task.grab = damp(task.grab, grabbed ? 1 : 0, 12, dt);
      task.alpha = damp(task.alpha, task.dying ? 0 : 1, task.dying ? 5 : 4, dt);

      if (grabbed) continue;

      const speed = task.dying ? 2.5 : 4.2 + clamp(task.score) * 4.5;
      task.x = damp(task.x, task.targetX, speed, dt);
      task.y = damp(task.y, task.targetY, speed, dt);
    }
  }

  pickTask(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const task of this.tasks) {
      if (task.alpha <= 0.08 || task.dying) continue;
      const width = this.taskWidth(task);
      const height = this.taskHeight(task);
      const dx = Math.max(Math.abs(task.x - x) - width * 0.5, 0);
      const dy = Math.max(Math.abs(task.y - y) - height * 0.5, 0);
      const dist = Math.hypot(dx, dy);
      if (dist < 26 && dist < bestDist) {
        best = task;
        bestDist = dist;
      }
    }
    return best;
  }

  handlePointer(pointer) {
    if (!pointer) return;

    if (pointer.justPressed && !this.draggedId) {
      const picked = this.pickTask(pointer.x, pointer.y);
      if (picked) {
        this.draggedId = picked.id;
        this.focusedId = picked.id;
        this.dragOffsetX = picked.x - pointer.x;
        this.dragOffsetY = picked.y - pointer.y;
      }
    }

    const dragged = this.draggedId ? this.tasks.find((task) => task.id === this.draggedId) : null;
    if (dragged && pointer.isDown) {
      dragged.x = pointer.x + this.dragOffsetX;
      dragged.y = pointer.y + this.dragOffsetY;
    } else if (this.draggedId && !pointer.isDown) {
      this.draggedId = null;
    }

    const hover = this.draggedId
      ? this.tasks.find((task) => task.id === this.draggedId)
      : this.pickTask(pointer.x, pointer.y);
    this.focusedId = hover ? hover.id : null;
  }

  taskWidth(task) {
    return this.taskRadius(task) * 2.8;
  }

  taskHeight(task) {
    return this.taskRadius(task) * 2.8;
  }

  taskRadius(task) {
    return 5.5 + Math.sqrt(clamp(task.score)) * 18 + task.focus * 8 + task.grab * 4;
  }

  processHome(pid) {
    return this.homeByPid.get(pid);
  }

  stationForTask(pid) {
    return this.taskByPid.get(pid)?.station ?? null;
  }
}
