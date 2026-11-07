import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createStore } from '../lib/store.js';

// Supply a disposable PostgreSQL database in TEST_DATABASE_URL. A unique schema
// is created and removed; the rest of the database is never modified.
test('PostgreSQL persists data and enforces task ownership', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run the PostgreSQL integration test',
}, async () => {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  const schema = `hype_test_${randomBytes(8).toString('hex')}`;
  let created = false;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await client.query(`SET search_path TO "${schema}"`);
    const store = await createStore(client);
    const idA = randomUUID();
    const idB = randomUUID();
    const userA = await store.createUser({ id: idA, name: 'A', email: 'a@example.com', passwordHash: 'hash-a', passwordSalt: 'salt-a' });
    const userB = await store.createUser({ id: idB, name: 'B', email: 'b@example.com', passwordHash: 'hash-b', passwordSalt: 'salt-b' });
    assert.equal(userA.onboarded, false);
    assert.equal(userB.email, 'b@example.com');
    assert.ok(!Object.hasOwn(userA, 'passwordHash'));
    await assert.rejects(() => store.createUser({ id: randomUUID(), name: 'Duplicate', email: 'a@example.com', passwordHash: 'x', passwordSalt: 'x' }), { code: '23505' });
    const original = await store.create(idA, { title: 'Hello', dueDate: '2028-02-29', priority: 'high', project: 'Work' });
    assert.equal(original.dueDate, '2028-02-29');
    assert.equal((await store.list(idA)).length, 1);
    assert.equal((await store.list(idB)).length, 0);
    assert.equal(await store.get(idB, original.id), null);
    assert.equal(await store.update(idB, original.id, { title: 'No' }), null);
    assert.equal(await store.delete(idB, original.id), false);
    const done = await store.update(idA, original.id, { completed: true });
    assert.equal(done.completed, true);
    assert.ok(done.completedAt);
    const edited = await store.update(idA, original.id, { title: 'Updated' });
    assert.equal(edited.completedAt, done.completedAt);
    const reopened = await store.update(idA, original.id, { completed: false, dueDate: null });
    assert.equal(reopened.completedAt, null);
    assert.equal(reopened.dueDate, null);
    await store.createSession({ tokenHash: 'only-a-hash', userId: idA, expiresAt: '2099-01-01T00:00:00.000Z' });
    assert.equal((await store.getUserBySession('only-a-hash', new Date().toISOString())).id, idA);
    assert.equal(await store.getUserBySession('only-a-hash', '2100-01-01T00:00:00.000Z'), null);
    await store.createSession({ tokenHash: 'batch-a', userId: idA, expiresAt: '2099-01-01T00:00:00.000Z' });
    await store.createSession({ tokenHash: 'batch-b', userId: idB, expiresAt: '2099-01-01T00:00:00.000Z' });
    assert.equal(await store.deleteSessions(['batch-a', 'batch-b']), 2);
    assert.equal(await store.getUserBySession('batch-a', new Date().toISOString()), null);
    assert.equal((await store.finishOnboarding(idA)).onboarded, true);
    const reopenedStore = await createStore(client);
    assert.equal((await reopenedStore.get(idA, original.id)).title, 'Updated');
    assert.equal((await reopenedStore.findUserByEmail('a@example.com')).onboarded, true);
  } finally {
    if (created) {
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await client.end();
  }
});
