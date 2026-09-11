// Basic username/password auth, backed by express-session.
// Credentials come from env vars - see .env.example. This is intentionally simple,
// matching the spec ("basic username/password auth is sufficient").

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function login(req, res) {
  const { username, password } = req.body || {};
  const expectedUser = process.env.AUTH_USERNAME || 'admin';
  const expectedPass = process.env.AUTH_PASSWORD || 'admin123';

  if (username === expectedUser && password === expectedPass) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.json({ ok: true, username });
  }
  return res.status(401).json({ error: 'Invalid username or password' });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
}

function sessionStatus(req, res) {
  if (req.session && req.session.loggedIn) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  return res.json({ loggedIn: false });
}

module.exports = { requireAuth, login, logout, sessionStatus };
