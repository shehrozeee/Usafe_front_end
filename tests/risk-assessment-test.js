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

// The wizard calls the live API. Mock it so the tests exercise the wizard, not
// the network — and so they pass identically on a laptop and in CI.
const FAKE_SCALE = {
  severity: [
    { value: 1, label: 'Delay Only' },
    { value: 2, label: 'Minor injury (FAC), minor damage' },
    { value: 4, label: 'Lost Time Injury, illness, damage, multiple minor injuries' },
    { value: 6, label: 'Major injury, disabling illness, major damage, multiple recordable injuries' },
    { value: 8, label: 'Single death' },
    { value: 10, label: 'Multiple deaths' },
  ],
  probability: [
    { value: 1, label: 'Very unlikely' },
    { value: 2, label: 'Unlikely' },
    { value: 4, label: 'May happen' },
    { value: 6, label: 'Likely' },
    { value: 8, label: 'Very likely' },
    { value: 10, label: 'Certain or imminent' },
  ],
};

const FAKE_FORM = {
  id: 1,
  name: 'Lux Instore Plan',
  location: 'KLI',
  eventActivity: 'Female BA Deployment',
  rows: [
    {
      id: 11, sortOrder: 1, taskName: 'Travel to Store', hazard: 'Road traffic accident',
      actOrCondition: 'Condition', personAtRisk: 'BA',
      hazardDescription: 'No transport vetting, fatigued driving',
      baseSeverity: 6, baseProbability: 6,
      suggestedAdditionalControl: 'Online taxi services used',
      residualSeverity: 6, residualProbability: 2,
    },
    {
      id: 12, sortOrder: 2, taskName: 'Store Reporting & Briefing', hazard: 'Slip/trip',
      actOrCondition: 'Condition', personAtRisk: 'Worker',
      hazardDescription: 'Uninspected floor, exposed cables',
      baseSeverity: 2, baseProbability: 6,
      suggestedAdditionalControl: 'Pre-shift housekeeping check',
      residualSeverity: 2, residualProbability: 2,
    },
  ],
};

