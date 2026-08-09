import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config.js';
import { PipelineModel } from '../src/pipeline/PipelineModel.js';
import { ActivityState } from '../src/state/ActivityState.js';

const config = {
  ...DEFAULT_CONFIG,
  maxProcesses: 8
};

const model = new PipelineModel(config);
const activity = new ActivityState();
model.setSize(1000, 600);

let tick = 0;

function proc(overrides) {
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

function sync(process) {
  tick += 1;
  model.sync({ updatedAt: tick, processes: [process], drives: [] }, config);
  model.update(0.016, activity, null);
  return model.taskByPid.get(4100);
}

let task = sync(proc({ cpu: 0.52, ram: 0.1, score: 0.75 }));
assert.equal(task.station, 'cpu', 'CPU-heavy process starts in CPU station');
assert.equal(task.id, 'task:4100', 'task id stays stable');
assert.equal(task.name, 'build-worker.exe', 'task label uses process name');

task = sync(proc({ cpu: 0.4, ram: 0.75, score: 0.8 }));
assert.equal(task.station, 'cpu', 'small RAM lead stays in CPU station through hysteresis');

task = sync(proc({ cpu: 0.2, ram: 0.9, score: 0.92 }));
assert.equal(task.station, 'ram', 'strong RAM signal moves task to memory station');

task = sync(proc({ ram: 0.05, gpu: 0.82, score: 0.95 }));
assert.equal(task.station, 'gpu', 'strong GPU signal moves task to render station');

task = sync(proc({ gpu: 0.05, disk: 0.9, score: 0.91 }));
assert.equal(task.station, 'disk', 'strong DISK signal moves task to storage station');

task.x = 200;
task.y = 150;
model.handlePointer({ x: 202, y: 151, justPressed: true, isDown: true });
assert.equal(model.draggedId, task.id, 'pointer-down grabs a task capsule');
assert.equal(model.focusedId, task.id, 'grabbed task becomes focused');

model.handlePointer({ x: 260, y: 180, justPressed: false, isDown: true });
assert.equal(Math.round(task.x), 258, 'dragged task follows pointer x with original offset');
assert.equal(Math.round(task.y), 179, 'dragged task follows pointer y with original offset');

model.handlePointer({ x: 260, y: 180, justPressed: false, isDown: false });
assert.equal(model.draggedId, null, 'pointer-up releases the task capsule');

console.log('pipeline routing and grab logic passed');

