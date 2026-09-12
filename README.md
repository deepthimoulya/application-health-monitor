# Application Health Monitor

A dashboard to add company application URLs, periodically check whether each
one is up, and view current status. Live demo: [your Render URL here]

## Features

- Multi-user login: anyone can register their own account, or use the
  shared default admin account
- Add / view / edit / remove monitored applications via real API endpoints
- Background job checks every URL on a configurable interval (default 30s)
- Records status (up/down), timestamp, and response time per check
- Handles timeouts, DNS errors, and bad HTTP codes gracefully — never crashes
- Dashboard auto-refreshes every 10s, plus manual Refresh / Check now buttons
- Data persists across server restarts (JSON file storage)
- Bonus: per-app history/timeline with a response-time graph, uptime %,
  manual on-demand checks, and optional down/recovery webhook alerts

## Tech stack

- **Backend:** Node.js + Express
- **Storage:** JSON files (`data/apps.json`, `data/users.json`) — allowed
  by the exercise spec, avoids native DB setup, isolated in one module so
  it could be swapped for a real database later without touching routes
- **Auth:** express-session + bcrypt-hashed passwords, multi-user accounts
- **Health checks:** Node's built-in `fetch` + `AbortController` for timeouts
- **Frontend:** Plain HTML/CSS/JS, no build tools

## Running locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`, log in or register a new account.

## Deployment

Deployed on Render (free tier). Build command: `npm install`. Start
command: `npm start`. Environment variables set in Render's dashboard
(see `.env.example` for the full list).

Note: free-tier hosting spins down when idle, so the background health
checker may skip cycles between visits — the on-demand "Check now" button
always works instantly regardless.

## Assumptions

- Any logged-in user manages the same shared list of apps (no per-user
  app ownership)
- "Up" = HTTP 2xx response within the timeout window
- History capped at 100 entries per app to keep storage bounded

## What I'd improve with more time

- Per-app custom check intervals (field exists, scheduler doesn't use it yet)
- Real database for concurrent-write safety at scale
- Per-user app ownership/isolation
- Email alerts alongside the existing webhook option
  Link: https://application-health-monitor.onrender.com/