async function mockRiskApi(page) {
  await page.route('**/api/RiskAssessment/getRiskScale', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_SCALE) }));

  await page.route('**/api/RiskAssessment/getRiskAssessmentForm*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_FORM) }));

  await page.route('**/api/RiskAssessment/saveRiskAssessment', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 99 }) }));
}

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

  console.log('\nwindow bindings (classic-script const vs var regression)');

  await runTest('RISK_SCALE_VALUES is reachable as a window property', async () => {
    const value = await page.evaluate(() => window.RISK_SCALE_VALUES);
    assert.deepStrictEqual(value, [1, 2, 4, 6, 8, 10]);
  });

  await runTest('RISK_CATEGORY_COLOUR is reachable as a window property', async () => {
    const value = await page.evaluate(() => window.RISK_CATEGORY_COLOUR);
    assert.deepStrictEqual(value, {
      VL: '#c6efce',
      L: '#d9ead3',
      M: '#ffeb9c',
      'M+': '#ffd966',
      H: '#f4b183',
      VH: '#ff7c80',
    });
  });

  console.log('\nRiskAssessmentCard HTML escaping');

  const SCALE = {
    severity: [{ value: 1, label: 'Negligible' }, { value: 2, label: 'Minor' }],
    probability: [{ value: 1, label: 'Rare' }, { value: 2, label: 'Unlikely' }],
  };

  await runTest('a double quote in personAtRisk does not break out of the value attribute', async () => {
    const task = {
      taskName: 'Loading dock',
      personAtRisk: 'Forklift driver " onmouseover="alert(1)',
    };

    const inputValue = await page.evaluate(([t, s]) => {
      const html = window.createRiskAssessmentCard(t, 0, 1, s);
      const root = document.getElementById('riskAssessmentRoot');
      root.innerHTML = html;
      const input = root.querySelector('.ra-person');
      return {
        value: input.value,
        onmouseover: input.getAttribute('onmouseover'),
        extraInputs: root.querySelectorAll('.ra-person').length,
      };
    }, [task, SCALE]);

    assert.strictEqual(inputValue.value, 'Forklift driver " onmouseover="alert(1)');
    assert.strictEqual(inputValue.onmouseover, null,
      'the quote must not have terminated the value attribute early');
    assert.strictEqual(inputValue.extraInputs, 1,
      'the quote must not have injected a stray element');
  });

  await runTest('angle brackets in taskName render as visible text, not markup', async () => {
    const task = {
      taskName: '<img src=x onerror=alert(1)>Ladder work',
      personAtRisk: 'Rigger',
    };

    const result = await page.evaluate(([t, s]) => {
      const html = window.createRiskAssessmentCard(t, 0, 1, s);
      const root = document.getElementById('riskAssessmentRoot');
      root.innerHTML = html;
      const heading = root.querySelector('.ra-task-name');
      return {
        text: heading.textContent,
        hasImg: root.querySelectorAll('.ra-task-name img').length,
      };
    }, [task, SCALE]);

    assert.strictEqual(result.text, '<img src=x onerror=alert(1)>Ladder work');
    assert.strictEqual(result.hasImg, 0, 'the angle brackets must not have created an <img> element');
  });

  await runTest('scale option values and selected markup still work after escaping', async () => {
    const task = { taskName: 'Normal task', personAtRisk: 'Normal person', baseSeverity: 2, baseProbability: 1 };

    const result = await page.evaluate(([t, s]) => {
      const html = window.createRiskAssessmentCard(t, 0, 1, s);
      const root = document.getElementById('riskAssessmentRoot');
      root.innerHTML = html;
      const severitySelect = root.querySelector('.ra-base-severity');
      const probabilitySelect = root.querySelector('.ra-base-probability');
      return {
        severityValue: severitySelect.value,
        probabilityValue: probabilitySelect.value,
        severityOptionCount: severitySelect.querySelectorAll('option').length,
      };
    }, [task, SCALE]);

    assert.strictEqual(result.severityValue, '2');
    assert.strictEqual(result.probabilityValue, '1');
    assert.strictEqual(result.severityOptionCount, 2);
  });

  console.log('\nRisk assessment wizard');

  await mockRiskApi(page);
  const wizardUrl = `${PAGE_URL}?formId=1`;

  await runTest('chip updates when a score changes', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '8');
    assert.strictEqual(await page.textContent('.ra-base-rating'), '64');
    assert.strictEqual(await page.textContent('#raBaseCategory'), 'VH');

    // Same task, far rarer: the rating collapses to 8 but the category stays
    // above L, which is the whole reason the matrix is a lookup.
    await page.selectOption('.ra-base-probability', '1');
    assert.strictEqual(await page.textContent('.ra-base-rating'), '8');
    assert.strictEqual(await page.textContent('#raBaseCategory'), 'M+');
  });

  await runTest('next and back preserve what was entered', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.fill('.ra-control', 'Vetted transport only');
    await page.click('#raNext');
    await page.waitForFunction(() =>
      document.querySelector('.ra-progress').textContent.includes('2 of'));

    await page.click('#raBack');
    await page.waitForFunction(() =>
      document.querySelector('.ra-progress').textContent.includes('1 of'));

    assert.strictEqual(await page.inputValue('.ra-control'), 'Vetted transport only');
  });

  await runTest('an added task is marked as added on site', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    const before = await page.evaluate(() => window.riskAssessmentState.tasks.length);
    await page.click('#raAddTask');
    const after = await page.evaluate(() => window.riskAssessmentState.tasks.length);
    assert.strictEqual(after, before + 1);

    const added = await page.evaluate(() =>
      window.riskAssessmentState.tasks[window.riskAssessmentState.tasks.length - 1]);
    assert.strictEqual(added.riskAssessmentRowId, null);
  });

  await runTest('review summary counts base against residual', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.click('#raReview');
    await page.waitForSelector('#raSummary');

    const summary = await page.evaluate(() =>
      window.buildRiskSummary(window.riskAssessmentState.tasks));

    const baseTotal = Object.values(summary.base).reduce((a, b) => a + b, 0);
    const residualTotal = Object.values(summary.residual).reduce((a, b) => a + b, 0);

    assert.strictEqual(baseTotal, residualTotal);
    assert.strictEqual(baseTotal, 2);
    assert.strictEqual(summary.base['H'], 1);        // Travel to Store, S=6 P=6
    assert.strictEqual(summary.residual['M'], 1);    // same task, S=6 P=2
  });

  await runTest('a skipped task is excluded from the summary', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.click('#raSkip');
    await page.click('#raReview');
    await page.waitForSelector('#raSummary');

    const summary = await page.evaluate(() =>
      window.buildRiskSummary(window.riskAssessmentState.tasks));
    const baseTotal = Object.values(summary.base).reduce((a, b) => a + b, 0);

    assert.strictEqual(baseTotal, 1);
  });

  console.log('\nrenderReview HTML escaping (Task 9 review fix)');

  await runTest('a task name with markup renders as text in the review list, no injection', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.click('#raAddTask');
    const rawName = '<img src=x onerror=alert(1)>Ladder & "Rigging" work';
    await page.evaluate((name) => {
      const tasks = window.riskAssessmentState.tasks;
      tasks[tasks.length - 1].taskName = name;
    }, rawName);

    await page.click('#raReview');
    await page.waitForSelector('#raSummary');

    const result = await page.evaluate(() => {
      const items = document.querySelectorAll('.ra-review-list li');
      const li = items[items.length - 1];
      const strong = li.querySelector('strong');
      return {
        strongText: strong.textContent,
        strongInnerHtml: strong.innerHTML,
        imgCount: li.querySelectorAll('img').length,
        strongCount: li.querySelectorAll('strong').length,
      };
    });

    // textContent round-trips through the browser's entity decoder, so this
    // only comes back equal to the raw string when the markup was escaped
    // exactly once - not left raw (which would inject an <img>) and not
    // escaped twice (which would leave literal "&amp;" text behind).
    assert.strictEqual(result.strongText, rawName,
      'the raw name must come back as plain text, unchanged');
    assert.strictEqual(result.imgCount, 0, 'the markup must not have created an <img> element');
    assert.strictEqual(result.strongCount, 1, 'exactly the intended <strong> wrapper, nothing extra injected');
    assert.strictEqual(result.strongInnerHtml,
      '&lt;img src=x onerror=alert(1)&gt;Ladder &amp; "Rigging" work',
      'markup should be escaped exactly once, matching escapeHtml\'s own output');
  });

  await runTest('a normal task name renders readably with no literal escape sequences', async () => {
    await page.goto(wizardUrl);
    await page.waitForSelector('.ra-card');

    await page.evaluate(() => {
      const state = window.riskAssessmentState;
      state.tasks[state.index].taskName = 'Travel & Reporting';
    });

    await page.click('#raReview');
    await page.waitForSelector('#raSummary');

    const text = await page.evaluate(() =>
      document.querySelector('.ra-review-list li strong').textContent);

    assert.strictEqual(text, 'Travel & Reporting');
    assert.ok(!text.includes('&amp;'), 'must not show literal &amp; - that would mean double-escaping');
    assert.ok(!text.includes('&quot;'), 'must not show literal &quot;');
  });

  console.log('\nTemplate picker HTML escaping (Task 9 review fix)');

  await runTest('a malicious form name in the template picker renders as text, not markup', async () => {
    await page.route('**/api/RiskAssessment/getRiskAssessmentForms', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: '<img src=x onerror=alert(1)>Evil & "Form"', taskCount: 3 },
        ]),
      }));

    await page.goto(PAGE_URL); // no ?formId= -> hits the template-picker branch
    await page.waitForSelector('#raTemplates .usafe-card');

    const result = await page.evaluate(() => {
      const title = document.querySelector('.usafe-card-title');
      return {
        text: title.textContent,
        imgCount: document.querySelectorAll('#raTemplates img').length,
        cardCount: document.querySelectorAll('#raTemplates .usafe-card').length,
      };
    });

    assert.strictEqual(result.text, '<img src=x onerror=alert(1)>Evil & "Form"');
    assert.strictEqual(result.imgCount, 0, 'the markup must not have created an <img> element');
    assert.strictEqual(result.cardCount, 1, 'exactly one card, nothing extra injected');

    await page.unroute('**/api/RiskAssessment/getRiskAssessmentForms');
  });

  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
