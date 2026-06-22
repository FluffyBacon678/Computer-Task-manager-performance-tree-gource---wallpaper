import { hexToNumber, mixColor } from '../utils/MathUtils.js';

const palettes = {
  'visual-source': {
    backgroundA: '#03040A',
    backgroundB: '#070B18',
    core: '#FFFFFF',
    coreAccent: '#AEEBFF',
    cpu: '#00C8FF',
    ram: '#B04CFF',
    gpu: '#FF9F1C',
    disk: '#FFD166',
    network: '#06D6A0',
    audio: '#FF4FD8',
    text: '#B7E9FF',
    dust: '#5CD7FF'
  },
  'cyber-neon': {
    backgroundA: '#02040B',
    backgroundB: '#0B1024',
    core: '#EFFFFF',
    coreAccent: '#77FFF2',
    cpu: '#29B6FF',
    ram: '#F342FF',
    gpu: '#FFB000',
    disk: '#F8FF7B',
    network: '#2CFF8F',
    audio: '#FF4AA2',
    text: '#CCF7FF',
    dust: '#98E8FF'
  },
  'purple-cyan': {
    backgroundA: '#03030A',
    backgroundB: '#0D0820',
    core: '#FFFFFF',
    coreAccent: '#9EEBFF',
    cpu: '#00E7FF',
    ram: '#C15CFF',
    gpu: '#FF7D44',
    disk: '#F9E06B',
    network: '#35FFC7',
    audio: '#EA5CFF',
    text: '#DCCBFF',
    dust: '#9E75FF'
  },
  'warm-gpu': {
    backgroundA: '#050408',
    backgroundB: '#120813',
    core: '#FFF7E3',
    coreAccent: '#FFD3A1',
    cpu: '#4AD9FF',
    ram: '#D767FF',
    gpu: '#FF6F3C',
    disk: '#FFE66D',
    network: '#32FFB5',
    audio: '#FF5EA8',
    text: '#FFE4C2',
    dust: '#FFB06A'
  },
  'matrix-green': {
    backgroundA: '#000604',
    backgroundB: '#04140D',
    core: '#ECFFF2',
    coreAccent: '#B4FFD3',
    cpu: '#4FC3FF',
    ram: '#75FF89',
    gpu: '#D6FF4D',
    disk: '#F8FFB0',
    network: '#00FF8A',
    audio: '#64FFDA',
    text: '#B8FFD0',
    dust: '#4DFF9B'
  },
  custom: {
    backgroundA: '#03040A',
    backgroundB: '#08091E',
    core: '#FFFFFF',
    coreAccent: '#AEEBFF',
    cpu: '#00C8FF',
    ram: '#B04CFF',
    gpu: '#FF9F1C',
    disk: '#FFD166',
    network: '#06D6A0',
    audio: '#FF4FD8',
    text: '#B7E9FF',
    dust: '#5CD7FF'
  }
};

export class Palette {
  constructor(mode = 'visual-source') {
    this.setMode(mode);
  }

  setMode(mode) {
    this.mode = palettes[mode] ? mode : 'visual-source';
    this.colors = Object.fromEntries(
      Object.entries(palettes[this.mode]).map(([key, value]) => [key, hexToNumber(value)])
    );
  }

  get(category) {
    if (!category) return this.colors.coreAccent;
    return this.colors[category] ?? this.colors.coreAccent;
  }

  category(category, heat = 0) {
    const base = this.get(category);
    if (heat <= 0) return base;
    return mixColor(base, this.colors.core, Math.min(0.35, heat * 0.35));
  }
}
