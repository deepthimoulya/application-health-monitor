// Multi-user auth: each person registers their own username/password.
// Passwords are hashed (see server/users.js) - never stored or compared
// in plaintext. Session-based, via express-session.

const users = require('./users');

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

async function register(req, res) {
  const { username, password } = req.body || {};

  if (!isValidUsername(username)) {
    return res
      .status(400)
      .json({ error: 'Username must be 3-32 characters (letters, numbers, _ . -)' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const user = await users.createUser(username, password);
    req.session.loggedIn = true;
    req.session.username = user.username;
    return res.status(201).json({ ok: true, username: user.username });
  } catch (err) {
    if (err.code === 'USERNAME_TAKEN') {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = users.findByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const ok = await users.verifyPassword(user, password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.loggedIn = true;
  req.session.username = user.username;
  return res.json({ ok: true, username: user.username });
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

module.exports = { requireAuth, register, login, logout, sessionStatus };