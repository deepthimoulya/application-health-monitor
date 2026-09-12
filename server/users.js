const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SALT_ROUNDS = 10;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [], nextId: 1 }, null, 2));
  }
}

function readRaw() {
  ensureStore();
  const raw = fs.readFileSync(USERS_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    fs.copyFileSync(USERS_FILE, USERS_FILE + `.corrupt-${Date.now()}`);
    const fresh = { users: [], nextId: 1 };
    fs.writeFileSync(USERS_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

let queue = Promise.resolve();
function writeRaw(data) {
  queue = queue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return queue;
}

function findByUsername(username) {
  const data = readRaw();
  return data.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

async function createUser(username, password) {
  const data = readRaw();
  const exists = data.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    const err = new Error('Username already taken');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = {
    id: data.nextId,
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  data.nextId += 1;
  await writeRaw(data);
  return user;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}


async function ensureDefaultAdmin() {
  const username = process.env.AUTH_USERNAME || 'admin';
  const password = process.env.AUTH_PASSWORD || 'admin123';
  const existing = findByUsername(username);
  if (!existing) {
    await createUser(username, password);
  }
}

module.exports = { findByUsername, createUser, verifyPassword, ensureDefaultAdmin };
