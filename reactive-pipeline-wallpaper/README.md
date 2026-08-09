# Reactive Pipeline

Reactive Pipeline is a Wallpaper Engine web wallpaper that turns live system telemetry into a moving Task Manager pipeline.

Processes become capsules. Each capsule chooses a station from its current resource profile:

- CPU-heavy tasks enter the CPU scheduler.
- RAM-heavy tasks settle in the memory pool.
- GPU-heavy tasks move through the render station.
- Disk-heavy tasks enter the storage queue.

The telemetry helper is copied from Reactive Source Tree and exposes live process metrics over `ws://127.0.0.1:17890`.

## Browser Test

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5192/`.

## Package

```powershell
npm.cmd run package
```

Import `dist/index.html` into Wallpaper Engine.

## Telemetry Helper

```powershell
cd telemetry-helper
npm.cmd install
npm.cmd start
```

If the helper is not running, the wallpaper uses demo process data so the design still moves.

