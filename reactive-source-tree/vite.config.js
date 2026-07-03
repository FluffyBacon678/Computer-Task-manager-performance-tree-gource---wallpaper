import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// Dev-only screenshot bridge: POST a canvas dataURL to /__shot and it lands in
// .dev-shots/ as a JPEG. The wallpaper runs in a hidden preview tab where rAF is paused
// and normal screenshots time out; with this, tooling can pump frames via window.__rst,
// extract the stage, and save a real frame for inspection.
const shotBridge = {
  name: 'dev-shot-bridge',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__shot', (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('POST a data:image/... URL');
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const base64 = body.replace(/^data:image\/\w+;base64,/, '');
          const dir = join(server.config.root, '.dev-shots');
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `shot-${Date.now()}.jpg`);
          writeFileSync(file, Buffer.from(base64, 'base64'));
          res.end(file);
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
    });
  }
};

export default defineConfig({
  base: './',
  plugins: [shotBridge],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    // Honor an assigned port (e.g. from the preview tool) so the dev server doesn't collide
    // with other Vite servers already on 5173.
    port: Number(process.env.PORT) || 5173
  }
});
