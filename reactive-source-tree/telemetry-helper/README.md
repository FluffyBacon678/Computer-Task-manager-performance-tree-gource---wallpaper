# Reactive Source Tree Telemetry Helper

This helper is optional. The wallpaper works without it by using demo signals.

When running, it opens a local-only WebSocket server at `ws://127.0.0.1:17890` and sends normalized CPU, RAM, disk, network, GPU, and temperature values about five times per second. It also samples top CPU/RAM processes and drive usage about once per second so the wallpaper can grow live leaves under CPU, RAM, and DISK.

It does not upload telemetry or contact external servers. Process labels are sent as process names over localhost only; the wallpaper hides those names by default unless `Show Process Names` is enabled.

## Run

```bash
npm install
npm start
```

Close the terminal window to stop the helper. GPU and temperature support depends on what your hardware and drivers expose through the `systeminformation` package; missing values are sent as `null` and the wallpaper falls back gracefully.
