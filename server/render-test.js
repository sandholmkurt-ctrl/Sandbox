#!/usr/bin/env node
/**
 * render-test.js  –  Integration tests that simulate the EXACT browser
 * request flow, including React's AuthContext + DashboardPage lifecycle.
 *
 * Usage:
 *   node render-test.js [baseUrl]
 *   Default baseUrl = http://localhost:3001
 *
 * Tests are grouped into scenarios that replicate what happens in the browser.
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
    if (err.body) console.log(`      Body:  ${err.body.substring(0, 500)}`);
  }
}

async function req(method, path, { body, token, cookies } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cookies) headers['Cookie'] = cookies;

  const opts = { method, headers, redirect: 'manual' };
  if (body) opts.body = JSON.stringify(body);

  const url = `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (networkErr) {
    throw new Error(`Network error for ${method} ${path}: ${networkErr.message}`);
  }

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: res.status, json, text, ok: res.ok, headers: res.headers };
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
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

  // ═══════════════════════════════════════════════════════
  console.log('─── Scenario 1: Server is alive ───');
  // ═══════════════════════════════════════════════════════

  await test('GET /api/health returns { status: "ok" }', async () => {
    const r = await req('GET', '/api/health');
    assertJson(r, '/api/health');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.json.status === 'ok', `Expected status "ok", got ${JSON.stringify(r.json)}`);
  });

  await test('GET /api/debug — diagnostics', async () => {
    const r = await req('GET', '/api/debug');
    assertJson(r, '/api/debug');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const p = r.json.paths;
    assert(p.dbExists === true, `DB file missing at ${p.dbPath}`);
    assert(p.clientDistExists === true, `client/dist missing at ${p.clientDist}`);
    assert(p.indexHtmlExists === true, `index.html missing at ${p.indexHtml}`);
    const d = r.json.database;
    assert(d.ok === true, `DB check failed: ${d.error || 'unknown'}`);
    assert(d.users > 0, `No users in DB (${d.users})`);
    assert(d.rules > 0, `No rules in DB (${d.rules})`);
    console.log(`      → DB: ${d.users} users, ${d.vehicles} vehicles, ${d.rules} rules`);
    console.log(`      → Env: NODE_ENV=${r.json.env.NODE_ENV}, cwd=${r.json.env.cwd}`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 2: Fresh login → dashboard (browser flow) ───');
  // Simulates: user visits /login, submits form, React navigates to /dashboard
  // AuthContext: login() → api.setToken() → setUser() → dashboard renders
  // DashboardPage useEffect fires api.get('/dashboard')
  // AuthContext useEffect fires api.get('/auth/me') (concurrent!)
  // ═══════════════════════════════════════════════════════

  let loginToken = null;
  let loginUser = null;

  await test('Step 1: POST /api/auth/login — get token', async () => {
    const r = await req('POST', '/api/auth/login', {
      body: { email: DEMO_EMAIL, password: DEMO_PASS },
    });
    assertJson(r, '/api/auth/login');
    assert(r.status === 200, `Expected 200, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.token, 'No token in login response');
    assert(r.json.user, 'No user in login response');
    assert(r.json.user.email === DEMO_EMAIL, `Wrong email: ${r.json.user.email}`);
    loginToken = r.json.token;
    loginUser = r.json.user;
    console.log(`      → Token: ${loginToken.substring(0, 20)}...`);
    console.log(`      → User ID: ${loginUser.id}`);
  });

  // CRITICAL TEST: After login, React fires /auth/me AND /dashboard concurrently
  await test('Step 2: CONCURRENT /auth/me + /dashboard (React lifecycle)', async () => {
    assert(loginToken, 'No token from login');
    const [meResult, dashResult] = await Promise.all([
      req('GET', '/api/auth/me', { token: loginToken }),
      req('GET', '/api/dashboard', { token: loginToken }),
    ]);

    assertJson(meResult, '/api/auth/me');
    assert(meResult.status === 200, `/auth/me failed: ${meResult.status} — ${meResult.text.substring(0, 200)}`);
    assert(meResult.json.email === DEMO_EMAIL, `Wrong user from /auth/me`);

    assertJson(dashResult, '/api/dashboard');
    assert(dashResult.status === 200, `/dashboard failed: ${dashResult.status} — ${dashResult.text.substring(0, 200)}`);
    assert(dashResult.json.summary, `Missing summary: ${JSON.stringify(dashResult.json).substring(0, 200)}`);
    console.log(`      → /auth/me: ${meResult.status} ✓`);
    console.log(`      → /dashboard: ${dashResult.status} ✓ (${dashResult.json.summary.totalVehicles} vehicles)`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 3: Page reload (token from localStorage) ───');
  // User has token in localStorage, reloads page on /dashboard
  // AuthContext reads token → calls /auth/me → THEN renders dashboard
  // ═══════════════════════════════════════════════════════

  await test('Step 1: /auth/me with stored token', async () => {
    assert(loginToken, 'No token from login');
    const r = await req('GET', '/api/auth/me', { token: loginToken });
    assertJson(r, '/api/auth/me');
    assert(r.status === 200, `/auth/me failed on reload: ${r.status} — ${r.text.substring(0, 200)}`);
  });

  await test('Step 2: /dashboard with same stored token', async () => {
    assert(loginToken, 'No token from login');
    const r = await req('GET', '/api/dashboard', { token: loginToken });
    assertJson(r, '/api/dashboard');
    assert(r.status === 200, `/dashboard failed on reload: ${r.status} — ${r.text.substring(0, 200)}`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 4: No token → 401 ───');
  // ═══════════════════════════════════════════════════════

  await test('/api/dashboard without token → 401', async () => {
    const r = await req('GET', '/api/dashboard');
    assert(r.status === 401, `Expected 401, got ${r.status}: ${r.text.substring(0, 200)}`);
    assertJson(r, '/api/dashboard (no auth)');
    assert(r.json.error, 'Expected error field in 401 response');
    console.log(`      → Error: "${r.json.error}"`);
  });

  await test('/api/auth/me without token → 401', async () => {
    const r = await req('GET', '/api/auth/me');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 5: Bad token → 401 JSON (NOT HTML!) ───');
  // Server must return JSON 401 for bad tokens on API routes.
  // Old bug: SPA catch-all was serving HTML for unmatched routes.
  // ═══════════════════════════════════════════════════════

  await test('/api/dashboard with garbage token → 401 JSON', async () => {
    const r = await req('GET', '/api/dashboard', { token: 'invalid.garbage.token' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assertJson(r, '/api/dashboard (bad token)');
    assert(r.json.error, 'Expected error field');
    assert(!r.text.includes('<!DOCTYPE html>'), 'Got HTML instead of JSON for API 401!');
    console.log(`      → Error: "${r.json.error}"`);
  });

  await test('/api/auth/me with garbage token → 401 JSON', async () => {
    const r = await req('GET', '/api/auth/me', { token: 'invalid.garbage.token' });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assertJson(r, '/api/auth/me (bad token)');
    assert(!r.text.includes('<!DOCTYPE html>'), 'Got HTML instead of JSON for API 401!');
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 6: Register → dashboard (new user, empty) ───');
  // ═══════════════════════════════════════════════════════

  let newToken = null;

  await test('Register new user', async () => {
    const r = await req('POST', '/api/auth/register', {
      body: { email: NEW_EMAIL, password: NEW_PASS, firstName: 'Test', lastName: 'User' },
    });
    assertJson(r, '/api/auth/register');
    assert(r.status === 201, `Expected 201, got ${r.status}: ${r.text.substring(0, 200)}`);
    assert(r.json.token, 'No token in register response');
    newToken = r.json.token;
  });

  await test('New user: concurrent /auth/me + /dashboard', async () => {
    assert(newToken, 'No token from register');
    const [meResult, dashResult] = await Promise.all([
      req('GET', '/api/auth/me', { token: newToken }),
      req('GET', '/api/dashboard', { token: newToken }),
    ]);
    assert(meResult.status === 200, `/auth/me failed: ${meResult.status}`);
    assert(dashResult.status === 200, `/dashboard failed: ${dashResult.status} — ${dashResult.text.substring(0, 200)}`);
    assert(dashResult.json.summary.totalVehicles === 0, `Expected 0 vehicles for new user`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 7: Cookie-based auth (proxy redirect survival) ───');
  // This tests the critical fix: when a corporate proxy strips
  // the Authorization header during a 307 redirect, the auth_token
  // cookie still works as a fallback.
  // ═══════════════════════════════════════════════════════

  let loginCookies = null;

  await test('Login returns Set-Cookie with auth_token', async () => {
    const r = await req('POST', '/api/auth/login', {
      body: { email: DEMO_EMAIL, password: DEMO_PASS },
    });
    assertJson(r, '/api/auth/login');
    assert(r.status === 200, `Expected 200, got ${r.status}`);

    const setCookieHeader = r.headers.get('set-cookie');
    assert(setCookieHeader, 'No Set-Cookie header in login response');
    assert(setCookieHeader.includes('auth_token='), `Set-Cookie missing auth_token: ${setCookieHeader}`);
    console.log(`      → Set-Cookie: ${setCookieHeader.substring(0, 80)}...`);

    // Extract the cookie for subsequent requests
    loginCookies = setCookieHeader.split(';')[0]; // e.g., "auth_token=eyJ..."
  });

  await test('Cookie-only auth: /dashboard WITHOUT header, WITH cookie → 200', async () => {
    assert(loginCookies, 'No cookie from login');
    // Send request with ONLY the cookie (no Authorization header)
    // This simulates what happens after a proxy strips the header
    const r = await req('GET', '/api/dashboard', { cookies: loginCookies });
    assertJson(r, '/api/dashboard (cookie auth)');
    assert(r.status === 200, `/dashboard with cookie-only auth failed: ${r.status} — ${r.text.substring(0, 200)}`);
    assert(r.json.summary, 'Missing summary in cookie-auth dashboard response');
    console.log(`      → Dashboard loaded via cookie-only auth ✓ (${r.json.summary.totalVehicles} vehicles)`);
  });

  await test('Cookie-only auth: /auth/me WITHOUT header, WITH cookie → 200', async () => {
    assert(loginCookies, 'No cookie from login');
    const r = await req('GET', '/api/auth/me', { cookies: loginCookies });
    assertJson(r, '/auth/me (cookie auth)');
    assert(r.status === 200, `/auth/me with cookie-only auth failed: ${r.status} — ${r.text.substring(0, 200)}`);
    assert(r.json.email === DEMO_EMAIL, `Wrong email from cookie auth: ${r.json.email}`);
    console.log(`      → /auth/me via cookie auth: ${r.json.email} ✓`);
  });

  await test('Logout clears auth_token cookie', async () => {
    const r = await req('POST', '/api/auth/logout', { cookies: loginCookies });
    assertJson(r, '/api/auth/logout');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const setCookie = r.headers.get('set-cookie') || '';
    // Express clears cookies with Expires=epoch or Max-Age=0
    const cookieCleared = setCookie.includes('auth_token=') &&
      (setCookie.includes('Max-Age=0') || setCookie.includes('Expires=Thu, 01 Jan 1970'));
    assert(cookieCleared, `Logout should clear cookie. Set-Cookie: ${setCookie}`);
    console.log(`      → Cookie cleared ✓`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 8: SPA + API route separation ───');
  // ═══════════════════════════════════════════════════════

  await test('GET / → index.html with React root', async () => {
    const r = await req('GET', '/');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.text.includes('<div id="root"'), 'Missing React root div');
  });

  await test('GET /dashboard → SPA fallback (not 404)', async () => {
    const r = await req('GET', '/dashboard');
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.text.includes('<html'), 'Expected HTML');
  });

  await test('GET /api/nonexistent → 404 JSON (not HTML)', async () => {
    const r = await req('GET', '/api/nonexistent');
    assert(r.status === 404, `Expected 404, got ${r.status}`);
    assertJson(r, '/api/nonexistent');
    assert(!r.text.includes('<!DOCTYPE html>'), 'Got HTML for unknown API route!');
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 9: CORS preflight ───');
  // ═══════════════════════════════════════════════════════

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
    assert(res.status < 300, `Expected 2xx for OPTIONS, got ${res.status}`);
    const acao = res.headers.get('access-control-allow-origin');
    assert(acao, `Missing Access-Control-Allow-Origin header`);
  });

  // ═══════════════════════════════════════════════════════
  console.log('\n─── Scenario 10: Proxy-resilience simulation ───');
  // Simulates what happens when a corporate proxy strips the
  // Authorization header. The server should still accept the
  // request via cookie-based auth. And the client's retry logic
  // should handle transient 401s.
  // ═══════════════════════════════════════════════════════

  await test('Proxy scenario: request WITHOUT header succeeds WITH cookie', async () => {
    // Log in fresh to get both a token and a cookie
    const loginR = await req('POST', '/api/auth/login', {
      body: { email: DEMO_EMAIL, password: DEMO_PASS },
    });
    assert(loginR.status === 200, `Login failed: ${loginR.status}`);
    const setCookie = loginR.headers.get('set-cookie') || '';
    assert(setCookie.includes('auth_token='), 'No auth_token cookie set');
    const cookie = setCookie.split(';')[0];

    // Simulate proxy stripping the Authorization header: send ONLY the cookie
    const dashR = await req('GET', '/api/dashboard', { cookies: cookie });
    assertJson(dashR, '/api/dashboard (cookie-only)');
    assert(dashR.status === 200,
      `Dashboard with cookie-only auth failed: ${dashR.status} — ${dashR.text.substring(0, 200)}`);
    console.log(`      → Cookie-only dashboard: ${dashR.json.summary.totalVehicles} vehicles ✓`);
  });

  await test('Proxy scenario: request WITHOUT header AND WITHOUT cookie → 401', async () => {
    // No auth at all — should fail cleanly with JSON 401
    const r = await req('GET', '/api/dashboard');
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assertJson(r, '/api/dashboard (no auth)');
    assert(r.json.error === 'Authentication required',
      `Expected "Authentication required", got "${r.json.error}"`);
  });

  // ═══════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
