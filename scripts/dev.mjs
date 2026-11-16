// npm run dev: the API/co-op server (port 3031) and Vite (port 5174) together. Ctrl+C stops both.
import { spawn } from 'node:child_process';

const kids = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.SHOALLHELL_PORT || '3031' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
const stop = () => {
  for (const k of kids) k.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const k of kids) k.on('exit', (code) => code && stop());
