const appList = document.getElementById('appList');
const addForm = document.getElementById('addForm');
const nameInput = document.getElementById('nameInput');
const urlInput = document.getElementById('urlInput');
const errorBanner = document.getElementById('errorBanner');
const whoami = document.getElementById('whoami');

const POLL_MS = 10000;

function timeAgo(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.round(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function statusLabel(status) {
  if (status === 'up') return 'Up';
  if (status === 'down') return 'Down';
  return 'Unknown';
}

function renderApps(apps) {
  if (!apps.length) {
    appList.innerHTML = '<div class="empty-state card">No apps yet - add one above to start monitoring.</div>';
    return;
  }

  appList.innerHTML = apps
    .map((app) => {
      const cls = app.status || 'unknown';
      const uptime = app.uptimePct !== null && app.uptimePct !== undefined ? `${app.uptimePct}% uptime` : '';
      const responseTime = app.lastResponseTimeMs !== null && app.lastResponseTimeMs !== undefined
        ? `${app.lastResponseTimeMs}ms`
        : '';
      const errPart = app.lastError ? ` &middot; ${escapeHtml(app.lastError)}` : '';

      return `
        <div class="app-row card" data-id="${app.id}">
          <div class="app-info">
            <div class="status-dot ${cls}" title="${statusLabel(app.status)}"></div>
            <div>
              <div class="app-name">${escapeHtml(app.name)}</div>
              <div class="app-url">${escapeHtml(app.url)}</div>
              <div class="app-meta">
                <span class="status-label ${cls}">${statusLabel(app.status)}</span>
                &middot; last checked ${timeAgo(app.lastChecked)}
                ${responseTime ? `&middot; ${responseTime}` : ''}
                ${uptime ? `&middot; ${uptime}` : ''}
                ${errPart}
              </div>
            </div>
          </div>
          <div class="app-actions">
            <button class="btn-secondary btn-small" data-action="history" data-id="${app.id}">History</button>
            <button class="btn-secondary btn-small" data-action="check" data-id="${app.id}">Check now</button>
            <button class="btn-danger btn-small" data-action="remove" data-id="${app.id}">Remove</button>
          </div>
        </div>
        <div class="history-panel" id="history-${app.id}" style="display:none;"></div>
      `;
    })
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadApps() {
  try {
    const res = await fetch('/api/apps');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const apps = await res.json();
    errorBanner.textContent = '';
    renderApps(apps);
  } catch (err) {
    errorBanner.textContent = 'Could not load apps - is the server running?';
  }
}

async function checkSession() {
  const res = await fetch('/api/session');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/login.html';
    return;
  }
  whoami.textContent = data.username ? `Signed in as ${data.username}` : '';
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBanner.textContent = '';
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  const res = await fetch('/api/apps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, url }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    errorBanner.textContent = data.error || 'Could not add app';
    return;
  }

  nameInput.value = '';
  urlInput.value = '';
  await loadApps();
});

function drawResponseTimeChart(canvas, history) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const points = history.filter((p) => typeof p.responseTimeMs === 'number');
  if (points.length < 2) {
    ctx.fillStyle = '#9aa1ac';
    ctx.font = '12px sans-serif';
    ctx.fillText('Not enough data yet for a graph', 10, h / 2);
    return;
  }

  const maxMs = Math.max(...points.map((p) => p.responseTimeMs), 1);
  const padding = 20;
  const stepX = (w - padding * 2) / (points.length - 1);

  ctx.strokeStyle = '#2a2e38';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, h - padding);
  ctx.lineTo(w - padding, h - padding);
  ctx.stroke();
  ctx.fillStyle = '#9aa1ac';
  ctx.font = '10px sans-serif';
  ctx.fillText(`${maxMs}ms`, 2, padding);
  ctx.fillText('0ms', 2, h - padding + 4);

  ctx.beginPath();
  ctx.strokeStyle = '#4f8cff';
  ctx.lineWidth = 2;
  points.forEach((p, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (p.responseTimeMs / maxMs) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((p, i) => {
    const x = padding + i * stepX;
    const y = h - padding - (p.responseTimeMs / maxMs) * (h - padding * 2);
    ctx.beginPath();
    ctx.fillStyle = p.status === 'up' ? '#35c759' : '#ff5c5c';
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function toggleHistory(id, btn) {
  const panel = document.getElementById(`history-${id}`);
  const isOpen = panel.style.display !== 'none';

  if (isOpen) {
    panel.style.display = 'none';
    btn.textContent = 'History';
    return;
  }

  btn.textContent = 'Loading...';
  const res = await fetch(`/api/apps/${id}`);
  const app = await res.json();
  btn.textContent = 'Hide history';

  const recent = app.history.slice(-30);

  panel.innerHTML = `
    <div class="history-title">Response time (last ${recent.length} checks) &middot; ${app.uptimePct !== null ? app.uptimePct + '% uptime overall' : 'no uptime data yet'}</div>
    <canvas width="600" height="140" class="history-canvas"></canvas>
    <div class="history-log"></div>
  `;
  panel.style.display = 'block';

  const canvas = panel.querySelector('canvas');
  drawResponseTimeChart(canvas, recent);

  const logHtml = recent
    .slice()
    .reverse()
    .slice(0, 10)
    .map((h) => {
      const cls = h.status === 'up' ? 'up' : 'down';
      const rt = typeof h.responseTimeMs === 'number' ? `${h.responseTimeMs}ms` : '-';
      const err = h.error ? ` &middot; ${escapeHtml(h.error)}` : '';
      return `<div class="history-log-row"><span class="status-label ${cls}">${statusLabel(h.status)}</span> ${rt} &middot; ${timeAgo(h.timestamp)}${err}</div>`;
    })
    .join('');
  panel.querySelector('.history-log').innerHTML = logHtml || '<div class="empty-state">No checks recorded yet.</div>';
}

appList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'remove') {
    if (!confirm('Remove this app from monitoring?')) return;
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    await loadApps();
  } else if (action === 'check') {
    btn.disabled = true;
    btn.textContent = 'Checking...';
    await fetch(`/api/apps/${id}/check`, { method: 'POST' });
    await loadApps();
  } else if (action === 'history') {
    await toggleHistory(id, btn);
  }
});

document.getElementById('refreshBtn').addEventListener('click', loadApps);
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

(async function init() {
  await checkSession();
  await loadApps();
  setInterval(loadApps, POLL_MS);
})();
