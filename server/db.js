// Simple JSON-file persistence layer.
//
// Why a JSON file instead of SQLite/Postgres:
// - The spec explicitly allows "a local file/JSON store" for this exercise.
// - Zero native dependencies to compile/install -> nothing to break under a deadline.
// - Data model is small and simple (a list of monitored apps + short history arrays),
//   which a single JSON file handles fine.
// - Writes are serialized through a promise chain (see `queue` below) so concurrent
//   requests can't corrupt the file with interleaved writes.
//
// Trade-off (documented in README): this will not scale to many concurrent writers
// or a large number of apps/history entries. Swapping this module for a real DB
// (SQLite via better-sqlite3, or Postgres) would only require changing the functions
// in this file - callers only use the exported functions below, never the file shape.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'apps.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ apps: [], nextId: 1 }, null, 2));
  }
}

function readRaw() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt file safety net: back it up and start fresh rather than crashing the server.
    fs.copyFileSync(DATA_FILE, DATA_FILE + `.corrupt-${Date.now()}`);
    const fresh = { apps: [], nextId: 1 };
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

// Serialize all writes so two near-simultaneous requests can't clobber each other.
let queue = Promise.resolve();
function writeRaw(data) {
  queue = queue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return queue;
}

async function getAllApps() {
  return readRaw().apps;
}

async function getApp(id) {
  return readRaw().apps.find((a) => a.id === id) || null;
}

async function addApp({ name, url, checkIntervalMs }) {
  const data = readRaw();
  const app = {
    id: data.nextId,
    name,
    url,
    status: 'unknown', // 'unknown' | 'up' | 'down'
    lastChecked: null,
    lastResponseTimeMs: null,
    lastError: null,
    checkIntervalMs: checkIntervalMs || null, // null => use global default
    createdAt: new Date().toISOString(),
    history: [], // [{ timestamp, status, responseTimeMs, error }]
  };
  data.apps.push(app);
  data.nextId += 1;
  await writeRaw(data);
  return app;
}

async function updateApp(id, fields) {
  const data = readRaw();
  const app = data.apps.find((a) => a.id === id);
  if (!app) return null;
  Object.assign(app, fields);
  await writeRaw(data);
  return app;
}

async function removeApp(id) {
  const data = readRaw();
  const before = data.apps.length;
  data.apps = data.apps.filter((a) => a.id !== id);
  await writeRaw(data);
  return data.apps.length < before;
}

async function recordCheckResult(id, result, historyLimit) {
  const data = readRaw();
  const app = data.apps.find((a) => a.id === id);
  if (!app) return null;

  app.status = result.status;
  app.lastChecked = result.timestamp;
  app.lastResponseTimeMs = result.responseTimeMs;
  app.lastError = result.error || null;

  app.history.push({
    timestamp: result.timestamp,
    status: result.status,
    responseTimeMs: result.responseTimeMs,
    error: result.error || null,
  });
  // Cap history length so the file doesn't grow unbounded.
  if (app.history.length > historyLimit) {
    app.history = app.history.slice(app.history.length - historyLimit);
  }

  await writeRaw(data);
  return app;
}

module.exports = {
  getAllApps,
  getApp,
  addApp,
  updateApp,
  removeApp,
  recordCheckResult,
};
