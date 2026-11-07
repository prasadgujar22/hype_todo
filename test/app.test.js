import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../lib/app.js';
import { hashPassword, verifyPassword, hashSessionToken } from '../lib/auth.js';
import { createRateLimiter } from '../lib/rate-limit.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Only for route tests: real PostgreSQL semantics are covered separately when
// TEST_DATABASE_URL is provided. No test data is ever used by the app itself.
class MemoryStore {
  users = new Map();
  sessions = new Map();
  tasks = new Map();
  publicUser(user) {
    const { passwordHash, passwordSalt, ...safe } = user;
    return { ...safe };
  }
  async createUser(data) {
    if ([...this.users.values()].some((u) => u.email === data.email)) {
      const error = new Error('duplicate'); error.code = '23505'; throw error;
    }
    const user = { ...data, onboarded: false, createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    return this.publicUser(user);
  }
  async findUserByEmail(email) { return [...this.users.values()].find((user) => user.email === email) ?? null; }
  async getUserBySession(tokenHash, now) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= now) return null;
    const user = this.users.get(session.userId);
    return user ? this.publicUser(user) : null;
  }
  async createSession(session) { this.sessions.set(session.tokenHash, session); }
  async deleteSession(tokenHash) { this.sessions.delete(tokenHash); }
  async finishOnboarding(id) { const user = this.users.get(id); user.onboarded = true; return this.publicUser(user); }
  async list(userId) { return [...this.tasks.values()].filter((item) => item.userId === userId).map(({ userId: _, ...task }) => ({ ...task })); }
  async get(userId, id) { const item = this.tasks.get(id); if (!item || item.userId !== userId) return null; const { userId: _, ...task } = item; return { ...task }; }
  async create(userId, fields) {
    const now = new Date().toISOString();
    const task = { id: randomUUID(), title: fields.title, notes: fields.notes ?? '', priority: fields.priority ?? 'medium', dueDate: fields.dueDate ?? null, project: fields.project ?? 'Personal', completed: fields.completed ?? false, createdAt: now, updatedAt: now, completedAt: fields.completed ? now : null };
    this.tasks.set(task.id, { ...task, userId });
    return { ...task };
  }
  async update(userId, id, fields) {
    const previous = this.tasks.get(id);
    if (!previous || previous.userId !== userId) return null;
    const now = new Date().toISOString();
    const updated = { ...previous, ...fields, updatedAt: now };
    if (updated.completed && !previous.completed) updated.completedAt = now;
    if (!updated.completed) updated.completedAt = null;
    this.tasks.set(id, updated);
    const { userId: _, ...task } = updated; return { ...task };
  }
  async delete(userId, id) {
    const task = this.tasks.get(id);
    return !!task && task.userId === userId && this.tasks.delete(id);
  }
}

