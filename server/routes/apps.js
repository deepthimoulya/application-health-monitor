const express = require('express');
const db = require('../db');
const { checkOneApp } = require('../healthCheck');

const router = express.Router();

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function computeUptimePct(app) {
  if (!app.history || app.history.length === 0) return null;
  const upCount = app.history.filter((h) => h.status === 'up').length;
  return Math.round((upCount / app.history.length) * 1000) / 10; // 1 decimal place
}

function serializeApp(app, { includeHistory = false } = {}) {
  const base = {
    id: app.id,
    name: app.name,
    url: app.url,
    status: app.status,
    lastChecked: app.lastChecked,
    lastResponseTimeMs: app.lastResponseTimeMs,
    lastError: app.lastError,
    checkIntervalMs: app.checkIntervalMs,
    createdAt: app.createdAt,
    uptimePct: computeUptimePct(app),
  };
  if (includeHistory) {
    base.history = app.history;
  }
  return base;
}

// GET /api/apps - list all monitored apps
router.get('/', async (req, res) => {
  const apps = await db.getAllApps();
  res.json(apps.map((a) => serializeApp(a)));
});

// GET /api/apps/:id - single app with full history (bonus: history/timeline)
router.get('/:id', async (req, res) => {
  const app = await db.getApp(Number(req.params.id));
  if (!app) return res.status(404).json({ error: 'App not found' });
  res.json(serializeApp(app, { includeHistory: true }));
});

// POST /api/apps - add a new app { name, url, checkIntervalMs? }
router.post('/', async (req, res) => {
  const { name, url, checkIntervalMs } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!url || typeof url !== 'string' || !isValidUrl(url)) {
    return res.status(400).json({ error: 'A valid http(s) url is required' });
  }

  const app = await db.addApp({
    name: name.trim(),
    url: url.trim(),
    checkIntervalMs: checkIntervalMs ? Number(checkIntervalMs) : null,
  });

  // Kick off an immediate check so the UI doesn't sit at "Unknown" until the
  // next scheduled cycle.
  checkOneApp(app).catch((err) => console.error('Immediate check failed:', err));

  res.status(201).json(serializeApp(app));
});

// PUT /api/apps/:id - edit name/url (optional per spec, implemented anyway)
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.getApp(id);
  if (!existing) return res.status(404).json({ error: 'App not found' });

  const { name, url, checkIntervalMs } = req.body || {};
  const fields = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    fields.name = name.trim();
  }
  if (url !== undefined) {
    if (!isValidUrl(url)) return res.status(400).json({ error: 'A valid http(s) url is required' });
    fields.url = url.trim();
  }
  if (checkIntervalMs !== undefined) {
    fields.checkIntervalMs = checkIntervalMs ? Number(checkIntervalMs) : null;
  }

  const updated = await db.updateApp(id, fields);
  res.json(serializeApp(updated));
});

// DELETE /api/apps/:id - remove from monitoring
router.delete('/:id', async (req, res) => {
  const ok = await db.removeApp(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'App not found' });
  res.status(204).end();
});

// POST /api/apps/:id/check - manually trigger an immediate check
router.post('/:id/check', async (req, res) => {
  const app = await db.getApp(Number(req.params.id));
  if (!app) return res.status(404).json({ error: 'App not found' });
  await checkOneApp(app);
  const updated = await db.getApp(app.id);
  res.json(serializeApp(updated));
});

module.exports = router;
