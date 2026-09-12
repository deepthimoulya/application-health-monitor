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

app.post('/api/register', register);
app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/session', sessionStatus);

app.use('/api/apps', requireAuth, appsRouter);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));


app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Application Health Monitor listening on http://localhost:${PORT}`);
  console.log(`Health checks running every ${DEFAULT_INTERVAL_MS / 1000}s`);
  await users.ensureDefaultAdmin();
  startHealthCheckLoop();
});
