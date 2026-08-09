export const DEFAULT_CONFIG = {
  intensity: 1,
  maxProcesses: 28,
  showLabels: true,
  enableTelemetry: true,
  telemetryUrl: 'ws://127.0.0.1:17890',
  showHud: true,
  animationSpeed: 1,
  qualityScale: 1
};

export const STATIONS = [
  {
    id: 'queue',
    label: 'TASK INTAKE',
    short: 'QUEUE',
    color: 0x7dd3fc,
    description: 'new and low-load work'
  },
  {
    id: 'cpu',
    label: 'CPU SCHEDULER',
    short: 'CPU',
    color: 0x00c8ff,
    description: 'threads and active compute'
  },
  {
    id: 'ram',
    label: 'MEMORY POOL',
    short: 'RAM',
    color: 0xb04cff,
    description: 'resident memory pressure'
  },
  {
    id: 'gpu',
    label: 'RENDER PIPE',
    short: 'GPU',
    color: 0xff9f1c,
    description: 'graphics and shader load'
  },
  {
    id: 'disk',
    label: 'STORAGE QUEUE',
    short: 'DISK',
    color: 0xffd166,
    description: 'read/write pressure'
  },
  {
    id: 'network',
    label: 'UPLINK',
    short: 'NET',
    color: 0x06d6a0,
    description: 'global upload/download flow'
  }
];

export const ROUTABLE_STATIONS = ['cpu', 'ram', 'gpu', 'disk'];

export const RESOURCE_WEIGHTS = {
  cpu: 1.35,
  ram: 0.85,
  gpu: 1.15,
  disk: 0.9
};

export const COLORS = {
  background: 0x020309,
  backgroundAlt: 0x07111e,
  grid: 0x123149,
  text: 0xdaf6ff,
  muted: 0x7ea5b7,
  core: 0xffffff,
  lane: 0x23475e
};

export function stationById(id) {
  return STATIONS.find((station) => station.id === id) ?? STATIONS[0];
}

