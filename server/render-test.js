#!/usr/bin/env node
/**
 * render-test.js  –  Automated integration test that simulates the exact
 * request flow a browser makes after login on the Render production build.
 *
 * Usage:
 *   node render-test.js [baseUrl]
 *   Default baseUrl = http://localhost:3001
 *
 * What it tests (in order):
 *   1. GET  /api/health         – server is alive
 *   2. POST /api/auth/login     – get JWT
 *   3. GET  /api/auth/me        – token works (this is what AuthContext does)
 *   4. GET  /api/dashboard      – the dashboard payload loads
 *   5. GET  /                   – SPA index.html is served
 *   6. GET  /dashboard          – SPA fallback serves index.html (not 404)
 *   7. POST /api/auth/register  – register a new user
 *   8. GET  /api/dashboard      – dashboard works for new user too
 *
 * Exit code 0 = all pass, 1 = at least one failure.
 */

const BASE = process.argv[2] || 'http://localhost:3001';
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASS  = 'Demo1234!';
const NEW_EMAIL  = `test_${Date.now()}@test.com`;
const NEW_PASS   = 'Test1234!';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌  ${name}`);
    console.log(`      Error: ${err.message}`);
    if (err.body) console.log(`      Body:  ${err.body.substring(0, 300)}`);
  }
}

async function req(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (networkErr) {
    const err = new Error(`Network error for ${method} ${path}: ${networkErr.message}`);
    throw err;
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: res.status, json, text, ok: res.ok, headers: res.headers };
}

function assert(condition, msg) {
  if (!condition) {
    const err = new Error(msg);
    throw err;
  }
}

function assertJson(r, path) {
  if (!r.json) {
    const err = new Error(`Expected JSON from ${path}, got: ${r.text.substring(0, 200)}`);
    err.body = r.text;
    throw err;
  }
}

(async () => {
  console.log(`\n🔍 Testing against: ${BASE}\n`);

  let demoToken = null;
  let newToken = null;

  // ── 1. Health ────────────────────────────────────────
  await test('GET /api/health returns { status: "ok" }', async () => {
    const r = await req('GET', '/api/health');
    assertJson(r, '/api/health');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.json.status === 'ok', `Expected status "ok", got ${JSON.stringify(r.json)}`);
  });

  // ── 1b. Debug endpoint ──────────────────────────────
  await test('GET /api/debug — diagnostics', async () => {
    const r = await req('GET', '/api/debug');
    assertJson(r, '/api/debug');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.json.paths, 'Missing paths in debug');
    assert(r.json.database, 'Missing database in debug');

    // Verify critical paths exist on the server
    const p = r.json.paths;
    assert(p.dbExists === true, `DB file missing at ${p.dbPath}`);
    assert(p.clientDistExists === true, `client/dist missing at ${p.clientDist}`);
    assert(p.indexHtmlExists === true, `index.html missing at ${p.indexHtml}`);

    // Verify DB has data
    const d = r.json.database;
    assert(d.ok === true, `DB check failed: ${d.error || 'unknown'}`);
    assert(d.users > 0, `No users in DB (${d.users})`);
    assert(d.rules > 0, `No schedule rules in DB (${d.rules})`);
    assert(d.serviceDefinitions > 0, `No service definitions in DB (${d.serviceDefinitions})`);

    console.log(`      → DB: ${d.users} users, ${d.vehicles} vehicles, ${d.rules} rules`);
    console.log(`      → Paths: clientDist=${p.clientDistExists}, indexHtml=${p.indexHtmlExists}, db=${p.dbExists}`);
    console.log(`      → Env: NODE_ENV=${r.json.env.NODE_ENV}, cwd=${r.json.env.cwd}`);
  });

  // ── 2. Login ─────────────────────────────────────────
  await test('POST /api/auth/login — demo user', async () => {
    const r = await req('POST', '/api/auth/login', {
      body: { email: DEMO_EMAIL, password: DEMO_PASS },
    });
    assertJson(r, '/api/auth/login');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.token, 'No token in response');
    assert(r.json.user, 'No user in response');
    assert(r.json.user.email === DEMO_EMAIL, `Wrong email: ${r.json.user.email}`);
    demoToken = r.json.token;
  });

  // ── 3. Auth/me ───────────────────────────────────────
  await test('GET /api/auth/me — verify token', async () => {
    assert(demoToken, 'No token from login');
    const r = await req('GET', '/api/auth/me', { token: demoToken });
    assertJson(r, '/api/auth/me');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.email === DEMO_EMAIL, `Wrong email: ${r.json.email}`);
  });

  // ── 4. Dashboard ─────────────────────────────────────
  await test('GET /api/dashboard — loads dashboard data', async () => {
    assert(demoToken, 'No token from login');
    const r = await req('GET', '/api/dashboard', { token: demoToken });
    assertJson(r, '/api/dashboard');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.summary, `No summary in response: ${JSON.stringify(r.json).substring(0, 200)}`);
    assert(Array.isArray(r.json.vehicles), 'vehicles should be an array');
    assert(Array.isArray(r.json.actionItems), 'actionItems should be an array');
    assert(typeof r.json.summary.totalVehicles === 'number', 'totalVehicles should be a number');
    console.log(`      → ${r.json.summary.totalVehicles} vehicles, ${r.json.summary.overdueServices} overdue, ${r.json.summary.upcomingServices} upcoming`);
  });

  // ── 5. SPA root ──────────────────────────────────────
  await test('GET / — serves index.html', async () => {
    const r = await req('GET', '/');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.text.includes('<!DOCTYPE html>') || r.text.includes('<html'), 'Expected HTML');
    assert(r.text.includes('<div id="root"'), 'Expected React root div');
  });

  // ── 6. SPA fallback ─────────────────────────────────
  await test('GET /dashboard — SPA fallback serves index.html', async () => {
    const r = await req('GET', '/dashboard');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.text.includes('<!DOCTYPE html>') || r.text.includes('<html'), 'Expected HTML');
  });

  // ── 7. Dashboard without token → 401 ────────────────
  await test('GET /api/dashboard — no token returns 401', async () => {
    const r = await req('GET', '/api/dashboard');
    assert(r.status === 401, `Expected 401, got ${r.status}: ${r.text.substring(0, 200)}`);
    assertJson(r, '/api/dashboard (no auth)');
    assert(r.json.error, 'Expected error field');
  });

  // ── 8. Register new user ─────────────────────────────
  await test('POST /api/auth/register — new user', async () => {
    const r = await req('POST', '/api/auth/register', {
      body: { email: NEW_EMAIL, password: NEW_PASS, firstName: 'Test', lastName: 'User' },
    });
    assertJson(r, '/api/auth/register');
    assert(r.status === 201, `Expected 201, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.token, 'No token in response');
    newToken = r.json.token;
  });

  // ── 9. Dashboard for new user ────────────────────────
  await test('GET /api/dashboard — new user (empty)', async () => {
    assert(newToken, 'No token from register');
    const r = await req('GET', '/api/dashboard', { token: newToken });
    assertJson(r, '/api/dashboard');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.summary.totalVehicles === 0, `Expected 0 vehicles for new user, got ${r.json.summary.totalVehicles}`);
  });

  // ── 10. CORS preflight ──────────────────────────────
  await test('OPTIONS /api/dashboard — CORS preflight', async () => {
    const url = `${BASE}/api/dashboard`;
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://vehicle-maintenance.onrender.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    // CORS middleware should respond with 2xx and include allow-origin
    assert(res.status < 300, `Expected 2xx for OPTIONS, got ${res.status}`);
    const acao = res.headers.get('access-control-allow-origin');
    assert(acao, `Missing Access-Control-Allow-Origin header. Headers: ${[...res.headers.entries()].map(([k,v])=>`${k}:${v}`).join(', ')}`);
  });

  // ── Summary ──────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'─'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
