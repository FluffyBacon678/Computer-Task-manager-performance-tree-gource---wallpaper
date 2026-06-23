export const DEFAULT_CONFIG = {
  intensity: 1,
  particleAmount: 1,
  graphDensity: 1,
  glowStrength: 1,
  animationSpeed: 1,
  cameraDrift: true,
  showLabels: true,
  showSystemLeafLabels: false,
  paletteMode: 'visual-source',
  enableAudio: true,
  enableTelemetry: true,
  enableLiveProcesses: true,
  enableProcessGpu: true,
  showProcessNames: true,
  maxProcesses: 24,
  labelDensity: 1,
  mouseInteraction: 'focus',
  mouseStrength: 1,
  showHud: true,
  enableActor: true,
  telemetryUrl: 'ws://127.0.0.1:17890',
  debugOverlay: false,
  lowPerformanceMode: false,
  backgroundQuality: 1
};

export const ACTIVITY_KEYS = [
  'cpu',
  'ram',
  'gpu',
  'disk',
  'netDown',
  'netUp',
  'audioBass',
  'audioMid',
  'audioTreble',
  'audioVolume',
  'temperature',
  'overallLoad'
];

export const CATEGORY_DEFINITIONS = [
  {
    id: 'cpu',
    label: 'CPU',
    angle: -92,
    leaves: [
      'core_01',
      'core_02',
      'core_03',
      'core_04',
      'core_05',
      'core_06',
      'core_07',
      'core_08',
      'core_09',
      'core_10',
      'core_11',
      'core_12',
      'core_13',
      'core_14',
      'core_15',
      'core_16',
      'scheduler',
      'threads'
    ]
  },
  {
    id: 'ram',
    label: 'RAM',
    angle: -28,
    leaves: ['used', 'cache', 'standby', 'swap', 'pool_a', 'pool_b', 'pages', 'mapped']
  },
  {
    id: 'gpu',
    label: 'GPU',
    angle: 34,
    leaves: ['shader', 'vram', 'render', 'temperature', 'compute', 'raster', 'queue', 'frame']
  },
  {
    id: 'disk',
    label: 'DISK',
    angle: 102,
    leaves: ['nvme0', 'reads', 'writes', 'queue', 'cache', 'flush', 'journal', 'blocks']
  },
  {
    id: 'network',
    label: 'NETWORK',
    angle: 174,
    leaves: ['download', 'upload', 'packets', 'latency', 'dns', 'socket', 'stream', 'route']
  },
  {
    id: 'audio',
    label: 'AUDIO',
    angle: 238,
    leaves: ['bass', 'mid', 'treble', 'volume', 'left', 'right', 'beat', 'spectrum']
  }
];

export const DEFAULT_NODE_COUNTS = {
  minLeaves: 35,
  maxLeaves: 70,
  crossLinks: 34
};

export const SIMULATION = {
  baseLinkDistance: 112,
  leafDistance: 76,
  rootDistance: 142,
  repulsion: -380,
  collidePadding: 12,
  alphaDecay: 0.035,
  velocityDecay: 0.36
};
