# Reactive Source Tree

Reactive Source Tree is a Wallpaper Engine web wallpaper inspired by source-tree visualizers. It renders a living PC-system constellation with a central core, CPU/RAM/GPU/Disk/Network/Audio branches, glowing leaf nodes, moving packets, pulses, treble sparkles, background mist, audio reaction, demo activity, and optional local telemetry.

The project is self-contained HTML/CSS/JavaScript. It does not depend on the native Gource application and does not copy Gource source code.

## Run In Browser

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://127.0.0.1:5173/`.

Do not double-click the source `index.html` directly. The source page uses Vite module imports and will not render correctly from a raw `file://` URL.

On Windows, you can also double-click `start-dev.cmd` to start the dev server and open the correct URL automatically.

## Build

```bash
npm run build
```

The browser build is written to `dist/`.

For a Wallpaper Engine-ready folder with metadata and preview copied into `dist/`, run:

```bash
npm run package
```

Import `dist/index.html` in Wallpaper Engine. Use the source project with `npm run dev` for browser development.

## Wallpaper Engine Settings

`project.json` defines the main properties:

- intensity multiplier
- particle amount
- graph density
- glow strength
- animation speed
- camera drift
- labels
- system leaf labels
- palette mode
- audio reaction
- telemetry WebSocket
- live process leaves
- GPU process nodes (let GPU be a process's home branch)
- show process names
- max processes (6–40 most active processes shown)
- label density (how aggressively overlapping labels are hidden)
- mouse interaction (off / focus / attract / repel) and mouse strength
- overlay HUD (clock, date, total load, colour legend)
- scheduler actor (roaming agent that beams the hottest process)
- telemetry URL
- debug overlay
- low performance mode
- render scale (0.5–2× device resolution; lower it to save GPU fill-rate on HiDPI panels)
- adaptive quality (auto-scales particle counts to hold a smooth frame rate)
- bloom (optional real GPU bloom pass over the scene) and bloom strength — off by default

The code also handles missing Wallpaper Engine APIs, so it runs normally in a browser.

## Live Tree Model

The wallpaper uses one central `PC` root with subsystem branches. Without telemetry, generated leaves keep the source-tree alive. With telemetry enabled, the helper adds live nodes:

- each process appears **once**, as a single ball under its busiest resource branch
  (CPU / RAM / GPU / DISK). The choice is weighted so resident memory doesn't pull every
  process onto `RAM`, and it sticks (hysteresis) so balls don't hop branches on small
  fluctuations.
- the ring shows the dominant metric; the label keeps the full `cpu/ram/gpu/disk`
  breakdown, so you still see everything the process is doing.
- drives such as `C:` appear under `DISK` with `used` / `free` / `activity` child nodes.

Only the most active processes are shown — ranked by load up to **Max Processes**, with
near-idle ones dropped, and the set only changes when rankings shift a lot, so it
declutters when busy without flickering.

Live process nodes are the meaningful "balls". They render larger and brighter than the
synthetic structure, scale their size/glow/ring with usage, take their branch colour
(CPU cyan, RAM violet, GPU orange, DISK gold), and carry a bright white core that grows
with load. The hottest process on each branch gets a subtle accent ring. The synthetic
system leaves (`shader`, `threads`, `queue`, …) deliberately recede into a dim background
so they read as structure rather than competing for attention.

Process names are shown by default (`Show Process Names`); disable it to fall back to
generic labels like `cpu_proc_01`.

Node captions are compact two-line labels. The first line names the node, and the second
line shows the current resource values, such as `CPU 42% | RAM 12%` for a process, or
`USED 79%` / `BASS 31%` for system nodes. Labels use small bold monospace text with a dark
stroke so they stay readable against the glow. A greedy anti-overlap pass keeps the graph
uncluttered: when captions collide, the higher-priority one wins (core and branch labels
first, then live processes, then drives, then synthetic leaves) and the loser is hidden.

By default, synthetic system leaves are unlabeled decoration. Real process leaves from the
telemetry helper are labeled and use a circular progress ring to show the resource share
visually. Enable `System Leaf Labels` if you also want the generated subsystem leaves labeled.

## Gource-inspired motion

The wallpaper borrows Gource's *look and feel* — it shares no code with Gource (which is
GPL-3.0):

- **Lifecycle**: live process nodes bloom in with a flash when they appear and shrink/fade
  out when they leave, instead of popping.
- **Flare**: a node lights up when its usage jumps, then decays as it goes idle, so recent
  activity reads brighter — and a big spike fires a directional **beam** from its branch.
