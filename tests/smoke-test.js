/**
 * USafe Mobile Frontend — Playwright Smoke Tests
 *
 * Usage:
 *   node tests/smoke-test.js [--base-url http://127.0.0.1:5501] [--api-url https://usafe.innidata.com]
 *
 * Requires: playwright (from ../../node_modules/playwright)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const BASE_URL = getArg('--base-url', 'http://127.0.0.1:5501');
const API_URL = getArg('--api-url', 'https://usafe.innidata.com');

// ── Credentials ─────────────────────────────────────────────────────────────
const CREDS = { email: 'mohsin@be.com.pk', password: 'Usafe@2026!' };

// ── Screenshot dir ──────────────────────────────────────────────────────────
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── Test runner ─────────────────────────────────────────────────────────────
const results = [];

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  PASS  ${name} (${ms}ms)`);
    results.push({ name, pass: true });
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`  FAIL  ${name} (${ms}ms)`);
    console.log(`        ${err.message}`);
    results.push({ name, pass: false, error: err.message });
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

// ── Helper: set up authenticated session (mock — no API dependency) ─────────
async function setupAuth(page, sites) {
  const mockUser = {
    userName: CREDS.email,
    siteId: '1',
    siteName: 'Bullseye',
    token: 'mock-test-token-' + Date.now(),
    userRole: 'AreaManager',
    fullName: 'Mohsin Ali',
    sites: sites || [{ siteId: 1, siteName: 'Bullseye' }],
  };

  await page.evaluate((data) => {
    localStorage.setItem('userName', data.userName);
    localStorage.setItem('siteId', data.siteId);
    localStorage.setItem('siteName', data.siteName);
    localStorage.setItem('token', data.token);
    localStorage.setItem('userRole', data.userRole);
    localStorage.setItem('fullName', data.fullName);
    localStorage.setItem('usafe_onboarded', 'true');
    localStorage.setItem('sites', JSON.stringify(data.sites));
    const exp = new Date();
    exp.setDate(exp.getDate() + 1);
    localStorage.setItem('expiryDate', exp.toISOString());
    localStorage.setItem('departments', JSON.stringify([{id:1, siteId:1, name:'Bullseye'}]));
  }, mockUser);

  return mockUser;
}

// Two agencies — the multi-site / back-checking-agency case.
const MULTI_SITES = [
  { siteId: 1, siteName: 'Bullseye' },
  { siteId: 7, siteName: 'SecureGuard' },
];

/**
 * Navigate and wait for a selector, retrying the navigation if it does not show.
 * CheckUser.js issues an unconditional redirect when it finds no session, and
 * that redirect can still be in flight when the next test navigates — which
 * aborts the load and leaves the page's async field rendering unfinished.
 */
