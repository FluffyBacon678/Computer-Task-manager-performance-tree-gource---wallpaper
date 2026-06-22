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
- show process names
- telemetry URL
- debug overlay
- low performance mode

The code also handles missing Wallpaper Engine APIs, so it runs normally in a browser.

## Live Tree Model

The wallpaper uses one central `PC` root with subsystem branches. Without telemetry, generated leaves keep the source-tree alive. With telemetry enabled, the helper adds live leaves:

- top CPU processes under `CPU`
- top memory processes under `RAM`
- top GPU processes under `GPU` (when per-process GPU is available, see below)
- top disk processes under `DISK`
- drives such as `C:` under `DISK`
- drive child leaves for `used`, `free`, and `activity`

Live process nodes are the meaningful "balls". They render larger and brighter than the
synthetic structure, scale their size/glow/ring with usage, take their branch colour
(CPU cyan, RAM violet, GPU orange, DISK gold), and carry a bright white core that grows
with load. The synthetic system leaves (`shader`, `threads`, `queue`, …) deliberately
recede into a dim background so they read as structure rather than competing for attention.

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
- **GPU** per process is read on Windows from the same performance counters Task Manager
  uses (`\GPU Engine(*)\Utilization Percentage`), via `Get-Counter`. This needs no admin
  rights and no network access. It is best-effort: the counter name can differ on localized
  Windows installs, so if the query fails the helper silently falls back to CPU/RAM only and
  disables further attempts. Set `RST_PER_PROCESS_GPU=0` to turn it off explicitly.
- **Disk** per process is intentionally not collected. Windows only exposes
  `\Process(name)\IO Data Bytes/sec`, which is keyed by process name (not PID), mixes file +
  network + device I/O, and has no stable normalization, so it cannot be mapped to processes
  reliably. Global disk activity is still shown on the `DISK` branch and drive nodes.

## Performance Tips

- Enable low performance mode to reduce particle counts and glow overdraw.
- Lower particle amount before lowering graph density; the graph still looks good with fewer packets.
- Disable labels for the cleanest and fastest wallpaper.
- Wallpaper Engine can cap FPS, and the animation remains designed for 30 FPS.

## Known Limitations

- Global GPU utilization and temperature depend on driver support exposed to Node.js.
- Per-process GPU is best-effort on Windows only and may be unavailable on localized
  installs; per-process disk is not collected (see Per-process metrics above).
- Wallpaper Engine property schemas sometimes need small manual tweaks between versions.
- Without the telemetry helper the graph is a generated PC/system hierarchy; with it
  running, live Task Manager processes become the primary nodes.

## Future Ideas

- GitHub repository visualization mode.
- Media album-art palette mode.
- Interactive mouse attraction.
- Steam Workshop settings presets.
- Multiple visual themes.
- Gource custom-log import mode.
