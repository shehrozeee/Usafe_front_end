/**
 * USafe Mobile Frontend — Risk Assessment Tests
 *
 * Usage:
 *   node tests/risk-assessment-test.js [--base-url http://127.0.0.1:5501]
 *
 * Requires: playwright (from ../../node_modules/playwright)
 */

const { chromium } = require('playwright');
const assert = require('assert');

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const BASE_URL = getArg('--base-url', 'http://127.0.0.1:5501');
const PAGE_URL = `${BASE_URL}/Pages/RiskAssessment/RiskAssessment.html`;

const results = [];

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    console.log(`  PASS  ${name} (${Date.now() - start}ms)`);
    results.push({ name, pass: true });
  } catch (err) {
    console.log(`  FAIL  ${name} (${Date.now() - start}ms)`);
    console.log(`        ${err.message}`);
    results.push({ name, pass: false, error: err.message });
  }
}

// Mirrors setupAuth in smoke-test.js: CheckUser.js redirects to login without a
// session, so every page needs one seeded before it will render anything.
async function setupAuth(page) {
  await page.evaluate(() => {
    localStorage.setItem('userName', 'mohsin@be.com.pk');
    localStorage.setItem('siteId', '1');
    localStorage.setItem('siteName', 'Bullseye');
    localStorage.setItem('token', 'mock-test-token');
    localStorage.setItem('userRole', 'AreaManager');
    localStorage.setItem('fullName', 'Mohsin Ali');
    localStorage.setItem('usafe_onboarded', 'true');
    localStorage.setItem('sites', JSON.stringify([{ siteId: 1, siteName: 'Bullseye' }]));
    const exp = new Date();
    exp.setDate(exp.getDate() + 1);
    localStorage.setItem('expiryDate', exp.toISOString());
  });
}

// The matrix as it appears in the workbook, duplicated here on purpose: this is
// the fixture that catches Js/RiskMatrix.js drifting away from Data/RiskMatrix.cs.
const MATRIX = {
  10: { 1: 'L',  2: 'H',  4: 'VH', 6: 'VH', 8: 'VH', 10: 'VH' },
  8:  { 1: 'L',  2: 'M+', 4: 'H',  6: 'VH', 8: 'VH', 10: 'VH' },
  6:  { 1: 'L',  2: 'M',  4: 'M+', 6: 'H',  8: 'VH', 10: 'VH' },
  4:  { 1: 'VL', 2: 'L',  4: 'M',  6: 'M+', 8: 'H',  10: 'VH' },
  2:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'M',  8: 'H',  10: 'H'  },
  1:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'L',  8: 'M+', 10: 'H'  },
};

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(PAGE_URL);
  await setupAuth(page);
  await page.goto(PAGE_URL);

  console.log('\nClient risk matrix');

  await runTest('matches the workbook for every cell', async () => {
    for (const probability of [1, 2, 4, 6, 8, 10]) {
      for (const severity of [1, 2, 4, 6, 8, 10]) {
        const result = await page.evaluate(
          ([s, p]) => window.evaluateRisk(s, p), [severity, probability]);
        assert.strictEqual(result.rating, severity * probability,
          `S=${severity} P=${probability} rating`);
        assert.strictEqual(result.category, MATRIX[probability][severity],
          `S=${severity} P=${probability} category`);
      }
    }
  });

  await runTest('returns null for a value off the scale', async () => {
    assert.strictEqual(await page.evaluate(() => window.evaluateRisk(5, 6)), null);
    assert.strictEqual(await page.evaluate(() => window.evaluateRisk(4, 0)), null);
  });

  await runTest('same rating can carry different categories', async () => {
    const common = await page.evaluate(() => window.evaluateRisk(4, 2));
    const rare = await page.evaluate(() => window.evaluateRisk(8, 1));

    assert.strictEqual(common.rating, 8);
    assert.strictEqual(rare.rating, 8);
    assert.strictEqual(common.category, 'L');
    assert.strictEqual(rare.category, 'M+');
  });

  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
