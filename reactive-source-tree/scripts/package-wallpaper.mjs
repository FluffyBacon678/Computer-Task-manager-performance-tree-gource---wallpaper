import { copyFileSync, cpSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

// Assembles the ready-to-import Wallpaper Engine project in dist/ (run via
// `npm run package`, which builds first): the built bundle plus project.json,
// the real screenshot preview, the README, and the telemetry helper sources
// (without node_modules — end users run `npm install` in the helper folder).

const root = process.cwd();
const dist = join(root, 'dist');

function displayPath(path) {
  return relative(root, path).replaceAll('\\', '/') || '.';
}

copyFileSync(join(root, 'project.json'), join(dist, 'project.json'));
copyFileSync(join(root, 'preview.jpg'), join(dist, 'preview.jpg'));
copyFileSync(join(root, 'README.md'), join(dist, 'README.md'));

const helperSource = join(root, 'telemetry-helper');
const helperTarget = join(dist, 'telemetry-helper');
rmSync(helperTarget, { recursive: true, force: true });
cpSync(helperSource, helperTarget, {
  recursive: true,
  filter: (source) => {
    const normalized = source.replaceAll('\\', '/');
    return !normalized.includes('/node_modules') && !normalized.endsWith('.log');
  }
});

console.log(`Copied metadata and preview to ${displayPath(dist)}`);
console.log(`Copied telemetry helper to ${displayPath(helperTarget)}`);
