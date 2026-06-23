import { spawn } from 'node:child_process';

/**
 * Best-effort per-process / per-drive metrics for Windows, from the same performance
 * counters Task Manager uses. Needs NO admin rights and NO network access.
 *
 * Unlike the rest of the helper (which spawns short-lived `si.*` calls), this opens a
 * SINGLE long-lived `powershell Get-Counter -Continuous` process and streams compact
 * frames back. That avoids spawning a new PowerShell every couple of seconds for a
 * wallpaper that runs 24/7, and lets one process feed three metrics at once:
 *
 *   - GPU per process      \GPU Engine(pid_<pid>_..._engtype_*)\Utilization Percentage
 *   - Disk I/O per process  \Process(<name>)\IO Data Bytes/sec  paired with
 *                           \Process(<name>)\ID Process         (to recover the PID)
 *   - Disk I/O per drive    \LogicalDisk(<letter>)\Disk Bytes/sec
 *
 * Robustness notes:
 *   - Get-Counter throws PDH_INVALID_DATA if *any single* instance sample is invalid
 *     (common with hundreds of Process(*) instances). We therefore run with
 *     -ErrorAction SilentlyContinue and keep only samples whose .Status is 0, so one
 *     bad instance never kills the whole stream.
 *   - "Counters unavailable" (e.g. localized Windows where the English counter names
 *     differ) is detected by a no-data watchdog: if no frame arrives shortly after
 *     start, it counts as a failure. After a few failures the sampler disables itself.
 *   - When no client has asked for data recently, the stream is stopped and restarted
 *     on demand.
 *   - Disable explicitly with env var RST_PER_PROCESS_GPU=0.
 *
 * Caveats: GPU% is the max engine utilisation per PID (Task-Manager style). Per-process
 * "disk" is really IO Data Bytes/sec, which bundles file + network + device I/O; it is
 * mapped to a 0..1 share by the consumer using a fixed throughput ceiling, so treat it
 * as an approximate I/O indicator rather than a precise disk figure.
 */

// PowerShell streaming aggregator. One frame per sample interval, three prefixed lines:
//   GPU   <pid>:<percent>,...
//   PDISK <pid>:<bytesPerSec>,...
//   LDISK <drive>:<bytesPerSec>,...
// NOTE: never use $pid (read-only automatic variable) — we use $procId.
const PS_SCRIPT = `$parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId
Get-Counter -Counter @(
  '\\GPU Engine(*)\\Utilization Percentage',
  '\\Process(*)\\ID Process',
  '\\Process(*)\\IO Data Bytes/sec',
  '\\LogicalDisk(*)\\Disk Bytes/sec'
) -Continuous -SampleInterval 2 -ErrorAction SilentlyContinue | ForEach-Object {
  # Self-terminate if the helper that launched us is gone, so a killed helper never
  # leaves an orphaned Get-Counter stream running in the background.
  if ($parentPid -and -not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) { break }
  $gpu = @{}
  $idByInstance = @{}
  $ioByInstance = @{}
  $ldisk = @{}
  foreach ($s in $_.CounterSamples) {
    if ($s.Status -ne 0) { continue }
    $path = $s.Path
    if ($path -like '*gpu engine*') {
      if ($s.InstanceName -match 'pid_(\\d+)') {
        $procId = [int]$Matches[1]; $v = [double]$s.CookedValue
        if (-not $gpu.ContainsKey($procId) -or $gpu[$procId] -lt $v) { $gpu[$procId] = $v }
      }
    } elseif ($path -like '*\\id process') {
      $idByInstance[$s.InstanceName] = [int]$s.CookedValue
    } elseif ($path -like '*io data bytes/sec') {
      $ioByInstance[$s.InstanceName] = [double]$s.CookedValue
    } elseif ($path -like '*logicaldisk*') {
      if ($s.InstanceName -ne '_total') { $ldisk[$s.InstanceName] = [double]$s.CookedValue }
    }
  }
  $g = ($gpu.GetEnumerator() | ForEach-Object { '{0}:{1}' -f $_.Key, ([math]::Round($_.Value, 2)) }) -join ','
  # [Console]::WriteLine streams straight to stdout; Write-Output gets buffered in a
  # -Continuous pipeline and never reaches the parent until the process ends.
  [Console]::WriteLine('GPU ' + $g)
  $pd = @{}
  foreach ($k in $ioByInstance.Keys) {
    if ($idByInstance.ContainsKey($k)) {
      $procId = $idByInstance[$k]
      if ($procId -gt 0) {
        if (-not $pd.ContainsKey($procId) -or $pd[$procId] -lt $ioByInstance[$k]) { $pd[$procId] = $ioByInstance[$k] }
      }
    }
  }
  $p = ($pd.GetEnumerator() | ForEach-Object { '{0}:{1}' -f $_.Key, ([math]::Round($_.Value, 0)) }) -join ','
  [Console]::WriteLine('PDISK ' + $p)
  $l = ($ldisk.GetEnumerator() | ForEach-Object { '{0}:{1}' -f $_.Key, ([math]::Round($_.Value, 0)) }) -join ','
  [Console]::WriteLine('LDISK ' + $l)
}`;

