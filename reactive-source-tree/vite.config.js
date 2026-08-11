import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// Inline the built JS into index.html as a single CLASSIC <script> (not type="module").
// Wallpaper Engine's desktop wallpaper renderer loads from file:// and does not reliably
// execute ES-module scripts there — even an inlined `<script type="module">` runs in the
// editor's CEF but leaves the applied wallpaper black. A classic IIFE script executes in
// every context. Paired with rollup output { format: 'iife', inlineDynamicImports: true }
// this collapses the whole app (incl. the lazy bloom chunk) into one classic script, so
// the built index.html is fully self-contained with zero module semantics and zero
// external fetches — the format every working WE web wallpaper uses.
const inlineClassicScript = {
  name: 'inline-classic-script',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    let htmlKey = null;
    let html = null;
    let jsKey = null;
    let jsCode = null;
    for (const [key, item] of Object.entries(bundle)) {
      if (item.type === 'asset' && key.endsWith('.html')) {
        htmlKey = key;
        html = String(item.source);
      } else if (item.type === 'chunk' && item.isEntry) {
        jsKey = key;
        jsCode = item.code;
      }
    }
    if (htmlKey == null || jsKey == null) return;
    // Escape any literal "</script>" inside the code so it can't close the tag early.
    const safeCode = jsCode.replace(/<\/script>/gi, '<\\/script>');
    const inlineTag = `<script>${safeCode}</script>`;
    // Remove Vite's injected external script + any modulepreload hints, then place the
    // inline classic script at the END of <body>. A classic (non-deferred) inline script
    // runs synchronously where it sits; in <head> that is BEFORE <body> exists, so the
    // app's document.body.appendChild(canvas) would throw. End-of-body guarantees the DOM
    // (canvas host + hud/overlay divs) is present, matching the deferred-module timing.
    html = html
      .replace(/<link[^>]+rel="modulepreload"[^>]*>\s*/g, '')
      .replace(/\s*<script\b[^>]*\bsrc="[^"]*"[^>]*><\/script>/, '');
    // Use a FUNCTION replacer: a string replacement would interpret `$&`, `$$`, `$\`` etc.
    // in the minified code as special patterns and corrupt the bundle.
    html = html.includes('</body>')
      ? html.replace('</body>', () => `${inlineTag}</body>`)
      : html + inlineTag;
    bundle[htmlKey].source = html;
    delete bundle[jsKey];
  }
};

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
  plugins: [shotBridge, inlineClassicScript],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // One classic-compatible IIFE chunk (no ES-module syntax, dynamic imports folded in),
    // which inlineClassicScript then embeds into index.html as a plain <script>.
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js'
      }
    }
  },
  server: {
    host: '127.0.0.1',
    // Honor an assigned port (e.g. from the preview tool) so the dev server doesn't collide
    // with other Vite servers already on 5173.
    port: Number(process.env.PORT) || 5173
  }
});
