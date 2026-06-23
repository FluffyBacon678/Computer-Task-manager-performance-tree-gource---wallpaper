import { DEFAULT_CONFIG } from '../config.js';
import { clamp } from '../utils/MathUtils.js';

function propertyValue(property, fallback) {
  if (!property || property.value === undefined || property.value === null) return fallback;
  return property.value;
}

function toBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value === 'true';
}

export class WallpaperProperties {
  constructor(onChange) {
    this.config = { ...DEFAULT_CONFIG };
    this.onChange = onChange;
    this.installListener();
  }

  installListener() {
    if (typeof window === 'undefined') return;

    const existing = window.wallpaperPropertyListener ?? {};
    window.wallpaperPropertyListener = {
      ...existing,
      applyUserProperties: (properties) => {
        existing.applyUserProperties?.(properties);
        this.apply(properties);
      }
    };
  }

  apply(properties = {}) {
    const c = this.config;
    c.intensity = clamp(Number(propertyValue(properties.intensity, c.intensity)), 0.2, 2);
    c.particleAmount = clamp(Number(propertyValue(properties.particle_amount, c.particleAmount)), 0.2, 2);
    c.graphDensity = clamp(Number(propertyValue(properties.graph_density, c.graphDensity)), 0.4, 1.8);
    c.glowStrength = clamp(Number(propertyValue(properties.glow_strength, c.glowStrength)), 0, 2);
    c.animationSpeed = clamp(Number(propertyValue(properties.animation_speed, c.animationSpeed)), 0.25, 2);
    c.cameraDrift = toBool(propertyValue(properties.camera_drift, c.cameraDrift), c.cameraDrift);
    c.showLabels = toBool(propertyValue(properties.show_labels, c.showLabels), c.showLabels);
    c.showSystemLeafLabels = toBool(
      propertyValue(properties.show_system_leaf_labels, c.showSystemLeafLabels),
      c.showSystemLeafLabels
    );
    c.enableAudio = toBool(propertyValue(properties.enable_audio, c.enableAudio), c.enableAudio);
    c.enableTelemetry = toBool(propertyValue(properties.enable_telemetry, c.enableTelemetry), c.enableTelemetry);
    c.enableLiveProcesses = toBool(
      propertyValue(properties.enable_live_processes, c.enableLiveProcesses),
      c.enableLiveProcesses
    );
    c.enableProcessGpu = toBool(
      propertyValue(properties.enable_process_gpu, c.enableProcessGpu),
      c.enableProcessGpu
    );
    c.showProcessNames = toBool(
      propertyValue(properties.show_process_names, c.showProcessNames),
      c.showProcessNames
    );
    c.maxProcesses = Math.round(
      clamp(Number(propertyValue(properties.max_processes, c.maxProcesses)), 6, 40)
    );
    c.labelDensity = clamp(Number(propertyValue(properties.label_density, c.labelDensity)), 0.3, 1.5);
    c.mouseStrength = clamp(Number(propertyValue(properties.mouse_strength, c.mouseStrength)), 0, 3);

    const mouseMode = propertyValue(properties.mouse_interaction, c.mouseInteraction);
    if (typeof mouseMode === 'string') c.mouseInteraction = mouseMode;

    c.showHud = toBool(propertyValue(properties.show_hud, c.showHud), c.showHud);
    c.enableActor = toBool(propertyValue(properties.enable_actor, c.enableActor), c.enableActor);
    c.debugOverlay = toBool(propertyValue(properties.debug_overlay, c.debugOverlay), c.debugOverlay);
    c.lowPerformanceMode = toBool(
      propertyValue(properties.low_performance_mode, c.lowPerformanceMode),
      c.lowPerformanceMode
    );

    const paletteMode = propertyValue(properties.palette_mode, c.paletteMode);
    if (typeof paletteMode === 'string') c.paletteMode = paletteMode;

    const telemetryUrl = propertyValue(properties.telemetry_url, c.telemetryUrl);
    if (typeof telemetryUrl === 'string' && telemetryUrl.trim()) c.telemetryUrl = telemetryUrl.trim();

    this.onChange?.(this.config);
  }
}
