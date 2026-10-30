import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { database, GET, POST } from './src/app/api/claims/route.mjs';

// Fail before serving requests if credential separation or least privilege fails.
assert.equal(new URL(process.env.DATABASE_URL).username, 'application_worker');
assert.ok(process.env.SESSION_SECRET);
assert.equal(process.env.TEST_DATABASE_URL, undefined);
assert.equal(process.env.VERIFICATION_DATABASE_ADMIN_URL, undefined);
assert.equal(process.env.OPENAI_API_KEY, undefined);
const [role] = await database.$queryRaw`SELECT current_user AS name, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, has_schema_privilege(current_user, 'public', 'CREATE') AS can_ddl FROM pg_roles WHERE rolname=current_user`;
assert.deepEqual(role, { name: 'application_worker', rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, can_ddl: false });
await assert.rejects(database.$executeRawUnsafe('CREATE TABLE public.forbidden_application_table (id integer)'));
createServer(async (request, response) => {
  try {
    if (request.url !== '/api/claims') { response.writeHead(200); response.end('Ready'); return; }
    const chunks = []; let length = 0;
    for await (const part of request) { length += part.length; if (length > 65536) throw new Error('Request too large'); chunks.push(part); }
    const web = new Request('http://application/api/claims', { method: request.method, ...(request.method === 'POST' ? { body: Buffer.concat(chunks).toString() } : {}) });
    const result = request.method === 'POST' ? await POST(web) : await GET();
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  } catch { response.writeHead(500); response.end('Request failed'); }
}).listen(3000, '0.0.0.0');
