// Tiny JSON document store (from Roleplay20): everything in memory, written to disk shortly after it changes
// (atomic write: temp file + rename). Plenty for a few hundred players.
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const pending = new Map();
const docs = new Map();

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function writeNow(name) {
  const obj = docs.get(name);
  if (obj === undefined) return;
  const file = filePath(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

export function load(name, fallback) {
  if (docs.has(name)) return docs.get(name);
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`[store] could not read ${name}:`, e.message);
    obj = typeof fallback === 'function' ? fallback() : structuredClone(fallback ?? {});
  }
  docs.set(name, obj);
  return obj;
}

export function save(name, delay = 300) {
  if (pending.has(name)) return;
  pending.set(
    name,
    setTimeout(() => {
      pending.delete(name);
      try {
        writeNow(name);
      } catch (e) {
        console.error(`[store] could not write ${name}:`, e.message);
      }
    }, delay),
  );
}

export function put(name, obj) {
  docs.set(name, obj);
  save(name);
}

/** Write everything still waiting (on shutdown). */
export function flush() {
  for (const [name, t] of pending) {
    clearTimeout(t);
    try {
      writeNow(name);
    } catch (e) {
      console.error(`[store] flush ${name}:`, e.message);
    }
  }
  pending.clear();
}
