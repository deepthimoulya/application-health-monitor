// Background health-checking service.
//
// - Periodically (every HEALTH_CHECK_INTERVAL_MS) checks every monitored app's URL.
// - "Up" = HTTP response with a 2xx status within the timeout window.
// - Any failure mode (timeout, DNS error, connection refused, non-2xx, TLS error, etc.)
//   is caught and recorded as "down" - it never throws/crashes the process.

const db = require('./db');

const DEFAULT_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS) || 30000;
const TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS) || 5000;
const HISTORY_LIMIT = Number(process.env.HEALTH_CHECK_HISTORY_LIMIT) || 100;

async function checkOneApp(app) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let status = 'down';
  let error = null;

  try {
    const res = await fetch(app.url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });
    if (res.status >= 200 && res.status < 300) {
      status = 'up';
    } else {
      status = 'down';
      error = `HTTP ${res.status}`;
    }
  } catch (err) {
    status = 'down';
    if (err.name === 'AbortError') {
      error = `Timeout after ${TIMEOUT_MS}ms`;
    } else if (err.cause && err.cause.code) {
      // e.g. ENOTFOUND (DNS), ECONNREFUSED, ECONNRESET
      error = err.cause.code;
    } else {
      error = err.message || 'Unknown error';
    }
  } finally {
    clearTimeout(timer);
  }

  const responseTimeMs = Date.now() - start;

  await db.recordCheckResult(
    app.id,
    {
      status,
      timestamp: new Date().toISOString(),
      responseTimeMs,
      error,
    },
    HISTORY_LIMIT
  );
}

async function checkAllApps() {
  const apps = await db.getAllApps();
  // Run checks concurrently; one slow/broken app must not delay or block the others.
  await Promise.allSettled(apps.map((app) => checkOneApp(app)));
}

function startHealthCheckLoop() {
  // Run once immediately on boot, then on the configured interval.
  checkAllApps().catch((err) => console.error('Initial health check run failed:', err));
  const handle = setInterval(() => {
    checkAllApps().catch((err) => console.error('Health check run failed:', err));
  }, DEFAULT_INTERVAL_MS);
  return handle;
}

module.exports = {
  checkOneApp,
  checkAllApps,
  startHealthCheckLoop,
  DEFAULT_INTERVAL_MS,
};
