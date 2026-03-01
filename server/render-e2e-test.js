#!/usr/bin/env node
/**
 * render-e2e-test.js — End-to-end browser test for the Vehicle Maintenance app
 *
 * This test uses Puppeteer to launch a REAL browser against the live Render
 * deployment (or any URL). Unlike render-test.js which only tests server APIs,
 * this test exercises the actual React client code — catching bugs in token
 * management, auth flow, and component rendering that server-only tests miss.
 *
 * Usage:
 *   node render-e2e-test.js [baseUrl]
 *   Default baseUrl = https://vehicle-maintenance-uc4a.onrender.com
 *
 * What it tests:
 *   1. Page loads and React app renders
 *   2. Login form submission works
 *   3. After login, dashboard actually loads (not "Authentication required")
 *   4. Network requests carry Authorization headers
 *   5. Page reload preserves auth and dashboard loads
 *   6. Logout works and redirects to login
 *
 * Exit code 0 = all pass, 1 = at least one failure.
 */

const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'https://vehicle-maintenance-uc4a.onrender.com';
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASS = 'Demo1234!';
const TIMEOUT = 30000; // 30s per action (Render free tier can be slow)

let passed = 0;
let failed = 0;
const networkLog = [];

function log(msg) {
  console.log(msg);
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    log(`  ✅  ${name}`);
  } catch (err) {
    failed++;
    log(`  ❌  ${name}`);
    log(`      Error: ${err.message}`);
    if (err.screenshot) log(`      Screenshot: ${err.screenshot}`);
  }
}