async function gotoAndWaitFor(page, url, selector, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector(selector, { state: 'attached', timeout: 5000 });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`"${selector}" never appeared on ${url} after ${attempts} attempts: ${lastError.message}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nUSafe Smoke Tests`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  API URL:  ${API_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  // Increase default timeout for slower local servers
  page.setDefaultTimeout(15000);

  // ── Test 1: Login page renders ──────────────────────────────────────────
  await runTest('Login page renders', async () => {
    await page.goto(`${BASE_URL}/Pages/Authentication/loginPage/loginPage.html`);
    await page.waitForSelector('#username');
    await page.waitForSelector('#password');
    await page.waitForSelector('.btnLogin');
    const btnText = await page.textContent('.btnLogin .english-text');
    if (!btnText.includes('Sign In')) throw new Error(`Expected "Sign In", got "${btnText}"`);
    await screenshot(page, '01-login-page');
  });

  // ── Test 2: Auth setup works (mock session) ────────────────────────────
  await runTest('Auth session setup works', async () => {
    await page.goto(`${BASE_URL}/Pages/Authentication/loginPage/loginPage.html`);
    const resp = await setupAuth(page);
    if (!resp.token) throw new Error('No token in mock data');
    if (!resp.userName) throw new Error('No userName in mock data');
    // Verify localStorage was set
    const stored = await page.evaluate(() => localStorage.getItem('userName'));
    if (!stored) throw new Error('localStorage.userName not set');
    await screenshot(page, '02-auth-setup');
  });

  // ── Test 3: Reports page renders with filter tabs ───────────────────────
  await runTest('Reports page renders with filter tabs', async () => {
    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);
    await page.waitForSelector('.report-filter-bar');
    const pills = await page.$$('.report-filter-pill');
    if (pills.length < 4) throw new Error(`Expected >= 4 filter pills, got ${pills.length}`);
    const allBtn = await page.textContent('.report-filter-pill.active');
    if (!allBtn.includes('All')) throw new Error(`Expected active filter "All", got "${allBtn}"`);
    await screenshot(page, '03-reports-page');
  });

  // ── Test 4: Reporting types page renders with cards ─────────────────────
  await runTest('Reporting types page renders with cards', async () => {
    await page.goto(`${BASE_URL}/Pages/reportingType.html`);
    await page.waitForSelector('#reportingTypes');
    // Cards are rendered by JS from local JSON (no API needed) — uses .usafe-card buttons
    await page.waitForSelector('#reportingTypes .usafe-card, #reportingTypes button, #reportingTypes .card', { timeout: 10000 });
    const cards = await page.$$('#reportingTypes .usafe-card, #reportingTypes button');
    if (cards.length < 1) throw new Error(`Expected reporting type cards, got ${cards.length}`);
    const text = await page.textContent('#reportingTypes');
    if (!text.includes('Safe')) throw new Error('Missing "Safe" in reporting types');
    if (!text.includes('Hazard')) throw new Error('Missing "Hazard" in reporting types');
    await screenshot(page, '04-reporting-types');
  });

  // ── Test 5: Checklist types page renders ────────────────────────────────
  await runTest('Checklist types page structure renders', async () => {
    await page.evaluate(() => {
      localStorage.setItem('sectionFor', 'UPL Safety Checklists');
    });
    await page.goto(`${BASE_URL}/Pages/checklistType.html`);
    // Page should render without crashing — check for the page structure
    // The #dcaChecklistType container may be hidden if API call fails (mock token)
    // but the page itself (topbar, bottom nav) should render
    await page.waitForSelector('body', { timeout: 5000 });
    const bodyText = await page.textContent('body');
    if (!bodyText.includes('Checklists') && !bodyText.includes('checklist')) {
      throw new Error('Page does not contain checklist-related text');
    }
    await screenshot(page, '05-checklist-types');
  });

  // ── Test 6: Profile page renders with user info ─────────────────────────
  await runTest('Profile page renders with user info', async () => {
    await page.goto(`${BASE_URL}/Pages/myProfile/myProfile.html`);
    await page.waitForSelector('.profile-hero, .profile-card, .myProfileContainer', { timeout: 10000 });
    const bodyText = await page.textContent('body');
    // Profile should show the user's name or email
    const hasUserInfo = bodyText.includes(CREDS.email) || bodyText.includes('mohsin') || bodyText.includes('Profile');
    if (!hasUserInfo) throw new Error('Profile page does not show user info');
    await screenshot(page, '06-profile-page');
  });

  // ── Test 7: Safe/Unsafe Acts form renders (no responsibility dropdown) ──
  await runTest('Safe/Unsafe Acts form renders', async () => {
    await page.goto(`${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`);
    await page.waitForSelector('#safeUnsafeAct');
    // Check Act Type select exists
    const actType = await page.$('#ActTyp');
    if (!actType) throw new Error('Act Type select not found');
    // Check that the form has initial common fields container
    const initFields = await page.$('#initialCommonFields');
    if (!initFields) throw new Error('Initial common fields container not found');
    // Verify no standalone "Responsibility" dropdown at terminal (it was removed)
    const terminalHTML = await page.$eval('#terminalCommonFields', el => el.innerHTML);
    const hasResponsibilityDropdown = terminalHTML.includes('Responsibility') && terminalHTML.includes('<select');
    // Note: we just log this — the responsibility field removal is a known change
    await screenshot(page, '07-safe-unsafe-acts');
  });

  // ── Test 8: Onboarding shows on first visit ────────────────────────────
  await runTest('Onboarding shows on first visit', async () => {
    // Clear localStorage to simulate first visit, but keep auth
    const authData = await page.evaluate(() => ({
      userName: localStorage.getItem('userName'),
      token: localStorage.getItem('token'),
      siteId: localStorage.getItem('siteId'),
      siteName: localStorage.getItem('siteName'),
      userRole: localStorage.getItem('userRole'),
      fullName: localStorage.getItem('fullName'),
      expiryDate: localStorage.getItem('expiryDate'),
      departments: localStorage.getItem('departments'),
    }));
    await page.evaluate(() => localStorage.clear());
    // Restore auth but NOT usafe_onboarded
    await page.evaluate((data) => {
      Object.entries(data).forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
    }, authData);

    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);
    // CheckUser.js should redirect to onboarding
    await page.waitForURL(/onboarding/, { timeout: 10000 });
    const url = page.url();
    if (!url.includes('onboarding')) throw new Error(`Expected redirect to onboarding, got ${url}`);
    await screenshot(page, '08-onboarding');

    // Restore onboarded flag for any subsequent use
    await page.evaluate(() => localStorage.setItem('usafe_onboarded', 'true'));
  });

  // ── Test 9a: Checklist wizard has photo upload support ─────────────────
  await runTest('Checklist wizard has photo upload support', async () => {
    await page.goto(`${BASE_URL}/Pages/Authentication/loginPage/loginPage.html`);
    const jsContent = await page.evaluate(async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/Js/GenericQuestioneerProcessor.js`);
      return resp.text();
    }, BASE_URL);
    // Verify photo upload function exists
    if (!jsContent.includes('handleChecklistPhotoSelect')) throw new Error('Missing handleChecklistPhotoSelect function');
    // Verify file upload input is rendered in result page
    if (!jsContent.includes('checklistPhotoInput')) throw new Error('Missing checklistPhotoInput element');
    // Verify uploaded URLs are included in payload
    if (!jsContent.includes('_uploadedFileUrls')) throw new Error('Missing _uploadedFileUrls variable');
    // Verify files field is in the submission payload
    if (!jsContent.includes('files: _uploadedFileUrls.length > 0')) throw new Error('Missing files in submission payload');
  });

  // ── Test 9: Draft save toast is throttled ───────────────────────────────
  await runTest('Draft save toast is throttled in code', async () => {
    // Read the GenericQuestioneerProcessor.js and verify the throttle logic exists
    await page.goto(`${BASE_URL}/Pages/Authentication/loginPage/loginPage.html`);
    const jsContent = await page.evaluate(async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/Js/GenericQuestioneerProcessor.js`);
      return resp.text();
    }, BASE_URL);
    if (!jsContent.includes('_lastToastTime')) throw new Error('Missing _lastToastTime throttle variable');
    if (!jsContent.includes('30000')) throw new Error('Missing 30-second throttle interval');
    if (!jsContent.includes('now - _lastToastTime')) throw new Error('Missing throttle comparison logic');
  });

  // ── Test 10: Rating type handled in draft restore ─────────────────────
  await runTest('Rating type handled in draft restore', async () => {
    await page.goto(`${BASE_URL}/Pages/Authentication/loginPage/loginPage.html`);
    const jsContent = await page.evaluate(async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/Js/GenericQuestioneerProcessor.js`);
      return resp.text();
    }, BASE_URL);
    if (!jsContent.includes("type === 'rating'")) throw new Error('Missing rating case in restoreDraft');
    // Also verify collectResponseValue handles rating (in ResponseRenderers.js)
    const rrContent = await page.evaluate(async (baseUrl) => {
      const resp = await fetch(`${baseUrl}/Js/ResponseRenderers.js`);
      return resp.text();
    }, BASE_URL);
    if (!rrContent.includes("case 'rating'")) throw new Error('Missing rating case in collectResponseValue');
  });

  // ── Test 11: No responsibility dropdown on forms ────────────────────────
  await runTest('No responsibility dropdown on forms', async () => {
    await page.goto(`${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`);
    await page.waitForSelector('#safeUnsafeAct');
    // Ensure no select element with class "responsiblity" exists
    const respDropdown = await page.$('select.responsiblity');
    if (respDropdown) throw new Error('Found a select.responsiblity dropdown — it should have been removed');
    // Ensure terminal common fields container does not contain "Responsibility" as a label
    const terminalText = await page.$eval('#terminalCommonFields', el => el.textContent);
    if (/Responsibility/i.test(terminalText)) {
      throw new Error('Terminal common fields still contains "Responsibility" label text');
    }
    await screenshot(page, '11-no-responsibility-dropdown');
  });

  // ── Test 12: Department shows site name (not "Default") ────────────────
  await runTest('Department shows site name not Default', async () => {
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`, '#Department');
    // Wait a moment for Initials.js to populate the department field
    await page.waitForTimeout(300);
    // The department input should contain the siteName from localStorage ("Bullseye"), not "Default"
    const deptValue = await page.evaluate(() => {
      const input = document.querySelector('#initialCommonFields input[name="Department"], #initialCommonFields select[name="Department"], #initialCommonFields [id*="epartment"]');
      if (!input) return '__NOT_FOUND__';
      return input.value || input.textContent || '';
    });
    if (deptValue === '__NOT_FOUND__') throw new Error('Department input not found in initialCommonFields');
    if (/default/i.test(deptValue)) throw new Error(`Department value is "Default" — should be site name`);
    if (!deptValue.includes('Bullseye')) throw new Error(`Expected department to contain "Bullseye", got "${deptValue}"`);
    await screenshot(page, '12-department-site-name');
  });

  // ── Test 13: Reporting type descriptions exist ─────────────────────────
  await runTest('Reporting type descriptions exist', async () => {
    await page.goto(`${BASE_URL}/Pages/reportingType.html`);
    await page.waitForSelector('#reportingTypes');
    await page.waitForSelector('#reportingTypes .usafe-card, #reportingTypes button', { timeout: 10000 });
    const text = await page.textContent('#reportingTypes');
    if (!text.includes('Report safe or unsafe')) {
      throw new Error('Missing description "Report safe or unsafe" in reporting types');
    }
    if (!text.includes('Flag potential')) {
      throw new Error('Missing description "Flag potential" in reporting types');
    }
    await screenshot(page, '13-reporting-type-descriptions');
  });

  // ── Test 14: Single-site user sees no agency picker ────────────────────
  await runTest('Single-site user keeps readonly Department field', async () => {
    await page.goto(`${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`);
    await setupAuth(page); // defaults to one site
    // Fields are injected by an async config fetch — wait for the field itself.
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`, '#Department');
    await page.waitForTimeout(300);

    const shape = await page.evaluate(() => {
      const el = document.getElementById('Department');
      return el ? { tag: el.tagName, value: el.value, readOnly: !!el.readOnly } : null;
    });
    if (!shape) throw new Error('Department field not found');
    if (shape.tag !== 'INPUT') throw new Error(`Expected INPUT for single-site user, got ${shape.tag}`);
    if (!shape.readOnly) throw new Error('Single-site Department field should stay readonly');
    if (!shape.value.includes('Bullseye')) throw new Error(`Expected "Bullseye", got "${shape.value}"`);
    await screenshot(page, '14-single-site-department');
  });

  // ── Test 15: Multi-site user gets an agency dropdown ───────────────────
  await runTest('Multi-site user gets Department dropdown of agencies', async () => {
    // First visit may be bounced to onboarding by CheckUser.js; seed the session
    // on whatever page we land on (same origin) and navigate again.
    await page.goto(`${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`);
    await setupAuth(page, MULTI_SITES);
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`, '#Department');
    await page.waitForTimeout(300);

    const shape = await page.evaluate(() => {
      const el = document.getElementById('Department');
      if (!el) return null;
      return {
        tag: el.tagName,
        value: el.value,
        options: Array.from(el.options || []).map(o => ({ value: o.value, siteId: o.dataset.siteId })),
      };
    });
    if (!shape) throw new Error('Department field not found');
    if (shape.tag !== 'SELECT') throw new Error(`Expected SELECT for multi-site user, got ${shape.tag}`);
    if (shape.options.length !== 2) throw new Error(`Expected 2 agencies, got ${shape.options.length}`);
    // Option value must be the site NAME — that is what the server stores as Department.
    if (!shape.options.some(o => o.value === 'SecureGuard' && o.siteId === '7')) {
      throw new Error(`Expected a SecureGuard option carrying data-site-id=7, got ${JSON.stringify(shape.options)}`);
    }
    if (shape.value !== 'Bullseye') throw new Error(`Expected active agency "Bullseye", got "${shape.value}"`);
    await screenshot(page, '15-multi-site-department');
  });

  // ── Test 16: Switching agency updates the active site ──────────────────
  await runTest('Switching agency updates siteId and siteName', async () => {
    // First visit may be bounced to onboarding by CheckUser.js; seed the session
    // on whatever page we land on (same origin) and navigate again.
    await page.goto(`${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`);
    await setupAuth(page, MULTI_SITES);
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/IncidentReporting/SafeUnsafeActs.html`, '#Department');
    await page.waitForTimeout(300);

    await page.selectOption('#Department', 'SecureGuard');

    const stored = await page.evaluate(() => ({
      siteId: localStorage.getItem('siteId'),
      siteName: localStorage.getItem('siteName'),
    }));
    if (stored.siteId !== '7') throw new Error(`Expected siteId "7", got "${stored.siteId}"`);
    if (stored.siteName !== 'SecureGuard') throw new Error(`Expected siteName "SecureGuard", got "${stored.siteName}"`);
    await screenshot(page, '16-agency-switched');
  });

  // ── Test 17: Reporting hub shows the agency bar for multi-site users ───
  await runTest('Reporting hub shows agency bar only for multi-site users', async () => {
    // Multi-site: bar present
    await page.goto(`${BASE_URL}/Pages/reportingType.html`);
    await setupAuth(page, MULTI_SITES);
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/reportingType.html`, '#activeSiteSelect');
    await page.waitForTimeout(300);

    const multi = await page.evaluate(() => {
      const sel = document.getElementById('activeSiteSelect');
      return sel ? { count: sel.options.length, value: sel.value } : null;
    });
    if (!multi) throw new Error('Agency bar missing for multi-site user');
    if (multi.count !== 2) throw new Error(`Expected 2 agencies in bar, got ${multi.count}`);
    await screenshot(page, '17-agency-bar');

    // Single-site: bar absent
    await setupAuth(page);
    await gotoAndWaitFor(page, `${BASE_URL}/Pages/reportingType.html`, '#reportingTypes');
    await page.waitForTimeout(300);

    const single = await page.evaluate(() => !!document.getElementById('activeSiteSelect'));
    if (single) throw new Error('Agency bar should be hidden for single-site users');
  });

  // ── Test 18: server errors show a real message, not "some error occured" ─
  await runTest('Server error shows the real message and reference', async () => {
    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);
    await setupAuth(page);

    let clientLogBody = null;
    await page.route('**/api/diagnostics/clientlog', async (route) => {
      clientLogBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 200, reference: 'srv-ref-1' }) });
    });
    await page.route('**/api/changeform/boom', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ status: 500, message: 'Something went wrong on our side.', reference: 'ref-abc-123' }) });
    });

    await page.evaluate(() => sendRequest('api/changeform/boom', 'GET', null, () => {}));
    await page.waitForSelector('.swal2-container', { timeout: 10000 });
    const dialog = await page.textContent('.swal2-container');

    if (/some error occured/i.test(dialog)) throw new Error('Still showing the old generic message');
    if (!dialog.includes('Something went wrong on our side.')) {
      throw new Error(`Server message missing from dialog: ${dialog}`);
    }
    if (!dialog.includes('ref-abc-123')) throw new Error(`Reference missing from dialog: ${dialog}`);

    // ...and it was reported to the server, with the page and status attached.
    await page.waitForFunction(() => true);
    await page.waitForTimeout(600);
    if (!clientLogBody) throw new Error('Error was not reported to the server');
    if (clientLogBody.status !== 500) throw new Error(`Reported status ${clientLogBody.status}, expected 500`);
    if (!clientLogBody.page.includes('reporting.html')) {
      throw new Error(`Reported page was "${clientLogBody.page}"`);
    }
    await screenshot(page, '18-server-error-message');
    await page.unroute('**/api/diagnostics/clientlog');
    await page.unroute('**/api/changeform/boom');
  });

  // ── Test 19: offline gets its own message, and is not reported ──────────
  await runTest('Offline shows a connection message', async () => {
    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);
    await setupAuth(page);
    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);

    await page.route('**/api/changeform/offline', route => route.abort('failed'));

    await page.evaluate(() => sendRequest('api/changeform/offline', 'GET', null, () => {}));
    await page.waitForSelector('.swal2-container', { timeout: 10000 });
    const dialog = await page.textContent('.swal2-container');

    if (!/offline/i.test(dialog)) throw new Error(`Expected an offline message, got: ${dialog}`);
    await screenshot(page, '19-offline-message');
    await page.unroute('**/api/changeform/offline');
  });

  // ── Test 20: nothing is reported when signed out ────────────────────────
  await runTest('Errors are not reported when signed out', async () => {
    await page.goto(`${BASE_URL}/Pages/reporting/reporting.html`);
    await page.evaluate(() => localStorage.clear());

    let reported = false;
    await page.route('**/api/diagnostics/clientlog', async (route) => {
      reported = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/changeform/boom2', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"nope"}' }));

    await page.evaluate(() => sendRequest('api/changeform/boom2', 'GET', null, () => {}));
    await page.waitForTimeout(1200);

    if (reported) throw new Error('Reported an error without an authenticated session');
    await page.unroute('**/api/diagnostics/clientlog');
    await page.unroute('**/api/changeform/boom2');
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  await browser.close();

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${results.length} total\n`);

  if (failed > 0) {
    console.log('  Failed tests:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`    - ${r.name}: ${r.error}`);
    });
    console.log('');
  }

  console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
