import { clamp } from '../utils/MathUtils.js';

const NAMES = [
  'browser.exe',
  'game-overlay.exe',
  'node.exe',
  'steam.exe',
  'discord.exe',
  'code.exe',
  'wallpaper32.exe',
  'searchindexer.exe',
  'dwm.exe',
  'audiohost.exe',
  'backup.exe',
  'renderer.exe',
  'powershell.exe',
  'explorer.exe',
  'antimalware.exe',
  'download.exe'
];

export class DemoTelemetry {
  constructor() {
    this.time = 0;
    this.liveTree = { processes: [], drives: [], updatedAt: 0 };
    this.metrics = {};
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const cpu = clamp(0.28 + Math.sin(t * 0.72) * 0.12 + Math.sin(t * 1.7) * 0.07);
    const ram = clamp(0.55 + Math.sin(t * 0.37 + 2) * 0.1);
    const gpu = clamp(0.22 + Math.max(0, Math.sin(t * 0.5 - 1)) * 0.28);
    const disk = clamp(0.08 + Math.max(0, Math.sin(t * 0.9 + 1.4)) * 0.22);
    const netDown = clamp(0.1 + Math.max(0, Math.sin(t * 0.44 + 0.7)) * 0.2);
    const netUp = clamp(0.05 + Math.max(0, Math.sin(t * 0.53 + 2.3)) * 0.12);
    this.metrics = { cpu, ram, gpu, disk, netDown, netUp };

    this.liveTree = {
      updatedAt: performance.now(),
      processes: NAMES.map((name, index) => this.makeProcess(name, index, t)),
      drives: [
        { name: 'C:', used: 0.72, activity: disk, sizeBytes: 1024 ** 4, usedBytes: 0.72 * 1024 ** 4 },
        { name: 'D:', used: 0.41, activity: disk * 0.38, sizeBytes: 2 * 1024 ** 4, usedBytes: 0.82 * 1024 ** 4 }
      ]
    };
  }

  makeProcess(name, index, t) {
    const phase = index * 0.73;
    const lane = (Math.floor(t * 0.17 + index) % 4);
    const base = 0.03 + (Math.sin(t * (0.38 + index * 0.015) + phase) + 1) * 0.045;
    const spike = Math.max(0, Math.sin(t * (0.5 + index * 0.03) + phase * 2)) ** 3;
    const values = {
      cpu: base,
      ram: base * 0.8,
      gpu: base * 0.45,
      disk: base * 0.36
    };
    const station = ['cpu', 'ram', 'gpu', 'disk'][lane];
    values[station] = clamp(0.16 + spike * (0.42 + (index % 3) * 0.08));
    return {
      pid: 6000 + index,
      name,
      ...values,
      threads: 4 + ((index * 7) % 46),
      score: clamp(values.cpu * 1.35 + values.ram * 0.85 + values.gpu * 1.15 + values.disk * 0.9)
    };
  }
}

