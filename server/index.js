require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { requireAuth, register, login, logout, sessionStatus } = require('./auth');
const users = require('./users');
const appsRouter = require('./routes/apps');
const { startHealthCheckLoop, DEFAULT_INTERVAL_MS } = require('./healthCheck');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// --- Auth API (unprotected) ---
app.post('/api/register', register);
app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/session', sessionStatus);

// --- Monitored apps API (protected) ---
app.use('/api/apps', requireAuth, appsRouter);

// --- Static frontend ---
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// Root: send dashboard shell; client-side JS checks session and redirects to
// /login.html if not authenticated. Keeping this simple avoids server-side
// templating for a two-page app.
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Application Health Monitor listening on http://localhost:${PORT}`);
  console.log(`Health checks running every ${DEFAULT_INTERVAL_MS / 1000}s`);
  await users.ensureDefaultAdmin(); // seeds AUTH_USERNAME/AUTH_PASSWORD from .env on first boot only
  startHealthCheckLoop();
});