async function fixture(t, options = {}) {
  const store = new MemoryStore();
  const app = createApp({ store, publicDir: path.join(root, 'public'), ...options });
  const server = createServer(app.handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}`, store };
}

function json(method, body, cookie, extraHeaders = {}) {
  return { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extraHeaders }, body: JSON.stringify(body) };
}
async function signup(app, name = 'Mira', email = 'mira@example.com', password = 'correct horse battery') {
  const res = await fetch(app.url + '/api/auth/signup', json('POST', { name, email, password }));
  assert.equal(res.status, 201);
  return { user: (await res.json()).user, cookie: res.headers.get('set-cookie').split(';')[0], headers: res.headers };
}

test('serves the app and only explicitly allowed files', async (t) => {
  const app = await fixture(t);
  let res = await fetch(app.url + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await res.text(), /<html/i);
  res = await fetch(app.url + '/styles.css', { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
  assert.deepEqual(await (await fetch(app.url + '/api/status')).json(), { status: 'ok' });
  for (const p of ['/server.js', '/lib/store.js', '/%2e%2e%2fserver.js', '/not-a-real-file']) {
    assert.equal((await fetch(app.url + p)).status, 404, p);
  }
  const target = new URL(app.url);
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: target.hostname, port: target.port, path: '/api/status', headers: { Host: 'attacker.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(hostStatus, 403, 'unapproved Host headers are rejected');
  res = await fetch(app.url + '/api/tasks', { method: 'PUT' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');
});

test('hashes and salts passwords and compares securely', async () => {
  const a = await hashPassword('long unique password');
  const b = await hashPassword('long unique password');
  assert.notEqual(a.passwordSalt, b.passwordSalt);
  assert.notEqual(a.passwordHash, b.passwordHash);
  assert.ok(!a.passwordHash.includes('long unique password'));
  assert.equal(await verifyPassword('long unique password', a.passwordSalt, a.passwordHash), true);
  assert.equal(await verifyPassword('incorrect password', a.passwordSalt, a.passwordHash), false);
  assert.equal(await verifyPassword('any password'), false);
  assert.equal(await verifyPassword('any password', 'bad', 'bad'), false);
});

test('signup, onboarding, signout and login create secure, revocable sessions', async (t) => {
  const app = await fixture(t, { cookieSecure: true });
  assert.equal((await fetch(app.url + '/api/tasks')).status, 401);
  assert.equal((await fetch(app.url + '/api/auth/me')).status, 401);
  const { user, cookie, headers } = await signup(app, 'Mira', '  Mira@Example.com  ');
  assert.equal(user.email, 'mira@example.com');
  assert.equal(user.onboarded, false);
  assert.ok(!Object.hasOwn(user, 'passwordHash'));
  assert.match(headers.get('set-cookie'), /HttpOnly/);
  assert.match(headers.get('set-cookie'), /SameSite=Strict/);
  assert.match(headers.get('set-cookie'), /Secure/);
  const token = cookie.split('=')[1];
  assert.ok(app.store.sessions.has(hashSessionToken(token)));
  assert.ok(!app.store.sessions.has(token));
  let res = await fetch(app.url + '/api/auth/me', { headers: { cookie } });
  assert.equal((await res.json()).user.name, 'Mira');
  res = await fetch(app.url + '/api/auth/onboarding', json('POST', {}, cookie));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.onboarded, true);
  res = await fetch(app.url + '/api/auth/signup', json('POST', { name: 'M', email: 'MIRA@EXAMPLE.COM', password: 'another strong password' }));
  assert.equal(res.status, 409);
  res = await fetch(app.url + '/api/auth/logout', json('POST', {}, cookie));
  assert.equal(res.status, 204);
  assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(app.url + '/api/auth/me', { headers: { cookie } })).status, 401);
  res = await fetch(app.url + '/api/auth/login', json('POST', { email: 'mira@example.com', password: 'wrong' }));
  assert.equal(res.status, 401);
  const wrongMessage = (await res.json()).error;
  res = await fetch(app.url + '/api/auth/login', json('POST', { email: 'absent@example.com', password: 'wrong' }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, wrongMessage);
  res = await fetch(app.url + '/api/auth/login', json('POST', { email: 'mira@example.com', password: 'correct horse battery' }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.onboarded, true);
  assert.notEqual(res.headers.get('set-cookie').split(';')[0], cookie);
});

test('keeps tasks strictly isolated between accounts', async (t) => {
  const app = await fixture(t);
  const a = await signup(app, 'A', 'a@example.com');
  const b = await signup(app, 'B', 'b@example.com');
  let res = await fetch(app.url + '/api/tasks', json('POST', { title: ' Private task ', priority: 'high', dueDate: '2028-02-29', project: 'Work' }, a.cookie));
  assert.equal(res.status, 201);
  const task = await res.json();
  assert.equal(task.title, 'Private task');
  assert.equal(task.completed, false);
  assert.equal(task.completedAt, null);
  assert.deepEqual(await (await fetch(app.url + '/api/tasks', { headers: { cookie: b.cookie } })).json(), []);
  assert.equal((await fetch(app.url + '/api/tasks/' + task.id, { headers: { cookie: b.cookie } })).status, 404);
  assert.equal((await fetch(app.url + '/api/tasks/' + task.id, json('PATCH', { completed: true }, b.cookie))).status, 404);
  assert.equal((await fetch(app.url + '/api/tasks/' + task.id, { method: 'DELETE', headers: { cookie: b.cookie } })).status, 404);
  res = await fetch(app.url + '/api/tasks/' + task.id, json('PATCH', { completed: true }, a.cookie));
  const completed = await res.json();
  assert.equal(completed.completed, true);
  assert.ok(!Number.isNaN(Date.parse(completed.completedAt)));
  res = await fetch(app.url + '/api/tasks/' + task.id, json('PATCH', { completed: false, dueDate: null }, a.cookie));
  const reopened = await res.json();
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.dueDate, null);
  assert.equal((await fetch(app.url + '/api/tasks/' + task.id, { method: 'DELETE', headers: { cookie: a.cookie } })).status, 204);
  assert.equal((await fetch(app.url + '/api/tasks/' + task.id, { headers: { cookie: a.cookie } })).status, 404);
});

test('validates account and task inputs, media types and body limits', async (t) => {
  const app = await fixture(t);
  let res = await fetch(app.url + '/api/auth/signup', json('POST', { name: 'A', email: 'invalid', password: 'short' }));
  assert.equal(res.status, 400);
  const a = await signup(app);
  const badTasks = [
    {}, { title: '   ' }, { title: 'x'.repeat(201) }, { title: 'two\nlines' },
    { title: 'Good', notes: null }, { title: 'Good', priority: 'urgent' },
    { title: 'Good', project: 'Unknown' }, { title: 'Good', completed: 'yes' },
    { title: 'Good', dueDate: '2027-02-29' }, { title: 'Good', dueDate: '0000-01-01' }, { title: 'Good', dueDate: 'not-a-date' },
    { title: 'Good', unknown: true }, ['not', 'a', 'task'],
  ];
  for (const body of badTasks) {
    res = await fetch(app.url + '/api/tasks', json('POST', body, a.cookie));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok((await res.json()).error);
  }
  res = await fetch(app.url + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: '{' });
  assert.equal(res.status, 400);
  res = await fetch(app.url + '/api/tasks', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: a.cookie }, body: '{}' });
  assert.equal(res.status, 415);
  res = await fetch(app.url + '/api/tasks', json('POST', { title: 'x'.repeat(33_000) }, a.cookie));
  assert.equal(res.status, 413);
  assert.deepEqual(await (await fetch(app.url + '/api/tasks', { headers: { cookie: a.cookie } })).json(), []);
});

test('rejects cross-origin mutations and rate-limits authentication', async (t) => {
  const app = await fixture(t);
  const a = await signup(app);
  let res = await fetch(app.url + '/api/tasks', json('POST', { title: 'Blocked' }, a.cookie, { origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
  res = await fetch(app.url + '/api/tasks', json('POST', { title: 'Blocked' }, a.cookie, { 'sec-fetch-site': 'cross-site' }));
  assert.equal(res.status, 403);
  res = await fetch(app.url + '/api/tasks', json('POST', { title: 'Allowed' }, a.cookie, { origin: app.url }));
  assert.equal(res.status, 201);
  // Signup above counts as one attempt. Bad requests count as well.
  for (let i = 0; i < 9; i++) {
    res = await fetch(app.url + '/api/auth/login', json('POST', {}));
    assert.equal(res.status, 400);
  }
  res = await fetch(app.url + '/api/auth/login', json('POST', {}));
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
});

test('the rate limiter resets windows and separates addresses', () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => now });
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, false);
  assert.equal(limiter.consume('b').allowed, true);
  now = 1000;
  assert.equal(limiter.consume('a').allowed, true);
});
