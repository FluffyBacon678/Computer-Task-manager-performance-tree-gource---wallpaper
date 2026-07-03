import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
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
