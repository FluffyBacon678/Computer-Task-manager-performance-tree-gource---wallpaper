import { clamp } from '../utils/MathUtils.js';

export class TelemetryWebSocketInput {
  constructor(activityState, config) {
    this.activityState = activityState;
    this.config = config;
    this.socket = null;
    this.status = 'off';
    this.retryAt = 0;
    this.retryDelay = 2500;
    this.lastMessageAt = 0;
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
    if (!this.socket && now > this.retryAt) {
      this.connect();
    }

    if (this.socket && this.lastMessageAt && now - this.lastMessageAt > 3000) {
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
    // Guard every handler against a stale socket: close() nulls this.socket first, so
    // events from an intentionally closed socket can't schedule spurious reconnects.
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

      // live=true marks these channels as real so the demo generator stops animating
      // them; null channels (e.g. GPU on unsupported hardware) stay demo-driven.
      this.activityState.merge(
        {
          cpu: parsed.cpu,
          ram: parsed.ram,
          gpu: parsed.gpu,
          disk: parsed.disk,
          netDown: parsed.netDown,
          netUp: parsed.netUp,
          temperature: parsed.temperature
        },
        1,
        true
      );
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
    return processes
      .slice(0, 32)
      .map((process, index) => ({
        pid: Number.isFinite(Number(process.pid)) ? Number(process.pid) : index,
        name: typeof process.name === 'string' && process.name.trim()
          ? process.name.trim().slice(0, 32)
          : `process_${index + 1}`,
        cpu: clamp(Number(process.cpu ?? 0)),
        ram: clamp(Number(process.ram ?? 0)),
        gpu: clamp(Number(process.gpu ?? 0)),
        disk: clamp(Number(process.disk ?? 0)),
        threads: Number.isFinite(Number(process.threads)) ? Number(process.threads) : null,
        score: clamp(Number(process.score ?? Math.max(process.cpu ?? 0, process.ram ?? 0, process.gpu ?? 0, process.disk ?? 0)))
      }));
  }

  sanitizeDrives(drives) {
    if (!Array.isArray(drives)) return [];
    return drives
      .slice(0, 8)
      .map((drive, index) => ({
        name: typeof drive.name === 'string' && drive.name.trim()
          ? drive.name.trim().slice(0, 12)
          : `drive_${index + 1}`,
        used: clamp(Number(drive.used ?? 0)),
        activity: clamp(Number(drive.activity ?? 0)),
        sizeBytes: Number.isFinite(Number(drive.sizeBytes)) ? Number(drive.sizeBytes) : null,
        usedBytes: Number.isFinite(Number(drive.usedBytes)) ? Number(drive.usedBytes) : null
      }));
  }

  scheduleReconnect() {
    this.close();
    this.status = 'waiting';
    this.retryAt = performance.now() + this.retryDelay;
    // Back off while the helper is absent (most installs) so an always-on wallpaper
    // isn't dialing a dead port every 2.5s forever; resets on the next live message.
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
