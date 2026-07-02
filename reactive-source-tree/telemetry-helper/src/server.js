import si from 'systeminformation';
import { WebSocketServer } from 'ws';
import { ProcessCounterSampler } from './processCounters.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 17890);
const UPDATE_INTERVAL_MS = 200;
const RICH_TELEMETRY_INTERVAL_MS = 1000;
// GPU controller info and CPU/GPU temperature change slowly and are expensive to read
// (driver/WMI queries), so they are polled on this slower cadence instead of every tick.
const SLOW_TELEMETRY_INTERVAL_MS = 1500;
const MAX_PROCESSES = 40; // matches the wallpaper's Max Processes slider ceiling
const MAX_DRIVES = 8;
// Throughput ceilings used to map raw bytes/sec counter readings to a 0..1 share.
const PROCESS_DISK_CEILING = 80 * 1024 * 1024; // 80 MB/s ~ a busy single process
const DRIVE_DISK_CEILING = 150 * 1024 * 1024; // 150 MB/s ~ a busy volume

// Optional, best-effort per-process GPU/disk and per-drive I/O from Windows performance
// counters. Falls back silently to CPU/RAM-only on any failure or non-Windows host.
const processCounterSampler = new ProcessCounterSampler();

let richTelemetryCache = {
  processes: [],
  drives: []
};
let lastRichTelemetryAt = 0;
let richTelemetryInFlight = false;
let loggedRichTelemetryReady = false;

let slowMetricsCache = { gpu: null, temperature: null };
let lastSlowMetricsAt = 0;
let slowMetricsInFlight = false;

function clamp(value, min = 0, max = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function normalizeBytesPerSecond(value, ceiling) {
  if (typeof value !== 'number' || value < 0) return 0;
  return clamp(value / ceiling);
}

function normalizeTemperature(celsius) {
  if (typeof celsius !== 'number' || celsius <= 0) return null;
  return clamp((celsius - 35) / 60);
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function sanitizeName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[^\w .:+-]/g, '').trim().slice(0, 32) || fallback;
}

function normalizePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return clamp(value / 100) ?? 0;
}

function normalizeProcess(process, gpuByPid, diskByPid) {
  const cpu = normalizePercent(process.cpu ?? process.pcpu);
  const ram = normalizePercent(process.mem ?? process.pmem);
  const pid = Number.isFinite(process.pid) ? process.pid : undefined;
  // Prefer the Windows performance-counter reading (keyed by PID) when available,
  // otherwise fall back to whatever GPU field systeminformation might expose (usually none).
  const counterGpu = pid !== undefined ? gpuByPid?.get(pid) : undefined;
  const gpu = counterGpu !== undefined
    ? normalizePercent(counterGpu)
    : normalizePercent(
      process.gpu ??
      process.gpuUsage ??
      process.utilizationGpu ??
      process.gpuUtilization
    );
  // Per-process disk is the IO Data Bytes/sec counter (file+net+device) mapped to a share.
  const counterDisk = pid !== undefined ? diskByPid?.get(pid) : undefined;
  const disk = counterDisk !== undefined
    ? normalizeBytesPerSecond(counterDisk, PROCESS_DISK_CEILING)
    : normalizePercent(process.disk ?? process.diskUsage ?? process.io ?? process.ioUsage);
  const threads = Number.isFinite(process.threads)
    ? process.threads
    : Number.isFinite(process.threadCount)
      ? process.threadCount
      : null;

  return {
    pid: Number.isFinite(process.pid) ? process.pid : 0,
    name: sanitizeName(process.name, 'process'),
    cpu,
    ram,
    gpu,
    disk,
    threads,
    score: clamp(cpu * 1.35 + ram * 0.85 + gpu * 1.15 + disk * 0.9) ?? 0
  };
}

function normalizeDrive(drive, globalActivity, ldiskByName) {
  const name = sanitizeName(drive.mount ?? drive.fs ?? drive.name, 'drive');
  const used = typeof drive.use === 'number'
    ? normalizePercent(drive.use)
    : clamp((drive.used ?? 0) / (drive.size || 1)) ?? 0;

  // Use real per-volume Disk Bytes/sec when the counter has this drive letter,
  // otherwise fall back to the shared global disk activity.
  const driveBytes = ldiskByName?.get(name.toLowerCase());
  const activity = driveBytes !== undefined
    ? normalizeBytesPerSecond(driveBytes, DRIVE_DISK_CEILING)
    : globalActivity;

  return {
    name,
    used,
    activity,
    sizeBytes: Number.isFinite(drive.size) ? drive.size : null,
    usedBytes: Number.isFinite(drive.used) ? drive.used : null
  };
}

async function collectRichTelemetry(globalDiskActivity) {
  const [processes, drives] = await Promise.allSettled([
    si.processes(),
    si.fsSize()
  ]);

  const { gpuByPid, diskByPid, ldiskByName } = processCounterSampler.sample();

  const normalizedProcesses = processes.status === 'fulfilled' && Array.isArray(processes.value.list)
    ? processes.value.list
      .map((process) => normalizeProcess(process, gpuByPid, diskByPid))
      .filter((process) => process.pid > 0 && process.score > 0.002)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PROCESSES)
    : [];

  const normalizedDrives = drives.status === 'fulfilled' && Array.isArray(drives.value)
    ? drives.value
      .map((drive) => normalizeDrive(drive, globalDiskActivity, ldiskByName))
      .filter((drive) => drive.name && drive.used !== null)
      .sort((a, b) => b.used - a.used)
      .slice(0, MAX_DRIVES)
    : [];

  richTelemetryCache = {
    processes: normalizedProcesses,
    drives: normalizedDrives
  };
  lastRichTelemetryAt = Date.now();

  if (!loggedRichTelemetryReady) {
    console.log(`Rich telemetry ready: ${normalizedProcesses.length} processes, ${normalizedDrives.length} drives`);
    loggedRichTelemetryReady = true;
  }
}

