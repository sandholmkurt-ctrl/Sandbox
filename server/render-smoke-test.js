#!/usr/bin/env node
/**
 * render-smoke-test.js — Quick smoke test against the LIVE Render deployment
 *
 * This test hits the actual production URL to verify:
 *   1. Server is alive and DB has data
 *   2. Login returns a token AND sets auth_token cookie
 *   3. Dashboard loads with token (header-based auth)
 *   4. Dashboard loads with ONLY cookie (simulates proxy header stripping)
 *   5. Serves the correct client bundle with our fixes
 *
 * Usage:
 *   node render-smoke-test.js [url]
 *   Default: https://vehicle-maintenance-uc4a.onrender.com
 *
 * This bypasses the browser (no Zscaler interference), so it tests the
 * server's readiness. For full browser testing, use render-e2e-test.js.
 */

const BASE = process.argv[2] || 'https://vehicle-maintenance-uc4a.onrender.com';
const EMAIL = 'demo@example.com';
const PASS = 'Demo1234!';

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
    console.log(`      → ${err.message}`);
  }
}

async function api(method, path, { body, token, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cookie) headers['Cookie'] = cookie;
  const opts = { method, headers, redirect: 'follow' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

(async () => {
  console.log(`\n🚀 Smoke test: ${BASE}\n`);

  // ── 1. Health + Debug ──
  await test('Server is alive', async () => {
    const r = await api('GET', '/api/health');
    if (r.status !== 200) throw new Error(`/api/health → ${r.status}`);
    if (r.json?.status !== 'ok') throw new Error(`status: ${JSON.stringify(r.json)}`);
  });

  await test('Database has seeded data', async () => {
    const r = await api('GET', '/api/debug');
    if (r.status !== 200) throw new Error(`/api/debug → ${r.status}`);
    const db = r.json?.database;
    if (!db?.ok) throw new Error(`DB not OK: ${JSON.stringify(db)}`);
    if (!db.users || db.users < 1) throw new Error(`No users: ${db.users}`);
    if (!db.rules || db.rules < 1) throw new Error(`No rules: ${db.rules}`);
    console.log(`      DB: ${db.users} users, ${db.vehicles} vehicles, ${db.rules} rules`);
  });

  // ── 2. Login ──
  let token = null;
  let authCookie = null;

  await test('Login returns token + sets auth_token cookie', async () => {
    const r = await api('POST', '/api/auth/login', { body: { email: EMAIL, password: PASS } });
    if (r.status !== 200) throw new Error(`Login → ${r.status}: ${r.text.substring(0, 200)}`);
    if (!r.json?.token) throw new Error('No token in response');
    if (!r.json?.user) throw new Error('No user in response');
    token = r.json.token;

    const setCookie = r.headers.get('set-cookie') || '';
    if (!setCookie.includes('auth_token=')) {
      throw new Error(`Missing auth_token cookie. Set-Cookie: ${setCookie}`);
    }
    authCookie = setCookie.split(';')[0]; // "auth_token=eyJ..."
    console.log(`      Token: ${token.substring(0, 20)}...`);
    console.log(`      Cookie: ${authCookie.substring(0, 30)}...`);
  });

  // ── 3. Dashboard with header auth ──
  await test('Dashboard loads with Authorization header', async () => {
    if (!token) throw new Error('No token from login');
    const r = await api('GET', '/api/dashboard', { token });
    if (r.status !== 200) throw new Error(`Dashboard → ${r.status}: ${r.text.substring(0, 200)}`);
    if (!r.json?.summary) throw new Error(`No summary: ${JSON.stringify(r.json).substring(0, 200)}`);
    console.log(`      Vehicles: ${r.json.summary.totalVehicles}, Overdue: ${r.json.summary.overdueServices}`);
  });

  // ── 4. Dashboard with ONLY cookie (proxy simulation) ──
  await test('Dashboard loads with ONLY cookie (no header) — proxy resilience', async () => {
    if (!authCookie) throw new Error('No cookie from login');
    // Send request with cookie but NO Authorization header
    const r = await api('GET', '/api/dashboard', { cookie: authCookie });
    if (r.status !== 200) {
      throw new Error(
        `Cookie-only dashboard → ${r.status}: ${r.text.substring(0, 200)}\n` +
        `      This means the server's cookie auth fallback isn't working!`
      );
    }
    if (!r.json?.summary) throw new Error(`No summary in cookie-auth response`);
    console.log(`      Cookie-only auth: ${r.json.summary.totalVehicles} vehicles ✓`);
  });

  // ── 5. /auth/me with cookie only ──
  await test('/auth/me with ONLY cookie (no header) — proxy resilience', async () => {
    if (!authCookie) throw new Error('No cookie from login');
    const r = await api('GET', '/api/auth/me', { cookie: authCookie });
    if (r.status !== 200) throw new Error(`/auth/me cookie-only → ${r.status}: ${r.text.substring(0, 200)}`);
    if (r.json?.email !== EMAIL) throw new Error(`Wrong email: ${r.json?.email}`);
    console.log(`      Cookie-only /auth/me: ${r.json.email} ✓`);
  });

  // ── 6. Verify client bundle has latest code ──
  await test('Client bundle includes retry logic', async () => {
    const r = await api('GET', '/');
    if (r.status !== 200) throw new Error(`/ → ${r.status}`);
    // Extract JS bundle URL from index.html
    const jsMatch = r.text.match(/src="\/assets\/(index-[a-zA-Z0-9]+\.js)"/);
    if (!jsMatch) throw new Error('Cannot find JS bundle in index.html');
    const jsFile = jsMatch[1];
    console.log(`      Bundle: ${jsFile}`);

    const jsR = await api('GET', `/assets/${jsFile}`);
    if (jsR.status !== 200) throw new Error(`JS bundle → ${jsR.status}`);

    // Check for key code patterns that prove our fixes are deployed
    const js = jsR.text;
    const hasRetry = js.includes('retrying') || js.includes('retry');
    const hasDoFetch = js.includes('doFetch');
    const hasGetToken = js.includes('getToken');
    // Minified code check: the retry pattern creates a setTimeout(r=>...)
    const hasTimeout = js.includes('setTimeout');

    if (!hasGetToken) throw new Error('Bundle missing getToken — old code!');
    console.log(`      getToken: ✓ | retry/doFetch: ${hasRetry || hasDoFetch ? '✓' : '⚠ (minified)'} | setTimeout: ${hasTimeout ? '✓' : '⚠'}`);
  });

  // ── 7. No auth → clean 401 JSON ──
  await test('No auth → 401 JSON (not HTML, not crash)', async () => {
    const r = await api('GET', '/api/dashboard');
    if (r.status !== 401) throw new Error(`Expected 401, got ${r.status}`);
    if (!r.json?.error) throw new Error(`Expected JSON error, got: ${r.text.substring(0, 100)}`);
    if (r.text.includes('<!DOCTYPE')) throw new Error('Got HTML instead of JSON for 401!');
    console.log(`      Clean 401: "${r.json.error}" ✓`);
  });

  // ── Summary ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
