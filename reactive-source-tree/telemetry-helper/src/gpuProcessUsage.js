import { spawn } from 'node:child_process';

/**
 * Best-effort per-process GPU usage for Windows.
 *
 * systeminformation does not expose per-process GPU load, but Windows publishes the
 * exact counters Task Manager uses: `\GPU Engine(pid_<pid>_..._engtype_<x>)\Utilization
 * Percentage`. We read them through `powershell Get-Counter`, which works WITHOUT admin
 * rights and WITHOUT any network access.
 *
 * Caveats (this is intentionally best-effort, never required):
 *  - The English counter name ("GPU Engine"/"Utilization Percentage") can differ on
 *    localized Windows installs; if the query fails we simply fall back to no GPU data.
 *  - Each Get-Counter call spawns a short-lived PowerShell process (~1-2s), so we sample
 *    on a slow interval and only ever return a cached snapshot (never blocking telemetry).
 *  - After repeated failures the sampler disables itself so it never wastes CPU on
 *    machines where the counter is unavailable.
 *
 * Disable explicitly with the env var RST_PER_PROCESS_GPU=0.
 *
 * Note on per-process DISK: Windows only exposes `\Process(name)\IO Data Bytes/sec`,
 * which is keyed by process *name* (with #1/#2 suffixes for duplicates), bundles file +
 * network + device I/O together, and has no stable normalization ceiling. It cannot be
 * mapped back to PIDs reliably, so per-process disk is deliberately left as CPU/RAM-only.
 */

// Aggregates the per-engine GPU samples to a single max-utilisation percentage per PID,
// mirroring how Task Manager reports a process's GPU column.
const PS_SCRIPT = `$ErrorActionPreference='Stop'
try {
  $samples = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples
  $byPid = @{}
  foreach ($s in $samples) {
    if ($s.InstanceName -match 'pid_(\\d+)') {
      $p = [int]$Matches[1]
      $v = [double]$s.CookedValue
      if (-not $byPid.ContainsKey($p) -or $byPid[$p] -lt $v) { $byPid[$p] = $v }
    }
  }
  foreach ($k in $byPid.Keys) { '{0} {1}' -f $k, ([math]::Round($byPid[$k], 2)) }
} catch { exit 2 }`;

export class GpuProcessSampler {
  constructor({ intervalMs = 2500, timeoutMs = 6000 } = {}) {
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.usageByPid = new Map();
    this.lastStartedAt = 0;
    this.inFlight = false;
    this.failureCount = 0;
    this.loggedDisabled = false;
    this.loggedReady = false;

    const envFlag = process.env.RST_PER_PROCESS_GPU;
    const optedOut = envFlag === '0' || envFlag === 'false' || envFlag === 'off';
    this.enabled = process.platform === 'win32' && !optedOut;
  }

  /**
   * Returns the most recent per-PID GPU usage (percent 0..100). Never blocks: it kicks
   * off an async refresh when the cache is stale and returns whatever is cached now.
   */
  sample() {
    if (this.enabled && !this.inFlight && Date.now() - this.lastStartedAt >= this.intervalMs) {
      this.refresh();
    }
    return this.usageByPid;
  }

  refresh() {
    this.inFlight = true;
    this.lastStartedAt = Date.now();

    let child;
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
        { windowsHide: true }
      );
    } catch (error) {
      this.handleFailure(error.message);
      return;
    }

    let stdout = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }, this.timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      this.handleFailure(error.message);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      this.inFlight = false;
      if (code !== 0) {
        this.handleFailure(`exit code ${code}`);
        return;
      }
      this.usageByPid = this.parse(stdout);
      this.failureCount = 0;
      if (!this.loggedReady) {
        console.log(`Per-process GPU telemetry ready: ${this.usageByPid.size} processes`);
        this.loggedReady = true;
      }
    });
  }

  parse(text) {
    const map = new Map();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [pidRaw, valueRaw] = trimmed.split(/\s+/);
      const pid = Number.parseInt(pidRaw, 10);
      const value = Number.parseFloat(valueRaw);
      if (Number.isFinite(pid) && Number.isFinite(value)) {
        map.set(pid, value);
      }
    }
    return map;
  }

  handleFailure(message) {
    this.inFlight = false;
    this.failureCount += 1;
    if (this.failureCount >= 3) {
      this.enabled = false;
      if (!this.loggedDisabled) {
        console.warn(`Per-process GPU telemetry disabled (counter unavailable: ${message}).`);
        this.loggedDisabled = true;
      }
    }
  }
}