- **Scheduler actor**: an optional roaming agent drifts with friction toward the hottest
  process and beams it, the closest analog to Gource's committer avatars.
- **Mouse interaction** (hover only — that is all Wallpaper Engine delivers reliably, since
  clicks and the wheel hit the desktop, not the wallpaper):
  - **Focus** (default): point at a node and it enlarges, brightens, shows a detailed
    readable card (name, full `CPU/RAM/GPU/DISK`, PID + threads), pins in place, and gently
    pushes its neighbours away so you can single it out and read it.
  - **Attract / Repel**: whole-graph modes — nearby nodes are pulled toward or pushed from
    the cursor while it moves.
  - All modes relax when the mouse goes idle.

## Audio

Wallpaper Engine audio is read through `window.wallpaperRegisterAudioListener`. Bass expands the core, mids agitate branches, treble creates sparkles, and volume increases global glow and particles. In a regular browser, demo audio signals keep the wallpaper alive.

## Optional Telemetry

The wallpaper can connect to a local helper at `ws://127.0.0.1:17890`.

```bash
cd telemetry-helper
npm install
npm start
```

After `npm run package`, the helper is also copied to `dist/telemetry-helper` so the packaged folder has the optional local telemetry app next to the wallpaper.

The helper only binds to localhost and only broadcasts local machine stats to the wallpaper. It does not send data to the internet and does not require admin rights.

### Per-process metrics

- **CPU** and **RAM** per process come from the `systeminformation` package and are reliable.
- **GPU**, **disk I/O** (per process), and **per-drive I/O** are read on Windows from the
  same performance counters Task Manager uses, via a single long-lived `Get-Counter
  -Continuous` process (`telemetry-helper/src/processCounters.js`). This needs no admin
  rights and no network access:
  - GPU per process: `\GPU Engine(*)\Utilization Percentage` (max engine per PID).
  - Disk per process: `\Process(*)\IO Data Bytes/sec` paired with `\Process(*)\ID Process`
    to recover the PID. This is *IO Data* (file + network + device), mapped to an
    approximate 0..1 share with a fixed throughput ceiling — treat it as an I/O indicator,
    not a precise disk figure.
  - Per-drive activity: `\LogicalDisk(*)\Disk Bytes/sec`, so each drive pulses with its own
    real throughput instead of a shared global value.
- It is best-effort and self-protecting: invalid counter samples are skipped, and if the
  counters are unavailable (e.g. localized Windows where the English counter names differ)
  the stream produces no data, the sampler retries, and after a few failures disables
  itself and falls back to CPU/RAM only. Set `RST_PER_PROCESS_GPU=0` to turn it off
  explicitly. The stream is also stopped automatically when no wallpaper is connected.

## Performance Tips

- Particles, sparkles, and background dust are drawn as GPU-batched additive sprites of a
  single baked glow texture (`SpriteField` / `GlowTexture`) rather than re-tessellated each
  frame on the CPU — the GPU does the per-pixel work in a few batched draw calls.
- **Adaptive quality** (on by default) watches the frame rate and quietly scales particle
  counts down when the machine can't keep up, then back up when there's headroom — so one
  wallpaper runs smoothly across very different GPUs.
- **Render scale** lowers the internal resolution; on a HiDPI/4K panel dropping it to
  ~0.75 is the single biggest GPU saving with little visible difference under the glow.
- The telemetry helper reads the expensive GPU/temperature metrics on a slow (1.5s) cached
  cadence, keeping only cpu/ram/net/disk on the fast loop.
- Enable low performance mode to reduce particle counts and glow overdraw.
- Lower particle amount before lowering graph density; the graph still looks good with fewer packets.
- Disable labels for the cleanest and fastest wallpaper.
- Wallpaper Engine can cap FPS, and the animation remains designed for 30 FPS.

## Known Limitations

- Global GPU utilization and temperature depend on driver support exposed to Node.js.
- Per-process GPU/disk and per-drive I/O are best-effort on Windows only (performance
  counters) and may be unavailable on localized installs; per-process disk in particular is
  an approximate IO-Data indicator, not a precise disk figure (see Per-process metrics above).
- Wallpaper Engine property schemas sometimes need small manual tweaks between versions.
- Without the telemetry helper the graph is a generated PC/system hierarchy; with it
  running, live Task Manager processes become the primary nodes.

## Future Ideas

- GitHub repository visualization mode.
- Media album-art palette mode.
- Steam Workshop settings presets.
- Multiple visual themes.
- Gource custom-log import mode.
