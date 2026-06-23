import { Application, BLEND_MODES, Container, Graphics } from 'pixi.js';
import { ActivityState } from './state/ActivityState.js';
import { ActorSystem } from './particles/ActorSystem.js';
import { BackgroundRenderer } from './visuals/BackgroundRenderer.js';
import { BeamSystem } from './particles/BeamSystem.js';
import { CameraController } from './visuals/CameraController.js';
import { DemoSignalGenerator } from './state/DemoSignalGenerator.js';
import { EdgeParticleSystem } from './particles/EdgeParticleSystem.js';
import { GraphLayout } from './graph/GraphLayout.js';
import { GraphModel } from './graph/GraphModel.js';
import { GraphRenderer } from './graph/GraphRenderer.js';
import { HoverController } from './state/HoverController.js';
import { Palette } from './visuals/Palette.js';
import { OverlayHud } from './visuals/OverlayHud.js';
import { ParticleSystem } from './particles/ParticleSystem.js';
import { PerformanceMonitor } from './utils/PerformanceMonitor.js';
import { PointerInput } from './state/PointerInput.js';
import { PulseSystem } from './particles/PulseSystem.js';
import { ResizeHandler } from './utils/ResizeHandler.js';
import { SparkleSystem } from './particles/SparkleSystem.js';
import { TelemetryWebSocketInput } from './state/TelemetryWebSocketInput.js';
import { WallpaperAudioInput } from './state/WallpaperAudioInput.js';
import { WallpaperProperties } from './state/WallpaperProperties.js';

const debugOverlay = document.getElementById('debug-overlay');

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

const propertyManager = new WallpaperProperties(handleConfigChange);
const config = propertyManager.config;
const palette = new Palette(config.paletteMode);
const activityState = new ActivityState();
const performanceMonitor = new PerformanceMonitor();

const backgroundLayer = new Container();
const worldLayer = new Container();
const graphLineLayer = new Container();
const glowLayer = new Container();
const particleLayer = new Container();
const pulseLayer = new Container();
const nodeLayer = new Container();
const uiLayer = new Container();

graphLineLayer.blendMode = BLEND_MODES.ADD;
glowLayer.blendMode = BLEND_MODES.ADD;
particleLayer.blendMode = BLEND_MODES.ADD;
pulseLayer.blendMode = BLEND_MODES.ADD;
nodeLayer.blendMode = BLEND_MODES.ADD;

worldLayer.addChild(graphLineLayer, glowLayer, particleLayer, pulseLayer, nodeLayer, uiLayer);
app.stage.addChild(backgroundLayer, worldLayer);

const layers = {
  backgroundLayer,
  graphLineLayer,
  glowLayer,
  nodeLayer,
  particleLayer,
  pulseLayer,
  uiLayer
};

const backgroundRenderer = new BackgroundRenderer(backgroundLayer, palette, window.innerWidth, window.innerHeight);
const cameraController = new CameraController(worldLayer, window.innerWidth, window.innerHeight);
const graphModel = new GraphModel(config, palette);
const graphLayout = new GraphLayout(graphModel, activityState, config);
graphLayout.step(60);

const graphRenderer = new GraphRenderer(layers, palette);
const particleSystem = new ParticleSystem(particleLayer, palette);
const edgeParticleSystem = new EdgeParticleSystem(particleLayer, palette);
const pulseSystem = new PulseSystem(pulseLayer, palette);
const beamSystem = new BeamSystem(pulseLayer, palette);
const actorSystem = new ActorSystem(nodeLayer, palette);
const sparkleSystem = new SparkleSystem(particleLayer, palette);
const overlayHud = new OverlayHud(palette);
const demoSignalGenerator = new DemoSignalGenerator(activityState);
const audioInput = new WallpaperAudioInput(activityState, config);
const telemetryInput = new TelemetryWebSocketInput(activityState, config);
const pointerInput = new PointerInput();
const hoverController = new HoverController();

const cursorGraphics = new Graphics();
glowLayer.addChild(cursorGraphics);

new ResizeHandler(app, (width, height) => {
  backgroundRenderer.resize(width, height);
  cameraController.resize(width, height);
});

let time = 0;
let debugAccumulator = 0;
let telemetrySyncAccumulator = 0;

function handleConfigChange(nextConfig) {
  if (!nextConfig) return;
  palette.setMode(nextConfig.paletteMode);
  backgroundRenderer?.setPalette(palette);
  graphRenderer?.setPalette(palette);
  particleSystem?.setPalette(palette);
  edgeParticleSystem?.setPalette(palette);
  pulseSystem?.setPalette(palette);
  beamSystem?.setPalette(palette);
  actorSystem?.setPalette(palette);
  sparkleSystem?.setPalette(palette);
  overlayHud?.setPalette(palette);

  if (graphModel?.maybeRebuild(nextConfig, palette)) {
    graphLayout.reset(graphModel, activityState, nextConfig);
  }
}

