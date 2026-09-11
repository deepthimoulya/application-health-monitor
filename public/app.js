const appList = document.getElementById('appList');
const addForm = document.getElementById('addForm');
const nameInput = document.getElementById('nameInput');
const urlInput = document.getElementById('urlInput');
const errorBanner = document.getElementById('errorBanner');
const whoami = document.getElementById('whoami');

const POLL_MS = 10000; // auto-refresh dashboard every 10s

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
            <button class="btn-secondary btn-small" data-action="check" data-id="${app.id}">Check now</button>
            <button class="btn-danger btn-small" data-action="remove" data-id="${app.id}">Remove</button>
          </div>
        </div>
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
