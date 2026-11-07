import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, newSessionToken, hashSessionToken, readSessionToken, readSessionTokens, sessionCookie } from './auth.js';
import { createRateLimiter } from './rate-limit.js';

const BODY_LIMIT = 32 * 1024;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const FIELDS = new Set(['title', 'notes', 'priority', 'dueDate', 'project', 'completed']);
const PRIORITIES = new Set(['low', 'medium', 'high']);
const PROJECTS = new Set(['Personal', 'Work', 'Ideas']);
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/auth.css': ['auth.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/auth.js': ['auth.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function allowMethods(res, methods) {
  res.setHeader('Allow', methods.join(', '));
  throw new HttpError(405, 'Method not allowed.');
}

function requireAllowedHost(req, allowedHosts) {
  const host = req.headers.host;
  try {
    if (!host || /[\s/@\\]/.test(host)) throw new Error('invalid host');
    const parsed = new URL(`http://${host}`);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || !allowedHosts.has(parsed.hostname.toLowerCase())) throw new Error('unapproved host');
  } catch {
    throw new HttpError(403, 'This host is not allowed.');
  }
}

function requireSameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed.');
  const origin = req.headers.origin;
  if (!origin) return; // CLI clients normally omit Origin; browsers also use SameSite cookies.
  try {
    const parsed = new URL(origin);
    const host = new URL(`${parsed.protocol}//${req.headers.host}`).host;
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== host) throw new Error('origin mismatch');
  } catch {
    throw new HttpError(403, 'Cross-origin requests are not allowed.');
  }
}

async function readJson(req) {
  const mediaType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    req.pause();
    throw new HttpError(415, 'Content-Type must be application/json.');
  }
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) {
    req.pause();
    throw new HttpError(413, 'Request body is too large.');
  }
  let size = 0;
  const chunks = [];
  // Do not destroy the stream on early exit: send a 413 and close the socket
  // rather than consuming an unbounded chunked upload or dropping the reply.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      req.pause();
      throw new HttpError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must contain valid JSON.');
  }
}

function objectWithFields(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request must be a JSON object.');
  if (Object.keys(body).some((key) => !fields.includes(key))) throw new HttpError(400, 'Request contains an unknown field.');
  return body;
}