// GPU controller + temperature: read on a slow cadence and cache, since they are costly
// and change slowly. Runs async/non-blocking so it never holds up the fast metrics.
async function collectSlowMetrics() {
  const [graphics, temperature] = await Promise.allSettled([si.graphics(), si.cpuTemperature()]);
  const controller = graphics.status === 'fulfilled' ? graphics.value.controllers?.[0] : null;
  const gpuUtilization = firstNumber(
    controller?.utilizationGpu,
    controller?.utilizationMemory,
    controller?.memoryUsed && controller?.memoryTotal
      ? (controller.memoryUsed / controller.memoryTotal) * 100
      : null
  );
  const tempValue = temperature.status === 'fulfilled'
    ? firstNumber(temperature.value.max, temperature.value.main)
    : null;
  const gpuTemperature = firstNumber(controller?.temperatureGpu);
  slowMetricsCache = {
    gpu: gpuUtilization === null ? null : clamp(gpuUtilization / 100),
    temperature: normalizeTemperature(firstNumber(gpuTemperature, tempValue))
  };
  lastSlowMetricsAt = Date.now();
}

async function collectTelemetry() {
  const [load, mem, netStats, diskStats] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
    si.networkStats(),
    si.disksIO()
  ]);

  const cpu = load.status === 'fulfilled' ? clamp(load.value.currentLoad / 100) : 0;
  const ram = mem.status === 'fulfilled' ? clamp(mem.value.active / mem.value.total) : 0;

  const network = netStats.status === 'fulfilled' && Array.isArray(netStats.value)
    ? netStats.value.reduce(
      (sum, adapter) => ({
        rx: sum.rx + Math.max(0, adapter.rx_sec ?? 0),
        tx: sum.tx + Math.max(0, adapter.tx_sec ?? 0)
      }),
      { rx: 0, tx: 0 }
    )
    : { rx: 0, tx: 0 };

  const diskValue = diskStats.status === 'fulfilled' ? diskStats.value : null;
  const diskBytes = diskValue
    ? Math.max(0, diskValue.rIO_sec ?? 0) + Math.max(0, diskValue.wIO_sec ?? 0)
    : 0;
  const disk = normalizeBytesPerSecond(diskBytes, 120 * 1024 * 1024);

  const needsInitialRichTelemetry =
    lastRichTelemetryAt === 0 &&
    richTelemetryCache.processes.length === 0 &&
    richTelemetryCache.drives.length === 0;

  if (needsInitialRichTelemetry && !richTelemetryInFlight) {
    richTelemetryInFlight = true;
    try {
      await collectRichTelemetry(disk);
    } catch (error) {
      console.warn('Rich telemetry read failed:', error.message);
      lastRichTelemetryAt = Date.now();
    } finally {
      richTelemetryInFlight = false;
    }
  } else if (!richTelemetryInFlight && Date.now() - lastRichTelemetryAt > RICH_TELEMETRY_INTERVAL_MS) {
    richTelemetryInFlight = true;
    collectRichTelemetry(disk)
      .catch((error) => {
        console.warn('Rich telemetry read failed:', error.message);
      })
      .finally(() => {
        richTelemetryInFlight = false;
      });
  }

  if (!slowMetricsInFlight && Date.now() - lastSlowMetricsAt > SLOW_TELEMETRY_INTERVAL_MS) {
    slowMetricsInFlight = true;
    collectSlowMetrics()
      .catch((error) => {
        console.warn('Slow telemetry read failed:', error.message);
        lastSlowMetricsAt = Date.now();
      })
      .finally(() => {
        slowMetricsInFlight = false;
      });
  }

  return {
    cpu,
    ram,
    gpu: slowMetricsCache.gpu,
    disk,
    netDown: normalizeBytesPerSecond(network.rx, 60 * 1024 * 1024),
    netUp: normalizeBytesPerSecond(network.tx, 25 * 1024 * 1024),
    temperature: slowMetricsCache.temperature,
    processes: richTelemetryCache.processes,
    drives: richTelemetryCache.drives
  };
}

const server = new WebSocketServer({ host: HOST, port: PORT });

server.on('listening', () => {
  console.log(`Reactive Source Tree telemetry helper listening on ws://${HOST}:${PORT}`);
});

server.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', ok: true }));
});

async function broadcastTelemetry() {
  if (server.clients.size === 0) return;

  try {
    const telemetry = await collectTelemetry();
    const payload = JSON.stringify(telemetry);
    for (const client of server.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  } catch (error) {
    console.warn('Telemetry read failed:', error.message);
  }
}

setInterval(broadcastTelemetry, UPDATE_INTERVAL_MS);

// Stop the performance-counter stream promptly on a graceful shutdown (Ctrl+C / SIGTERM)
// so it does not linger after the helper exits.
function shutdown() {
  processCounterSampler.stop();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', () => processCounterSampler.stop());
