import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
test('HTTP writes persist in disposable PostgreSQL with least-privilege integration credentials', async () => {
  assert.equal(process.getuid(), 1000);
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.SESSION_SECRET, undefined);
  assert.equal(process.env.VERIFICATION_DATABASE_ADMIN_URL, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(new URL(process.env.TEST_DATABASE_URL).username, 'integration_worker');
  assert.equal(fs.readFileSync('/proc/net/route', 'utf8').split('\n').slice(1).some(line => /^\S+\s+00000000\s/.test(line)), false);
  assert.throws(() => fs.writeFileSync('/forbidden', 'no'));
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    const [role] = await db.$queryRaw`SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, has_schema_privilege(current_user, 'public', 'CREATE') AS can_ddl FROM pg_roles WHERE rolname=current_user`;
    assert.deepEqual(role, { name: 'integration_worker', rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, can_ddl: false });
    await assert.rejects(db.$executeRawUnsafe('CREATE TABLE public.forbidden_integration_table (id integer)'));
    const response = await fetch(new URL('/api/claims', process.env.TEST_BASE_URL), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reference: 'REG-HTTP' }) });
    assert.equal(response.status, 201); const created = await response.json();
    const saved = await db.claim.findUniqueOrThrow({ where: { reference: 'REG-HTTP' } });
    assert.equal(saved.id, created.id); assert.equal(saved.receipt, created.receipt); assert.equal(saved.receipt.length, 64);
    const read = await fetch(new URL('/api/claims', process.env.TEST_BASE_URL)); const body = await read.json();
    assert.equal(body.claims.some(claim => claim.id === saved.id && claim.reference === 'REG-HTTP'), true);
  } finally { await db.$disconnect(); }
});
