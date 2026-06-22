import { clamp } from '../utils/MathUtils.js';

function averageBins(values, start, end) {
  if (!values.length) return 0;
  const s = Math.max(0, Math.floor(start));
  const e = Math.min(values.length, Math.max(s + 1, Math.floor(end)));
  let sum = 0;
  for (let i = s; i < e; i += 1) sum += values[i] ?? 0;
  return sum / (e - s);
}

export class WallpaperAudioInput {
  constructor(activityState, config) {
    this.activityState = activityState;
    this.config = config;
    this.available = false;
    this.lastAudioAt = 0;
    this.register();
  }

  register() {
    if (typeof window === 'undefined' || typeof window.wallpaperRegisterAudioListener !== 'function') {
      return;
    }

    window.wallpaperRegisterAudioListener((audioArray) => this.handleAudio(audioArray));
    this.available = true;
  }

  handleAudio(audioArray) {
    if (!this.config.enableAudio || !Array.isArray(audioArray) || audioArray.length === 0) return;

    const half = Math.floor(audioArray.length / 2);
    const mono = [];
    for (let i = 0; i < half; i += 1) {
      mono.push(((audioArray[i] ?? 0) + (audioArray[i + half] ?? 0)) * 0.5);
    }

    const bass = averageBins(mono, 0, Math.max(3, mono.length * 0.12));
    const mid = averageBins(mono, mono.length * 0.18, mono.length * 0.52);
    const treble = averageBins(mono, mono.length * 0.56, mono.length);
    const volume = averageBins(mono, 0, mono.length);
    const gain = 1.65;

    this.activityState.merge(
      {
        audioBass: clamp(bass * gain),
        audioMid: clamp(mid * gain * 1.15),
        audioTreble: clamp(treble * gain * 1.35),
        audioVolume: clamp(volume * gain)
      },
      1
    );
    this.lastAudioAt = performance.now();
  }

  hasRecentAudio() {
    return this.available && performance.now() - this.lastAudioAt < 1800;
  }
}