function authFields(body, signup) {
  objectWithFields(body, signup ? ['name', 'email', 'password'] : ['email', 'password']);
  if (signup && (typeof body.name !== 'string' || !body.name.trim() || Array.from(body.name.trim()).length > 80 || /[\u0000-\u001f\u007f]/.test(body.name))) {
    throw new HttpError(400, 'Name must be between 1 and 80 characters.');
  }
  if (typeof body.email !== 'string' || body.email.trim().length > 254 || /[\u0000-\u001f\u007f]/.test(body.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  const length = typeof body.password === 'string' ? Array.from(body.password).length : 0;
  if (typeof body.password !== 'string' || length < (signup ? 12 : 1) || length > 256 || Buffer.byteLength(body.password, 'utf8') > 1024 || body.password.includes('\u0000')) {
    throw new HttpError(400, signup ? 'Password must be between 12 and 256 characters.' : 'Enter your password.');
  }
  return { name: signup ? body.name.trim() : undefined, email: body.email.trim().toLowerCase(), password: body.password };
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateFields(body, { create = false } = {}) {
  objectWithFields(body, [...FIELDS]);
  const keys = Object.keys(body);
  if (!keys.length) throw new HttpError(400, 'Provide at least one task field.');
  if (create && !Object.hasOwn(body, 'title')) throw new HttpError(400, 'Title is required.');
  const result = {};
  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim() || Array.from(body.title.trim()).length > 200 || /[\u0000-\u001f\u007f]/.test(body.title)) {
      throw new HttpError(400, 'Title must be between 1 and 200 characters without control characters.');
    }
    result.title = body.title.trim();
  }
  if (Object.hasOwn(body, 'notes')) {
    if (typeof body.notes !== 'string' || Array.from(body.notes).length > 5000 || body.notes.includes('\u0000')) throw new HttpError(400, 'Notes must be text of at most 5000 characters.');
    result.notes = body.notes.trim();
  }
  if (Object.hasOwn(body, 'priority')) {
    if (!PRIORITIES.has(body.priority)) throw new HttpError(400, 'Priority must be low, medium, or high.');
    result.priority = body.priority;
  }
  if (Object.hasOwn(body, 'project')) {
    if (!PROJECTS.has(body.project)) throw new HttpError(400, 'Project must be Personal, Work, or Ideas.');
    result.project = body.project;
  }
  if (Object.hasOwn(body, 'dueDate')) {
    if (body.dueDate !== null && body.dueDate !== '' && !isRealDate(body.dueDate)) throw new HttpError(400, 'Due date must be a real date in YYYY-MM-DD format.');
    result.dueDate = body.dueDate || null;
  }
  if (Object.hasOwn(body, 'completed')) {
    if (typeof body.completed !== 'boolean') throw new HttpError(400, 'Completed must be true or false.');
    result.completed = body.completed;
  }
  return result;
}

/**
 * HTTP application. The store is injected so the route/security logic can be
 * tested separately from a real PostgreSQL server.
 */
export function createApp({ store, publicDir, cookieSecure = false, healthCheck = async () => {}, allowedHosts = ['localhost', '127.0.0.1', '[::1]'] }) {
  const sourceLimiter = createRateLimiter({ limit: 30 });
  const accountLimiter = createRateLimiter({ limit: 10 });
  const allowedHostSet = new Set(allowedHosts.map((name) => name.trim().toLowerCase()).filter(Boolean));
  let activeKdfs = 0;

  async function currentUser(req) {
    const token = readSessionToken(req);
    if (!token) return null;
    return store.getUserBySession(hashSessionToken(token), new Date().toISOString());
  }

  async function requireUser(req) {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, 'Please sign in to continue.');
    return user;
  }

  function requireExpectedUser(req, user) {
    const expected = req.headers['x-hype-user'];
    if (expected !== undefined && expected !== user.id) {
      throw new HttpError(409, 'Your account changed. Reload the workspace.', 'ACCOUNT_CHANGED');
    }
  }

  function limitAuth(res, limiter, key) {
    const result = limiter.consume(key);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      throw new HttpError(429, 'Too many attempts. Please try again later.');
    }
  }

  async function withKdfLimit(res, operation) {
    if (activeKdfs >= 4) {
      res.setHeader('Retry-After', '1');
      throw new HttpError(429, 'The server is busy. Please try again shortly.');
    }
    activeKdfs += 1;
    try { return await operation(); } finally { activeKdfs -= 1; }
  }

  async function startSession(req, res, user) {
    const oldTokens = readSessionTokens(req);
    const token = newSessionToken();
    await store.createSession({ tokenHash: hashSessionToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() });
    if (oldTokens.length) await store.deleteSessions(oldTokens.map(hashSessionToken));
    res.setHeader('Set-Cookie', sessionCookie(token, { secure: cookieSecure, maxAge: SESSION_SECONDS }));
  }

  async function handler(req, res) {
    headers(res);
    try {
      requireAllowedHost(req, allowedHostSet);
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) requireSameOrigin(req);

      if (pathname === '/api/status') {
        if (method !== 'GET') return allowMethods(res, ['GET']);
        await healthCheck();
        return sendJson(res, 200, { status: 'ok' });
      }

      if (pathname === '/api/auth/signup') {
        if (method !== 'POST') return allowMethods(res, ['POST']);
        limitAuth(res, sourceLimiter, req.socket.remoteAddress || 'unknown');
        const fields = authFields(await readJson(req), true);
        const password = await withKdfLimit(res, () => {
          limitAuth(res, accountLimiter, fields.email);
          return hashPassword(fields.password);
        });
        let user;
        try {
          user = await store.createUser({ id: randomUUID(), name: fields.name, email: fields.email, ...password });
        } catch (error) {
          if (error.code === '23505') throw new HttpError(409, 'Unable to create account. If you already have one, try signing in.');
          throw error;
        }
        await startSession(req, res, user);
        return sendJson(res, 201, { user });
      }

      if (pathname === '/api/auth/login') {
        if (method !== 'POST') return allowMethods(res, ['POST']);
        limitAuth(res, sourceLimiter, req.socket.remoteAddress || 'unknown');
        const fields = authFields(await readJson(req), false);
        const { stored, valid } = await withKdfLimit(res, async () => {
          limitAuth(res, accountLimiter, fields.email);
          const stored = await store.findUserByEmail(fields.email);
          return { stored, valid: await verifyPassword(fields.password, stored?.passwordSalt, stored?.passwordHash) };
        });
        if (!stored || !valid) throw new HttpError(401, 'Email or password is incorrect.');
        const { passwordHash, passwordSalt, ...user } = stored;
        await startSession(req, res, user);
        return sendJson(res, 200, { user });
      }

      if (pathname === '/api/auth/me') {
        if (method !== 'GET') return allowMethods(res, ['GET']);
        return sendJson(res, 200, { user: await requireUser(req) });
      }

      if (pathname === '/api/auth/onboarding') {
        if (method !== 'POST') return allowMethods(res, ['POST']);
        const user = await requireUser(req);
        requireExpectedUser(req, user);
        objectWithFields(await readJson(req), []);
        return sendJson(res, 200, { user: await store.finishOnboarding(user.id) });
      }

      if (pathname === '/api/auth/logout') {
        if (method !== 'POST') return allowMethods(res, ['POST']);
        if (req.headers['x-hype-user'] !== undefined) {
          const user = await requireUser(req);
          requireExpectedUser(req, user);
        }
        const tokens = readSessionTokens(req);
        if (tokens.length) await store.deleteSessions(tokens.map(hashSessionToken));
        // Do not clear the browser cookie in a late response: another tab may
        // have already replaced it with a new login. The revoked token is inert.
        res.statusCode = 204;
        return res.end();
      }

      if (pathname === '/api/tasks') {
        if (!['GET', 'POST'].includes(method)) return allowMethods(res, ['GET', 'POST']);
        const user = await requireUser(req);
        requireExpectedUser(req, user);
        if (method === 'GET') return sendJson(res, 200, await store.list(user.id));
        const fields = validateFields(await readJson(req), { create: true });
        return sendJson(res, 201, await store.create(user.id, fields));
      }

      const taskRoute = /^\/api\/tasks\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(pathname);
      if (taskRoute) {
        if (!['GET', 'PATCH', 'DELETE'].includes(method)) return allowMethods(res, ['GET', 'PATCH', 'DELETE']);
        const user = await requireUser(req);
        requireExpectedUser(req, user);
        const id = taskRoute[1];
        if (method === 'GET') {
          const task = await store.get(user.id, id);
          if (!task) throw new HttpError(404, 'Task not found.');
          return sendJson(res, 200, task);
        }
        if (method === 'PATCH') {
          const fields = validateFields(await readJson(req));
          const task = await store.update(user.id, id, fields);
          if (!task) throw new HttpError(404, 'Task not found.');
          return sendJson(res, 200, task);
        }
        if (!await store.delete(user.id, id)) throw new HttpError(404, 'Task not found.');
        res.statusCode = 204;
        return res.end();
      }

      if (Object.hasOwn(STATIC, pathname)) {
        if (method !== 'GET' && method !== 'HEAD') return allowMethods(res, ['GET', 'HEAD']);
        const [filename, contentType] = STATIC[pathname];
        const content = await readFile(path.join(publicDir, filename));
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', content.length);
        res.statusCode = 200;
        return res.end(method === 'HEAD' ? undefined : content);
      }
      throw new HttpError(404, 'Not found.');
    } catch (err) {
      if (res.destroyed || res.writableEnded) return;
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('Request failed:', err);
      if (status === 413 || status === 415 || (!req.complete && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method))) {
        req.pause();
        res.setHeader('Connection', 'close');
      }
      return sendJson(res, status, { error: status === 500 ? 'Something went wrong.' : err.message, ...(err.code && status !== 500 ? { code: err.code } : {}) });
    }
  }

  return { handler };
}