function updateDebugOverlay(dt) {
  if (!debugOverlay) return;
  debugOverlay.style.display = config.debugOverlay ? 'block' : 'none';
  if (!config.debugOverlay) return;

  debugAccumulator += dt;
  if (debugAccumulator < 0.18) return;
  debugAccumulator = 0;

  const snapshot = activityState.snapshot();
  debugOverlay.textContent = [
    'Reactive Source Tree',
    `fps ${performanceMonitor.fps.toFixed(1)} | nodes ${performanceMonitor.nodeCount} | particles ${performanceMonitor.activeParticles}`,
    `telemetry ${performanceMonitor.telemetryStatus} | proc ${telemetryInput.liveTree.processes.length} | audio ${audioInput.hasRecentAudio() ? 'live' : 'demo'}`,
    `cpu ${snapshot.cpu.toFixed(2)}  ram ${snapshot.ram.toFixed(2)}  gpu ${snapshot.gpu.toFixed(2)}`,
    `disk ${snapshot.disk.toFixed(2)}  net ${Math.max(snapshot.netDown, snapshot.netUp).toFixed(2)}  temp ${snapshot.temperature.toFixed(2)}`,
    `bass ${snapshot.audioBass.toFixed(2)}  mid ${snapshot.audioMid.toFixed(2)}  treble ${snapshot.audioTreble.toFixed(2)}`
  ].join('\n');
}

app.ticker.add(() => {
  const rawDt = Math.min(app.ticker.deltaMS / 1000, 0.05);
  const dt = rawDt * config.animationSpeed;
  time += dt;
  graphModel.now = time;

  telemetryInput.update();
  telemetrySyncAccumulator += rawDt;
  if (telemetrySyncAccumulator >= (config.lowPerformanceMode ? 1.4 : 0.9)) {
    telemetrySyncAccumulator = 0;
    if (graphModel.syncTelemetry(telemetryInput.liveTree, config, palette)) {
      graphLayout.syncTopology(graphModel);
    }
  }

  demoSignalGenerator.update(rawDt, {
    animationSpeed: config.animationSpeed,
    enableAudio: config.enableAudio,
    hasAudio: audioInput.hasRecentAudio()
  });

  activityState.update(rawDt, config.animationSpeed);
  graphModel.updateActivities(activityState, palette, rawDt);

  pointerInput.update(rawDt);
  const cameraScale = cameraController.scale || 1;
  const pointerWorldX = (pointerInput.x - cameraController.x) / cameraScale;
  const pointerWorldY = (pointerInput.y - cameraController.y) / cameraScale;
  const pointerActive = pointerInput.influence > 0.01 && config.mouseInteraction !== 'off';
  hoverController.update(
    graphModel,
    pointerWorldX,
    pointerWorldY,
    pointerActive && config.mouseInteraction === 'focus',
    rawDt
  );
  graphLayout.setPointer(
    pointerWorldX,
    pointerWorldY,
    pointerActive,
    config.mouseInteraction,
    60 * config.mouseStrength * config.intensity * pointerInput.influence,
    240
  );
  graphLayout.pointer.focusStrength = 46 * config.mouseStrength * config.intensity * pointerInput.influence;
  graphLayout.pointer.focusRadius = 150;

  graphLayout.step(config.lowPerformanceMode ? 1 : 2);
  cameraController.update(activityState, config, time, rawDt);

  backgroundRenderer.render(activityState, config, time);
  edgeParticleSystem.update(graphModel, activityState, config, dt);
  particleSystem.update(graphModel, activityState, config, dt);
  pulseSystem.update(graphModel, activityState, config, dt);
  actorSystem.update(graphModel, beamSystem, config, dt);
  beamSystem.update(graphModel, config, dt);
  sparkleSystem.update(graphModel, activityState, config, dt);

  graphRenderer.render(graphModel, activityState, config, time, rawDt);
  edgeParticleSystem.render(time, config);
  particleSystem.render(config);
  pulseSystem.render(config);
  beamSystem.render(config);
  actorSystem.render(config);
  sparkleSystem.render(config);
  overlayHud.update(activityState, config, rawDt);

  cursorGraphics.clear();
  if (pointerActive) {
    const cursorColor = config.mouseInteraction === 'repel' ? palette.colors.audio : palette.colors.coreAccent;
    const cursorAlpha = pointerInput.influence;
    cursorGraphics.lineStyle(1.4, cursorColor, 0.42 * cursorAlpha);
    cursorGraphics.drawCircle(pointerWorldX, pointerWorldY, 15 + Math.sin(time * 4) * 3);
    cursorGraphics.lineStyle(0.7, cursorColor, 0.18 * cursorAlpha);
    cursorGraphics.drawCircle(pointerWorldX, pointerWorldY, 28);
  }

  performanceMonitor.update(rawDt);
  performanceMonitor.setStats({
    activeParticles:
      edgeParticleSystem.activeCount() +
      particleSystem.activeCount() +
      pulseSystem.activeCount() +
      beamSystem.activeCount() +
      sparkleSystem.activeCount(),
    nodeCount: graphModel.nodes.length,
    telemetryStatus: telemetryInput.status
  });
  updateDebugOverlay(rawDt);
});
