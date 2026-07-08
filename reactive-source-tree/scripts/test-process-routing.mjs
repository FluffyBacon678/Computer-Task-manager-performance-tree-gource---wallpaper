import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config.js';
import { GraphModel } from '../src/graph/GraphModel.js';
import { HoverController } from '../src/state/HoverController.js';
import { Palette } from '../src/visuals/Palette.js';

const config = {
  ...DEFAULT_CONFIG,
  enableTelemetry: true,
  enableLiveProcesses: true,
  enableProcessGpu: true,
  showProcessNames: true,
  maxProcesses: 8,
  lowPerformanceMode: false
};

const palette = new Palette(config.paletteMode);
const model = new GraphModel(config, palette);
let tick = 0;

function sampleProc(overrides) {
  return {
    pid: 4100,
    name: 'build-worker.exe',
    cpu: 0,
    ram: 0,
    gpu: 0,
    disk: 0,
    threads: 12,
    score: 0.5,
    ...overrides
  };
}

function sync(proc) {
  model.now += 1;
  tick += 1;
  return model.syncTelemetry(
    {
      updatedAt: tick,
      processes: [proc],
      drives: []
    },
    config,
    palette
  );
}

function liveNode() {
  const node = model.nodeById.get('live:proc:4100');
  assert.ok(node, 'expected live process node to exist');
  return node;
}

function parentOf(nodeId) {
  const link = model.links.find((item) => {
    const targetId = typeof item.target === 'string' ? item.target : item.target?.id;
    return item.dynamic && targetId === nodeId;
  });
  assert.ok(link, `expected dynamic parent link for ${nodeId}`);
  return typeof link.source === 'string' ? link.source : link.source.id;
}

function assertHome(expected, message) {
  const node = liveNode();
  assert.equal(node.id, 'live:proc:4100', 'process node keeps a stable id');
  assert.equal(node.category, expected, message);
  assert.equal(parentOf(node.id), expected, `${message}: parent link`);
  return node;
}

assert.equal(sync(sampleProc({ cpu: 0.52, ram: 0.1, score: 0.75 })), true);
const cpuNode = assertHome('cpu', 'CPU-heavy process starts on CPU');
assert.equal(cpuNode.label, 'build-worker.exe');

assert.equal(sync(sampleProc({ cpu: 0.4, ram: 0.75, score: 0.8 })), false);
assertHome('cpu', 'small RAM lead stays on CPU because of hysteresis');

assert.equal(sync(sampleProc({ cpu: 0.2, ram: 0.9, score: 0.92 })), true);
assertHome('ram', 'strong RAM signal moves process to RAM');

assert.equal(sync(sampleProc({ ram: 0.05, gpu: 0.82, score: 0.95 })), true);
assertHome('gpu', 'strong GPU signal moves process to GPU');

assert.equal(sync(sampleProc({ gpu: 0.05, disk: 0.9, score: 0.91 })), true);
const diskNode = assertHome('disk', 'strong DISK signal moves process to DISK');

const controller = new HoverController();
diskNode.x = 100;
diskNode.y = 60;
diskNode.renderX = 100;
diskNode.renderY = 60;
diskNode.renderRadius = 8;

controller.update(model, 104, 60, true, 0.016, { isDown: true });
assert.equal(model.draggedId, diskNode.id, 'pointer-down grabs the process node');
assert.equal(model.focusedId, diskNode.id, 'grabbed node becomes the inspected focus');
assert.equal(diskNode.fx, diskNode.x, 'grabbed node is pinned for inspection');

controller.update(model, 145, 92, true, 0.016, { isDown: true });
assert.equal(diskNode.x, 141, 'grabbed node follows pointer with its original offset');
assert.equal(diskNode.y, 92, 'grabbed node follows pointer vertically');

controller.update(model, 145, 92, true, 0.016, { isDown: false });
assert.equal(model.draggedId, null, 'pointer-up releases the grabbed node');
assert.equal(diskNode.fx, null, 'released node returns to the graph simulation');

console.log('process routing and grab-inspection logic passed');
