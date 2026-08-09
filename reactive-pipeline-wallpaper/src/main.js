import { Application } from 'pixi.js';
import { DEFAULT_CONFIG } from './config.js';
import { PipelineModel } from './pipeline/PipelineModel.js';
import { ActivityState } from './state/ActivityState.js';
import { DemoTelemetry } from './state/DemoTelemetry.js';
import { PointerInput } from './state/PointerInput.js';
import { TelemetryWebSocketInput } from './state/TelemetryWebSocketInput.js';
import { PipelineRenderer } from './visuals/PipelineRenderer.js';
import { clamp, formatPercent } from './utils/MathUtils.js';

const config = { ...DEFAULT_CONFIG };
const app = new Application({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  powerPreference: 'high-performance'
});

document.body.appendChild(app.view);

const activityState = new ActivityState();
const telemetryInput = new TelemetryWebSocketInput(config);
const demoTelemetry = new DemoTelemetry();
const pointerInput = new PointerInput();
const model = new PipelineModel(config);
const renderer = new PipelineRenderer(app.stage);
const hud = document.getElementById('hud');
const hudStatus = document.getElementById('hud-status');
const hudLoad = document.getElementById('hud-load');

let time = 0;
let syncAccumulator = 1;
let hudAccumulator = 1;

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

function applyUserProperties(properties = {}) {
  config.intensity = clamp(Number(propertyValue(properties.intensity, config.intensity)), 0.25, 2);
  config.maxProcesses = Math.round(clamp(Number(propertyValue(properties.max_processes, config.maxProcesses)), 8, 44));
  config.showLabels = toBool(propertyValue(properties.show_labels, config.showLabels), config.showLabels);
  config.enableTelemetry = toBool(propertyValue(properties.enable_telemetry, config.enableTelemetry), config.enableTelemetry);
  config.showHud = toBool(propertyValue(properties.show_hud, config.showHud), config.showHud);
  config.animationSpeed = clamp(Number(propertyValue(properties.animation_speed, config.animationSpeed)), 0.25, 2);
  const telemetryUrl = propertyValue(properties.telemetry_url, config.telemetryUrl);
  if (typeof telemetryUrl === 'string' && telemetryUrl.trim()) config.telemetryUrl = telemetryUrl.trim();
}

function installWallpaperProperties() {
  const existing = window.wallpaperPropertyListener ?? {};
  window.wallpaperPropertyListener = {
    ...existing,
    applyUserProperties(properties) {
      existing.applyUserProperties?.(properties);
      applyUserProperties(properties);
    }
  };
}

function resize() {
  app.renderer.resize(window.innerWidth, window.innerHeight);
  model.setSize(window.innerWidth, window.innerHeight);
}

function liveSource() {
  const hasLiveProcesses = telemetryInput.liveTree.processes.length > 0;
  const liveEnough = telemetryInput.status === 'connected' || telemetryInput.status === 'stale';
  return liveEnough && hasLiveProcesses ? telemetryInput : demoTelemetry;
}

function updateHud(source, dt) {
  if (!hud) return;
  hud.style.display = config.showHud ? 'block' : 'none';
  if (!config.showHud) return;

  hudAccumulator += dt;
  if (hudAccumulator < 0.18) return;
  hudAccumulator = 0;

  if (hudStatus) {
    const mode = source === telemetryInput ? telemetryInput.status.toUpperCase() : 'DEMO';
    hudStatus.textContent = `TELEMETRY ${mode}  TASKS ${model.tasks.filter((task) => !task.dying).length}`;
  }
  if (hudLoad) {
    hudLoad.textContent = `LOAD ${formatPercent(activityState.value('overallLoad'))}`;
  }
}

installWallpaperProperties();
resize();
window.addEventListener('resize', resize);

app.ticker.add(() => {
  const rawDt = Math.min(app.ticker.deltaMS / 1000, 0.05);
  const dt = rawDt * config.animationSpeed;
  time += dt;

  telemetryInput.update();
  demoTelemetry.update(rawDt);
  const source = liveSource();
  activityState.merge(source.metrics, source === telemetryInput ? 1 : 0.8);
  activityState.update(rawDt);

  syncAccumulator += rawDt;
  if (syncAccumulator >= 0.25) {
    syncAccumulator = 0;
    model.sync(source.liveTree, config);
  }

  model.update(dt, activityState, pointerInput);
  renderer.render(model, activityState, config, time);
  updateHud(source, rawDt);
  pointerInput.endFrame();
});

window.__pipeline = { app, config, activityState, model, telemetryInput, demoTelemetry };