export class ProcessCounterSampler {
  constructor({ idleTimeoutMs = 15000, restartBackoffMs = 5000, firstFrameMs = 12000, maxFailures = 3 } = {}) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.restartBackoffMs = restartBackoffMs;
    this.firstFrameMs = firstFrameMs;
    this.maxFailures = maxFailures;

    this.gpuByPid = new Map(); // pid -> percent 0..100
    this.diskByPid = new Map(); // pid -> bytes/sec
    this.ldiskByName = new Map(); // drive letter (e.g. "c:") -> bytes/sec

    this.child = null;
    this.buffer = '';
    this.stopping = false;
    this.gotFrame = false;
    this.firstFrameTimer = null;
    this.lastSampleRequestAt = 0;
    this.restartAt = 0;
    this.failureCount = 0;
    this.loggedReady = false;
    this.loggedDisabled = false;

    const envFlag = process.env.RST_PER_PROCESS_GPU;
    const optedOut = envFlag === '0' || envFlag === 'false' || envFlag === 'off';
    this.enabled = process.platform === 'win32' && !optedOut;
  }

  /**
   * Returns the latest cached metric maps. Lazily (re)starts the streaming counter
   * process when data is requested and it is not already running. Never blocks.
   */
  sample() {
    this.lastSampleRequestAt = Date.now();
    if (this.enabled && !this.child && Date.now() >= this.restartAt) {
      this.start();
    }
    return { gpuByPid: this.gpuByPid, diskByPid: this.diskByPid, ldiskByName: this.ldiskByName };
  }

  start() {
    this.stopping = false;
    this.gotFrame = false;
    this.buffer = '';

    let child;
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
        { windowsHide: true }
      );
    } catch (error) {
      this.onExit(`spawn error: ${error.message}`);
      return;
    }

    this.child = child;
    child.stdout?.on('data', (chunk) => this.onData(chunk.toString()));
    child.on('error', (error) => this.onExit(`spawn error: ${error.message}`));
    child.on('close', (code) => this.onExit(code === 0 ? null : `exit code ${code}`));

    // Counters that never produce a frame (e.g. localized Windows) are treated as a
    // failure: kill the child so onExit counts it toward disabling.
    this.firstFrameTimer = setTimeout(() => {
      if (!this.gotFrame && this.child) {
        try {
          this.child.kill();
        } catch {
          /* already gone */
        }
      }
    }, this.firstFrameMs);
  }

  onData(text) {
    this.buffer += text;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.parseLine(line);
    }

    if (Date.now() - this.lastSampleRequestAt > this.idleTimeoutMs) {
      this.stop(); // no client is listening; stop streaming until asked again
    }
  }

  parseLine(line) {
    const space = line.indexOf(' ');
    if (space < 0) return;
    const kind = line.slice(0, space);
    const body = line.slice(space + 1).trim();
    if (kind === 'GPU') {
      this.gpuByPid = this.parsePairs(body, (k) => Number.parseInt(k, 10));
    } else if (kind === 'PDISK') {
      this.diskByPid = this.parsePairs(body, (k) => Number.parseInt(k, 10));
    } else if (kind === 'LDISK') {
      this.ldiskByName = this.parsePairs(body, (k) => k.toLowerCase());
    } else {
      return;
    }

    // First valid frame: the counters work. Clear the watchdog and reset failures.
    if (!this.gotFrame) {
      this.gotFrame = true;
      clearTimeout(this.firstFrameTimer);
      this.firstFrameTimer = null;
    }
    this.failureCount = 0;
    if (kind === 'LDISK' && !this.loggedReady) {
      console.log(
        `Per-process counters ready: ${this.gpuByPid.size} GPU, ${this.diskByPid.size} disk, ${this.ldiskByName.size} drives`
      );
      this.loggedReady = true;
    }
  }

  parsePairs(body, keyFn) {
    const map = new Map();
    if (!body) return map;
    for (const pair of body.split(',')) {
      const colon = pair.lastIndexOf(':');
      if (colon < 0) continue;
      const key = keyFn(pair.slice(0, colon));
      const value = Number.parseFloat(pair.slice(colon + 1));
      if ((typeof key === 'number' ? Number.isFinite(key) : key) && Number.isFinite(value)) {
        map.set(key, value);
      }
    }
    return map;
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.firstFrameTimer);
    this.firstFrameTimer = null;
    const child = this.child;
    this.child = null;
    if (child) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }

  onExit(reason) {
    clearTimeout(this.firstFrameTimer);
    this.firstFrameTimer = null;
    this.child = null;
    if (this.stopping) {
      this.stopping = false;
      return; // intentional idle stop, not a failure
    }

    this.restartAt = Date.now() + this.restartBackoffMs;
    // Count a failure when the stream never produced data (unsupported counters) or
    // exited abnormally. A clean exit after streaming just schedules a restart.
    if (!this.gotFrame || reason) {
      this.failureCount += 1;
      if (this.failureCount >= this.maxFailures) {
        this.enabled = false;
        if (!this.loggedDisabled) {
          console.warn(`Per-process counters disabled (unavailable: ${reason ?? 'no data'}).`);
          this.loggedDisabled = true;
        }
      }
    }
  }
}