(async () => {
  log(`\n🔍 E2E Testing against: ${BASE}\n`);

  // ─── Launch browser ──────────────────────────────────
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',  // Avoid CORS issues in test
    ],
    timeout: TIMEOUT,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // ─── Intercept ALL network requests for diagnostics ───
  const apiRequests = [];
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/')) {
      const headers = request.headers();
      const hasAuth = !!headers['authorization'];
      const entry = {
        method: request.method(),
        url: url.replace(BASE, ''),
        hasAuth,
        authHeader: headers['authorization'] ? headers['authorization'].substring(0, 30) + '...' : '(none)',
        timestamp: Date.now(),
      };
      apiRequests.push(entry);
      log(`      [NET] ${entry.method} ${entry.url} | Auth: ${hasAuth ? '✓' : '✗'} ${entry.authHeader}`);
    }
    request.continue();
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const status = response.status();
      let body = '';
      try {
        body = await response.text();
        if (body.length > 200) body = body.substring(0, 200) + '...';
      } catch {}
      log(`      [RES] ${status} ${url.replace(BASE, '')} | ${body}`);
    }
  });

  // Collect console messages from the page
  const consoleLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (text.includes('error') || text.includes('Error') || text.includes('401')) {
      log(`      [CONSOLE ${msg.type()}] ${text}`);
    }
  });

  try {
    // ═══════════════════════════════════════════════════════
    log('─── Test 1: App loads and shows login page ───');
    // ═══════════════════════════════════════════════════════

    await test('Navigate to app → redirected to login', async () => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: TIMEOUT });
      // Should redirect to /login since not authenticated
      await page.waitForSelector('input[type="email"], input[name="email"], form', { timeout: TIMEOUT });
      const url = page.url();
      if (!url.includes('/login')) {
        throw new Error(`Expected redirect to /login, got: ${url}`);
      }
      log(`      → Redirected to: ${url}`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 2: Login form submits and navigates to dashboard ───');
    // ═══════════════════════════════════════════════════════

    await test('Fill and submit login form', async () => {
      // Find and fill email field
      const emailInput = await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
      await emailInput.click({ clickCount: 3 }); // Select all
      await emailInput.type(DEMO_EMAIL, { delay: 50 });

      // Find and fill password field
      const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT });
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(DEMO_PASS, { delay: 50 });

      // Clear network log to track post-login requests
      apiRequests.length = 0;

      // Submit form
      const submitBtn = await page.$('button[type="submit"]');
      if (!submitBtn) throw new Error('No submit button found');
      await submitBtn.click();

      // Wait for navigation to dashboard
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT }).catch(() => {
        // Navigation might not trigger if SPA routing
      });

      // Wait for dashboard content OR error
      await page.waitForFunction(() => {
        return document.URL.includes('/dashboard') ||
               document.querySelector('[class*="text-2xl"]') ||
               document.body.innerText.includes('Dashboard');
      }, { timeout: TIMEOUT });

      const currentUrl = page.url();
      log(`      → Navigated to: ${currentUrl}`);

      if (!currentUrl.includes('/dashboard')) {
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        throw new Error(`Expected /dashboard URL, got ${currentUrl}. Page text: ${bodyText}`);
      }
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 3: Dashboard actually loaded (no auth error) ───');
    // This is THE critical test that catches the persistent bug
    // ═══════════════════════════════════════════════════════

    await test('Dashboard shows data, NOT "Authentication required"', async () => {
      // Wait a moment for the dashboard to finish loading
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText;
        // Check that loading spinner is gone
        return !document.querySelector('.animate-spin') ||
               bodyText.includes('Failed to load') ||
               bodyText.includes('Vehicles') ||
               bodyText.includes('Dashboard');
      }, { timeout: TIMEOUT });

      // Check for the error state
      const pageText = await page.evaluate(() => document.body.innerText);

      if (pageText.includes('Authentication required')) {
        // This is the exact bug we're catching
        const dashReqs = apiRequests.filter(r => r.url.includes('/dashboard'));
        const reqInfo = dashReqs.map(r =>
          `${r.method} ${r.url} | Auth: ${r.hasAuth} | Header: ${r.authHeader}`
        ).join('\n      ');

        throw new Error(
          `DASHBOARD BUG REPRODUCED: "Authentication required" error.\n` +
          `      API requests to /dashboard:\n      ${reqInfo || '(none!)'}\n` +
          `      All API requests:\n      ${apiRequests.map(r =>
            `${r.method} ${r.url} | Auth: ${r.hasAuth}`
          ).join('\n      ')}\n` +
          `      Token in localStorage: ${await page.evaluate(() => !!localStorage.getItem('token'))}\n` +
          `      Token value prefix: ${await page.evaluate(() => (localStorage.getItem('token') || '').substring(0, 20))}`
        );
      }

      if (pageText.includes('Failed to load dashboard')) {
        throw new Error(`Dashboard failed with: ${pageText.match(/Failed to load dashboard[:\s]*(.*)/)?.[1] || 'unknown'}`);
      }

      // Verify dashboard content is present
      const hasDashboardContent =
        pageText.includes('Vehicles') ||
        pageText.includes('No vehicles yet') ||
        pageText.includes('Overdue') ||
        pageText.includes('Upcoming');

      if (!hasDashboardContent) {
        throw new Error(`Dashboard loaded but no expected content found. Page text: ${pageText.substring(0, 500)}`);
      }

      log(`      → Dashboard content verified ✓`);
    });

    await test('API /dashboard request had Authorization header', async () => {
      const dashReqs = apiRequests.filter(r =>
        r.url.includes('/dashboard') && r.method === 'GET'
      );

      if (dashReqs.length === 0) {
        throw new Error('No GET /api/dashboard request was made!');
      }

      const lastDash = dashReqs[dashReqs.length - 1];
      if (!lastDash.hasAuth) {
        throw new Error(
          `GET /api/dashboard was made WITHOUT Authorization header!\n` +
          `      This means the api.token was null when the request was made.\n` +
          `      All API requests:\n      ${apiRequests.map(r =>
            `${r.method} ${r.url} | Auth: ${r.hasAuth}`
          ).join('\n      ')}`
        );
      }

      log(`      → Auth header present: ${lastDash.authHeader}`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 4: Token is in localStorage after login ───');
    // ═══════════════════════════════════════════════════════

    await test('localStorage has token after login', async () => {
      const tokenInfo = await page.evaluate(() => {
        const token = localStorage.getItem('token');
        return {
          exists: !!token,
          length: token ? token.length : 0,
          prefix: token ? token.substring(0, 20) : '(null)',
        };
      });

      if (!tokenInfo.exists) {
        throw new Error('Token NOT found in localStorage after login!');
      }

      log(`      → Token: ${tokenInfo.prefix}... (${tokenInfo.length} chars)`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 5: Sidebar shows logged-in user ───');
    // ═══════════════════════════════════════════════════════

    await test('Sidebar displays user name/email', async () => {
      const pageText = await page.evaluate(() => document.body.innerText);
      const hasUserInfo =
        pageText.includes('Demo') ||
        pageText.includes('demo@example.com');

      if (!hasUserInfo) {
        throw new Error(`Sidebar doesn't show user info. Page text: ${pageText.substring(0, 300)}`);
      }

      log(`      → User info displayed ✓`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 6: Page reload preserves auth and loads dashboard ───');
    // This catches the page-reload race condition
    // ═══════════════════════════════════════════════════════

    await test('Reload /dashboard keeps user authenticated', async () => {
      apiRequests.length = 0; // Clear request log

      await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT });

      // Wait for page to settle
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Dashboard') ||
               bodyText.includes('Failed to load') ||
               bodyText.includes('Login');
      }, { timeout: TIMEOUT });

      const currentUrl = page.url();
      const pageText = await page.evaluate(() => document.body.innerText);

      // Should still be on dashboard, NOT redirected to login
      if (currentUrl.includes('/login')) {
        throw new Error('Page reload redirected to login — token validation failed');
      }

      if (pageText.includes('Authentication required')) {
        const dashReqs = apiRequests.filter(r => r.url.includes('/dashboard'));
        throw new Error(
          `RELOAD BUG: "Authentication required" after page reload.\n` +
          `      Dashboard requests: ${JSON.stringify(dashReqs, null, 2)}\n` +
          `      Token in localStorage: ${await page.evaluate(() => !!localStorage.getItem('token'))}`
        );
      }

      if (pageText.includes('Failed to load dashboard')) {
        throw new Error(`Dashboard failed after reload: ${pageText.match(/Failed to load dashboard[:\s]*(.*)/)?.[1]}`);
      }

      log(`      → Dashboard loaded after reload ✓`);
    });

    await test('Reload: /auth/me and /dashboard both had auth headers', async () => {
      const meReqs = apiRequests.filter(r => r.url.includes('/auth/me'));
      const dashReqs = apiRequests.filter(r => r.url.includes('/dashboard') && r.method === 'GET');

      if (meReqs.length === 0) {
        throw new Error('No /auth/me request after reload — should validate token');
      }
      if (dashReqs.length === 0) {
        throw new Error('No /dashboard request after reload');
      }

      const meHasAuth = meReqs[meReqs.length - 1].hasAuth;
      const dashHasAuth = dashReqs[dashReqs.length - 1].hasAuth;

      if (!meHasAuth) {
        throw new Error('/auth/me request after reload had NO Authorization header');
      }
      if (!dashHasAuth) {
        throw new Error('/dashboard request after reload had NO Authorization header');
      }

      log(`      → /auth/me auth: ✓ | /dashboard auth: ✓`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 7: Navigate away and back to dashboard ───');
    // ═══════════════════════════════════════════════════════

    await test('Navigate to /vehicles then back to /dashboard', async () => {
      apiRequests.length = 0;

      // Click on Vehicles in sidebar
      const vehiclesLink = await page.$('a[href="/vehicles"]');
      if (vehiclesLink) {
        await vehiclesLink.click();
        await page.waitForFunction(() => document.URL.includes('/vehicles'), { timeout: TIMEOUT });
      } else {
        await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle2', timeout: TIMEOUT });
      }

      // Now navigate back to dashboard
      apiRequests.length = 0;
      const dashLink = await page.$('a[href="/dashboard"]');
      if (dashLink) {
        await dashLink.click();
        await page.waitForFunction(() => document.URL.includes('/dashboard'), { timeout: TIMEOUT });
      } else {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: TIMEOUT });
      }

      // Wait for dashboard to load
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return text.includes('Dashboard') ||
               text.includes('Failed to load') ||
               text.includes('No vehicles yet');
      }, { timeout: TIMEOUT });

      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('Authentication required') || pageText.includes('Failed to load dashboard')) {
        throw new Error(`Dashboard failed after navigation: ${pageText.match(/Failed to load.*/)?.[0]}`);
      }

      log(`      → Dashboard loaded after navigation ✓`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 8: Logout redirects to login ───');
    // ═══════════════════════════════════════════════════════

    await test('Logout clears auth and redirects to login', async () => {
      // Find and click logout button
      const logoutBtn = await page.$('button[class*="Logout"], button:has(svg)');
      // Try finding by text
      const buttons = await page.$$('button');
      let clicked = false;
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText || el.textContent, btn);
        if (text && (text.includes('Logout') || text.includes('Log out') || text.includes('Sign out'))) {
          await btn.click();
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        // Try clicking the logout icon/link
        const logoutEl = await page.$('[data-testid="logout"], a[href="/logout"]');
        if (logoutEl) {
          await logoutEl.click();
          clicked = true;
        }
      }

      if (!clicked) {
        // Manually trigger logout by clearing storage and navigating
        await page.evaluate(() => {
          localStorage.removeItem('token');
        });
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2', timeout: TIMEOUT });
      }

      await page.waitForFunction(() => {
        return document.URL.includes('/login') ||
               document.querySelector('input[type="email"]');
      }, { timeout: TIMEOUT });

      const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('token'));
      if (tokenAfterLogout) {
        log(`      ⚠ Token still in localStorage after logout: ${tokenAfterLogout.substring(0, 20)}...`);
      }

      log(`      → Redirected to login page ✓`);
    });

    // ═══════════════════════════════════════════════════════
    log('\n─── Test 9: Fresh login again → dashboard loads immediately ───');
    // ═══════════════════════════════════════════════════════

    await test('Second login → dashboard loads without error', async () => {
      apiRequests.length = 0;

      const emailInput = await page.waitForSelector('input[type="email"]', { timeout: TIMEOUT });
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(DEMO_EMAIL, { delay: 30 });

      const passwordInput = await page.waitForSelector('input[type="password"]', { timeout: TIMEOUT });
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(DEMO_PASS, { delay: 30 });

      const submitBtn = await page.$('button[type="submit"]');
      await submitBtn.click();

      // Wait for dashboard
      await page.waitForFunction(() => {
        const text = document.body.innerText;
        return (document.URL.includes('/dashboard') &&
               (text.includes('Dashboard') || text.includes('Failed to load')));
      }, { timeout: TIMEOUT });

      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('Authentication required') || pageText.includes('Failed to load dashboard')) {
        const dashReqs = apiRequests.filter(r => r.url.includes('/dashboard'));
        throw new Error(
          `Second login → dashboard FAILED.\n` +
          `      Dashboard reqs: ${JSON.stringify(dashReqs)}\n` +
          `      Page: ${pageText.substring(0, 300)}`
        );
      }

      log(`      → Second login → dashboard loaded ✓`);
    });

  } catch (err) {
    log(`\n💥 Unexpected error: ${err.message}`);
    failed++;
    // Take screenshot on failure
    try {
      await page.screenshot({ path: 'e2e-failure.png', fullPage: true });
      log('   Screenshot saved: e2e-failure.png');
    } catch {}
  } finally {
    // ─── Network Request Summary ──────────────────────────
    log('\n─── Network Request Summary ───');
    log(`Total API requests intercepted: ${apiRequests.length}`);
    const authIssues = apiRequests.filter(r =>
      r.url.includes('/dashboard') && !r.hasAuth && r.method === 'GET'
    );
    if (authIssues.length > 0) {
      log(`⚠ WARNING: ${authIssues.length} /dashboard request(s) had NO Authorization header:`);
      authIssues.forEach(r => log(`  ${r.method} ${r.url} at ${new Date(r.timestamp).toISOString()}`));
    } else if (apiRequests.filter(r => r.url.includes('/dashboard')).length > 0) {
      log(`✓ All /dashboard requests had Authorization headers`);
    }

    // ─── Console Log Summary ──────────────────────────────
    const errors = consoleLogs.filter(l => l.type === 'error');
    if (errors.length > 0) {
      log(`\n─── Browser Console Errors ───`);
      errors.forEach(l => log(`  ${l.text}`));
    }

    await browser.close();

    // ─── Results ──────────────────────────────────────────
    log(`\n${'═'.repeat(50)}`);
    log(`  Results: ${passed} passed, ${failed} failed`);
    log(`${'═'.repeat(50)}\n`);

    process.exit(failed > 0 ? 1 : 0);
  }
})();
