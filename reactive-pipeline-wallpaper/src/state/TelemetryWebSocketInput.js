import { clamp, safeName } from '../utils/MathUtils.js';

export class TelemetryWebSocketInput {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.status = 'off';
    this.retryAt = 0;
    this.retryDelay = 2500;
    this.lastMessageAt = 0;
    this.metrics = {};
    this.liveTree = {
      processes: [],
      drives: [],
      updatedAt: 0
    };
  }

  update() {
    if (!this.config.enableTelemetry) {
      this.close();
      this.status = 'off';
      return;
    }

    const now = performance.now();
    if (!this.socket && now > this.retryAt) this.connect();
    if (this.socket && this.lastMessageAt && now - this.lastMessageAt > 3200) {
      this.status = 'stale';
    }
  }

  connect() {
    this.status = 'connecting';
    let socket;
    try {
      socket = new WebSocket(this.config.telemetryUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket === socket) this.status = 'connected';
    });
    socket.addEventListener('message', (event) => {
      if (this.socket === socket) this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) this.scheduleReconnect();
    });
  }

  handleMessage(data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'hello') {
        this.status = 'connected';
        return;
      }
      this.metrics = {
        cpu: parsed.cpu,
        ram: parsed.ram,
        gpu: parsed.gpu,
        disk: parsed.disk,
        netDown: parsed.netDown,
        netUp: parsed.netUp,
        temperature: parsed.temperature
      };
      this.liveTree = {
        processes: this.sanitizeProcesses(parsed.processes),
        drives: this.sanitizeDrives(parsed.drives),
        updatedAt: performance.now()
      };
      this.lastMessageAt = performance.now();
      this.retryDelay = 2500;
      this.status = 'connected';
    } catch {
      this.status = 'bad-data';
    }
  }

  sanitizeProcesses(processes) {
    if (!Array.isArray(processes)) return [];
    return processes.slice(0, 44).map((process, index) => {
      const cpu = clamp(process.cpu ?? 0);
      const ram = clamp(process.ram ?? 0);
      const gpu = clamp(process.gpu ?? 0);
      const disk = clamp(process.disk ?? 0);
      return {
        pid: Number.isFinite(Number(process.pid)) ? Number(process.pid) : index,
        name: safeName(process.name, `process_${index + 1}`),
        cpu,
        ram,
        gpu,
        disk,
        threads: Number.isFinite(Number(process.threads)) ? Number(process.threads) : null,
        score: clamp(process.score ?? cpu * 1.35 + ram * 0.85 + gpu * 1.15 + disk * 0.9)
      };
    });
  }

  sanitizeDrives(drives) {
    if (!Array.isArray(drives)) return [];
    return drives.slice(0, 8).map((drive, index) => ({
      name: safeName(drive.name, `drive_${index + 1}`).slice(0, 12),
      used: clamp(drive.used ?? 0),
      activity: clamp(drive.activity ?? 0),
      sizeBytes: Number.isFinite(Number(drive.sizeBytes)) ? Number(drive.sizeBytes) : null,
      usedBytes: Number.isFinite(Number(drive.usedBytes)) ? Number(drive.usedBytes) : null
    }));
  }

  scheduleReconnect() {
    this.close();
    this.status = 'waiting';
    this.retryAt = performance.now() + this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 1.7, 30000);
  }

  close() {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }
}

