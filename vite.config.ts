import { defineConfig } from 'vite';

// Served at josephjackman.com/games/shoallhell/. In development the API and co-op relay (server/index.js, port 3031)
// are proxied under the same base path.
const SERVER = process.env.SHOALLHELL_SERVER || 'http://localhost:3031';

export default defineConfig({
  base: '/games/shoallhell/',
  build: { target: 'es2022', outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 3000 },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/games/shoallhell/api': { target: SERVER, changeOrigin: true },
      '/games/shoallhell/socket.io': { target: SERVER, ws: true, changeOrigin: true },
    },
  },
  preview: { port: 4174 },
});
