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
  backgroundQuality: 1,
  renderScale: 1,
  adaptiveQuality: true,
  qualityScale: 1,
  bloom: false,
  bloomStrength: 1,
  trails: true,
  gravityStrength: 1,
  // 'resources' = the fixed CPU/RAM/GPU/DISK/NETWORK/AUDIO constellation.
  // 'processes' = the Gource-style live process ancestry tree (needs the helper).
  treeMode: 'resources',
  maxTreeNodes: 220,
  // How strongly music moves the visuals. Deliberately subtle by default: audio only
  // ever affects presentation (size/brightness/beat rings), never the telemetry values,
  // so the tree keeps telling the truth about the machine while it breathes to the beat.
  audioReactivity: 0.6,
  audioBeatRings: true,
  // Seconds for a motion trail to fade to ~37%. Short by default: long trails smear the
  // moving light into haze and read as an out-of-focus image rather than motion.
  trailLength: 0.09,
  // Halo size multiplier for node glows. Hundreds of overlapping halos in the process
  // tree turn into a soft fog, so this lets the glow be tightened for a crisper look.
  glowTightness: 1
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
    angle: -90,
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
    angle: -30,
    leaves: ['used', 'cache', 'standby', 'swap', 'pool_a', 'pool_b', 'pages', 'mapped']
  },
  {
    id: 'gpu',
    label: 'GPU',
    angle: 30,
    leaves: ['shader', 'vram', 'render', 'temperature', 'compute', 'raster', 'queue', 'frame']
  },
  {
    id: 'disk',
    label: 'DISK',
    angle: 90,
    leaves: ['nvme0', 'reads', 'writes', 'queue', 'cache', 'flush', 'journal', 'blocks']
  },
  {
    id: 'network',
    label: 'NETWORK',
    angle: 150,
    leaves: ['download', 'upload', 'packets', 'latency', 'dns', 'socket', 'stream', 'route']
  },
  {
    id: 'audio',
    label: 'AUDIO',
    angle: 210,
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
