import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Served at josephjackman.com/games/shoallhell/. In development the API and co-op relay (server/index.js, port 3031)
// are proxied under the same base path.
const SERVER = process.env.SHOALLHELL_SERVER || 'http://localhost:3031';

/**
 * The version shown on the home screen: package.json's major.minor, the number of commits, and the commit it was
 * built from, e.g. "1.0.12 (68c4b39)". GAME_VERSION overrides it (the Fly.io Docker build has no git history).
 */
function gameVersion(): string {
  if (process.env.GAME_VERSION) return process.env.GAME_VERSION;
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  const [major = '1', minor = '0'] = pkg.version.split('.');
  try {
    const git = (...args: string[]): string => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return `${major}.${minor}.${git('rev-list', '--count', 'HEAD')} (${git('rev-parse', '--short', 'HEAD')})`;
  } catch {
    return pkg.version;
  }
}

export default defineConfig({
  base: '/games/shoallhell/',
  define: {
    __GAME_VERSION__: JSON.stringify(gameVersion()),
  },
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
