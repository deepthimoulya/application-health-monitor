# Application Health Monitor

A small full-stack app to add company application URLs, periodically check
whether each one is up, and view current status on a dashboard.

## Features

- Login-protected dashboard and API (session-based, username/password)
- Add / view / edit / remove monitored applications, backed by real API endpoints
- Background job checks every monitored URL on a configurable interval
- Each check records status (up/down), timestamp, response time, and error detail
- Failures (timeouts, DNS errors, connection refused, non-2xx) are caught and
  recorded as "down" — they never crash the server
- Dashboard auto-refreshes (polling every 10s) and has a manual "Refresh" /
  "Check now" button
- Data persists across server restarts
- Bonus features implemented: per-app check history/timeline (last N checks,
  configurable), uptime percentage per app, manual on-demand check

## Tech stack

- **Backend:** Node.js + Express. No framework magic, easy to read and extend
  in a time-boxed exercise.
- **Persistence:** a single JSON file (`data/apps.json`), written through a
  small serialized-write wrapper (`server/db.js`) so concurrent requests can't
  corrupt it. The spec explicitly allows a local file/JSON store for this
  exercise, and it avoids any native-module build step (e.g. `better-sqlite3`
  requires compiling), which matters when you have limited time and an
  unfamiliar machine. The `db.js` module is the only place that touches the
  storage shape — swapping it for SQLite/Postgres later would not require
  touching any route or the health-check logic.
- **Auth:** `express-session` (in-memory store) + a single admin
  username/password from environment variables. Meets the spec's "basic
  username/password auth is sufficient." Not meant for multi-user production
  use — see "What I'd improve."
- **Health checks:** Node 18+'s built-in `fetch` with `AbortController` for
  timeouts. No extra HTTP client dependency needed.
- **Frontend:** plain HTML/CSS/JS (no build step). Two pages (`login.html`,
  `index.html`) talking to the JSON API via `fetch`. Chosen for speed and zero
  tooling risk within the time limit; the API is decoupled enough that this
  could be swapped for React without backend changes.

## Project structure

```
health-monitor/
  server/
    index.js          # Express app entrypoint, session + static file serving
    auth.js            # login/logout/session-check handlers + requireAuth middleware
    db.js               # JSON-file persistence layer
    healthCheck.js      # background polling loop + per-app check logic
    routes/
      apps.js            # CRUD + manual-check API for monitored apps
  public/
    login.html
    index.html
    app.js              # dashboard client logic (fetch calls, rendering, polling)
    style.css
  data/
    apps.json           # created automatically on first run
  .env.example
  package.json
```

## Running locally

Requires Node.js 18+ (built-in `fetch`/`AbortController` are used directly).

```bash
cd health-monitor
npm install
cp .env.example .env
# edit .env if you want different credentials or a different check interval
npm start
```

Then open `http://localhost:3000` and log in with the credentials from `.env`
(defaults: `admin` / `admin123`).

### Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | (dev placeholder) | Session cookie signing secret |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | `admin` / `admin123` | Login credentials |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | How often the background job re-checks every app |
| `HEALTH_CHECK_TIMEOUT_MS` | `5000` | Per-check timeout before it's marked a failure |
| `HEALTH_CHECK_HISTORY_LIMIT` | `100` | How many past check results to retain per app |

## Assumptions made

- A single shared admin account is enough ("basic username/password auth"),
  rather than a full multi-user system with signup.
- "Up" = HTTP response in the 2xx range within the timeout window, per the
  spec's own definition — no additional content/body checks.
- Redirects are followed when checking a URL (a `3xx` that resolves to a
  working `2xx` page counts as up).
- History is capped (default 100 entries per app) to keep the JSON file
  bounded rather than growing forever; this is a reasonable trade-off for a
  demo/exercise, documented here rather than silently done.
- Health checks for all apps run concurrently on each tick (`Promise.allSettled`)
  so one slow/unreachable app can't delay checks for the others.
- Per-app custom check interval is accepted by the API/data model
  (`checkIntervalMs`) but the scheduler currently only runs one global tick —
  see below.

## What I'd improve or do differently with more time

- Wire up the per-app `checkIntervalMs` to actually schedule independent
  timers instead of one global interval (the field exists in the data model
  and API but isn't yet consumed by the scheduler).
- Move persistence to SQLite (or Postgres) for real concurrent-write safety
  and queryability, now that the storage layer is isolated in `db.js`.
- Add password hashing (bcrypt) and a proper user table instead of a single
  env-var credential pair, if multi-user access were needed.
- Response-time graphing on the dashboard (currently only the latest response
  time and a raw history array are exposed via `GET /api/apps/:id`).
- Down-alerting (email/Slack webhook) when an app's status flips from up to
  down.
- Swap the polling frontend for WebSockets/SSE for truly real-time updates
  instead of a 10s poll.
- Basic automated tests (currently verified manually via curl against every
  endpoint, including restart-persistence and failure-mode checks).
