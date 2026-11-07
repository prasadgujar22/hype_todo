import { randomUUID } from 'node:crypto';

// The caller supplies the PostgreSQL client/pool and is responsible for closing it.
// Password hashes and salts are produced by the caller with scrypt; this store never
// accepts or stores a plaintext password or a raw session token.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date DATE,
    project TEXT NOT NULL DEFAULT 'Personal' CHECK (project IN ('Personal', 'Work', 'Ideas')),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // This also prevents duplicates inserted outside this store with different
  // email casing or surrounding spaces.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_idx
    ON users (lower(btrim(email)))`,
  `CREATE INDEX IF NOT EXISTS tasks_user_created_idx
    ON tasks (user_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at)`,
];

const TASK_COLUMNS = `id, title, notes, priority,
  to_char(due_date, 'YYYY-MM-DD') AS due_date, project, completed,
  created_at, updated_at, completed_at`;
const USER_COLUMNS = 'id, name, email, onboarded, created_at';

// Even IF NOT EXISTS can encounter a system-catalog uniqueness race when
// separate processes start against a fresh database simultaneously.
const CATALOG_RACE_CONSTRAINTS = new Set([
  'pg_class_relname_nsp_index',
  'pg_type_typname_nsp_index',
  'pg_attribute_relid_attnam_index',
]);

// Only these fixed identifiers may enter a dynamically constructed UPDATE.
const TASK_UPDATE_COLUMNS = Object.freeze({
  title: 'title',
  notes: 'notes',
  priority: 'priority',
  dueDate: 'due_date',
  project: 'project',
  completed: 'completed',
});

function isoTimestamp(value) {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function isoDate(value) {
  if (value == null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return isoTimestamp(value).slice(0, 10);
}

function asBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

function taskFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    priority: row.priority,
    dueDate: isoDate(row.due_date),
    project: row.project,
    completed: asBoolean(row.completed),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
    completedAt: isoTimestamp(row.completed_at),
  };
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    onboarded: asBoolean(row.onboarded),
    createdAt: isoTimestamp(row.created_at),
  };
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function requireFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('Task fields must be an object.');
  }
  if (Object.hasOwn(fields, 'completed') && typeof fields.completed !== 'boolean') {
    throw new TypeError('Task completed must be a boolean.');
  }
}

/** Initialize an additive PostgreSQL schema and return an asynchronous store. */
export async function createStore(db) {
  // Tables with foreign keys and their indexes must be created in order, not
  // concurrently. IF NOT EXISTS keeps repeated initialization additive. Retry
  // only catalog/object collisions from another concurrent initializer; real
  // data-uniqueness and permission errors must still fail immediately.
  for (const statement of SCHEMA) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await db.query(statement, []);
        break;
      } catch (error) {
        const collision = error?.code === '42P07' || error?.code === '42710'
          || (error?.code === '23505' && CATALOG_RACE_CONSTRAINTS.has(error.constraint));
        if (!collision || attempt >= 2) throw error;
      }
    }
  }

  async function get(userId, taskId) {
    const result = await db.query(
      `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = $1 AND id = $2`,
      [userId, taskId],
    );
    return taskFromRow(result.rows[0]);
  }

  return {
    async list(userId) {
      const result = await db.query(
        `SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
        [userId],
      );
      return result.rows.map(taskFromRow);
    },

    get,

    async create(userId, fields) {
      requireFields(fields);
      const now = new Date().toISOString();
      const completed = fields.completed ?? false;
      const result = await db.query(
        `INSERT INTO tasks
          (id, user_id, title, notes, priority, due_date, project, completed, created_at, updated_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${TASK_COLUMNS}`,
        [randomUUID(), userId, fields.title, fields.notes ?? '', fields.priority ?? 'medium',
          fields.dueDate ?? null, fields.project ?? 'Personal', completed, now, now,
          completed ? now : null],
      );
      return taskFromRow(result.rows[0]);
    },

    async update(userId, taskId, fields) {
      requireFields(fields);
      const values = [userId, taskId, new Date().toISOString()];
      const assignments = [];
      for (const [field, column] of Object.entries(TASK_UPDATE_COLUMNS)) {
        if (!Object.hasOwn(fields, field)) continue;
        values.push(fields[field]);
        const param = `$${values.length}`;
        if (field === 'completed') {
          // UPDATE expressions read the pre-update row under PostgreSQL's row
          // lock, so concurrent completion changes preserve the right time.
          assignments.push(`completed_at = CASE
            WHEN ${param}::boolean AND NOT completed THEN $3::timestamptz
            WHEN NOT ${param}::boolean THEN NULL
            ELSE completed_at END`);
        }
        assignments.push(`${column} = ${param}`);
      }
      if (!assignments.length) return get(userId, taskId);
      assignments.push('updated_at = $3::timestamptz');
      const result = await db.query(
        `UPDATE tasks SET ${assignments.join(', ')}
         WHERE user_id = $1 AND id = $2 RETURNING ${TASK_COLUMNS}`,
        values,
      );
      return taskFromRow(result.rows[0]);
    },

    async delete(userId, taskId) {
      const result = await db.query(
        'DELETE FROM tasks WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, taskId],
      );
      return result.rows.length > 0;
    },

    async createUser({ id, name, email, passwordHash, passwordSalt }) {
      const result = await db.query(
        `INSERT INTO users (id, name, email, password_hash, password_salt)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
        [id ?? randomUUID(), name, normalizeEmail(email), passwordHash, passwordSalt],
      );
      return userFromRow(result.rows[0]);
    },

    async findUserByEmail(email) {
      const result = await db.query(
        `SELECT ${USER_COLUMNS}, password_hash, password_salt FROM users
         WHERE lower(btrim(email)) = $1`,
        [normalizeEmail(email)],
      );
      const row = result.rows[0];
      if (!row) return null;
      return { ...userFromRow(row), passwordHash: row.password_hash, passwordSalt: row.password_salt };
    },

    async getUserBySession(tokenHash, now) {
      const cutoff = now == null ? new Date().toISOString() : isoTimestamp(now);
      // Authentication is a convenient opportunity to purge expired sessions;
      // the expiry index keeps this bounded by the expired rows.
      await db.query('DELETE FROM sessions WHERE expires_at <= $1::timestamptz', [cutoff]);
      const result = await db.query(
        `SELECT u.id, u.name, u.email, u.onboarded, u.created_at
         FROM sessions AS s JOIN users AS u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > $2::timestamptz`,
        [tokenHash, cutoff],
      );
      return userFromRow(result.rows[0]);
    },

    async createSession({ tokenHash, userId, expiresAt }) {
      const result = await db.query(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3) RETURNING token_hash, user_id, expires_at`,
        [tokenHash, userId, isoTimestamp(expiresAt)],
      );
      const row = result.rows[0];
      return { tokenHash: row.token_hash, userId: row.user_id, expiresAt: isoTimestamp(row.expires_at) };
    },

    async deleteSession(tokenHash) {
      const result = await db.query('DELETE FROM sessions WHERE token_hash = $1 RETURNING token_hash', [tokenHash]);
      return result.rows.length > 0;
    },

    async deleteSessions(tokenHashes) {
      if (!tokenHashes.length) return 0;
      const result = await db.query('DELETE FROM sessions WHERE token_hash = ANY($1::text[]) RETURNING token_hash', [tokenHashes]);
      return result.rows.length;
    },

    async finishOnboarding(userId) {
      const result = await db.query(
        `UPDATE users SET onboarded = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
        [true, userId],
      );
      return userFromRow(result.rows[0]);
    },
  };
}
