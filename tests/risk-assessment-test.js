/**
 * USafe Mobile Frontend — Risk Assessment (v2) Tests
 *
 * Replaces the v1 wizard tests entirely. v1 was a template-picker flow: pick
 * a pre-seeded plan, walk its fixed 17 tasks one at a time, one hazard and
 * one control per task, with a Skip concept. v2 has none of that — the
 * assessor builds the whole task/hazard/control tree themselves, so there is
 * no template to fetch, no fixed task count, and nothing to "skip" (they
 * simply do not add what did not happen). Every test below targets the new
 * list -> task -> hazard -> review navigation and the nested save payload.
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
// RiskMatrix.js itself is unchanged in v2, so this whole block is unchanged too.
const MATRIX = {
  10: { 1: 'L',  2: 'H',  4: 'VH', 6: 'VH', 8: 'VH', 10: 'VH' },
  8:  { 1: 'L',  2: 'M+', 4: 'H',  6: 'VH', 8: 'VH', 10: 'VH' },
  6:  { 1: 'L',  2: 'M',  4: 'M+', 6: 'H',  8: 'VH', 10: 'VH' },
  4:  { 1: 'VL', 2: 'L',  4: 'M',  6: 'M+', 8: 'H',  10: 'VH' },
  2:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'M',  8: 'H',  10: 'H'  },
  1:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'L',  8: 'M+', 10: 'H'  },
};

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

// The wizard calls the live API. Mock it so the tests exercise the wizard, not
// the network — and so they pass identically on a laptop and in CI.
async function mockRiskApi(page) {
  await page.route('**/api/RiskAssessment/getRiskScale', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(FAKE_SCALE) }));

  await page.route('**/api/RiskAssessment/saveRiskAssessment', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 99 }) }));

  // Deliberately mirrors api/checklist/uploadFiles (see task brief) - one key
  // back per file posted, in order, so tests can predict what should land in
  // riskAssessmentState.photos / the submit payload.
  await page.route('**/api/RiskAssessment/uploadFiles', async route => {
    const body = route.request().postData() || '';
    const fileCount = (body.match(/name="files"/g) || []).length;
    const urls = Array.from({ length: fileCount }, (_, i) => `ra/2026/08/uploaded-${i}.jpg`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 200, urls }) });
  });
}

// A minimal in-browser "image" - the upload endpoint is mocked, so the bytes
// never actually have to decode as one.
function fakePhoto(name) {
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from('fake-image-bytes') };
}

async function fillHeader(page, values) {
  const v = Object.assign({
    activity: 'Lux Instore BA Deployment',
    typeOfActivity: 'Promotional',
    location: 'KLI - Gate 3',
    eventActivities: 'BA deployment for Lux instore promotion',
    department: 'Field Sales',
    area: 'North Zone',
  }, values || {});

  // A prior test's successful submit navigates to reporting.html (see
  // submitRiskAssessment), which is not mocked here and can 401 against the
  // real API and clear localStorage via the shared handleRequestError - so
  // every fresh run of the wizard re-seeds the session first rather than
  // assuming an earlier test left it intact.
  await page.goto(PAGE_URL);
  await setupAuth(page);
  await page.goto(PAGE_URL);
  await page.waitForSelector('#raHeaderStep', { state: 'visible' });
  await page.fill('#raActivity', v.activity);
  await page.fill('#raTypeOfActivity', v.typeOfActivity);
  await page.fill('#raLocation', v.location);
  await page.fill('#raEventActivities', v.eventActivities);
  await page.fill('#raDepartment', v.department);
  await page.fill('#raArea', v.area);
  await page.click('#raHeaderNext');
  await page.waitForSelector('.ra-list-screen');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(PAGE_URL);
  await setupAuth(page);
  await mockRiskApi(page);

  console.log('\nClient risk matrix (Js/RiskMatrix.js — unchanged, reused as-is)');

  await runTest('matches the workbook for every cell', async () => {
    await page.goto(PAGE_URL);
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

  await runTest('same rating can carry different categories (S=8/P=1 -> M+, S=4/P=2 -> L)', async () => {
    const rare = await page.evaluate(() => window.evaluateRisk(8, 1));
    const common = await page.evaluate(() => window.evaluateRisk(4, 2));

    assert.strictEqual(rare.rating, 8);
    assert.strictEqual(common.rating, 8);
    assert.strictEqual(rare.category, 'M+');
    assert.strictEqual(common.category, 'L');
  });

  await runTest('RISK_SCALE_VALUES / RISK_CATEGORY_COLOUR are reachable as window properties', async () => {
    assert.deepStrictEqual(await page.evaluate(() => window.RISK_SCALE_VALUES), [1, 2, 4, 6, 8, 10]);
    assert.deepStrictEqual(await page.evaluate(() => window.RISK_CATEGORY_COLOUR), {
      VL: '#c6efce', L: '#d9ead3', M: '#ffeb9c', 'M+': '#ffd966', H: '#f4b183', VH: '#ff7c80',
    });
  });

  await runTest('window.riskAssessmentState is reachable (var, not const)', async () => {
    const hasState = await page.evaluate(() => typeof window.riskAssessmentState === 'object');
    assert.strictEqual(hasState, true);
  });

  console.log('\nHeader gate');

  await runTest('Continue is blocked with no activity entered', async () => {
    await page.goto(PAGE_URL);
    await page.waitForSelector('#raHeaderStep', { state: 'visible' });
    await page.click('#raHeaderNext');

    assert.strictEqual(await page.isVisible('#raHeaderStep'), true,
      'the header step must stay open when activity is blank');
    assert.strictEqual(await page.isVisible('.ra-list-screen'), false);
    const error = await page.textContent('#raError');
    assert.ok(error.toLowerCase().includes('activity'), `expected an activity error, got: "${error}"`);
  });

  await runTest('confirming the header populates state and starts with one blank task', async () => {
    await fillHeader(page);

    const state = await page.evaluate(() => window.riskAssessmentState);
    assert.strictEqual(state.header.activity, 'Lux Instore BA Deployment');
    assert.strictEqual(state.header.department, 'Field Sales');
    assert.strictEqual(state.tasks.length, 1, 'the builder must start with exactly one blank task');
    assert.strictEqual(state.tasks[0].taskName, '');
    assert.strictEqual(state.tasks[0].hazards.length, 0);
  });

  console.log('\nBuilder navigation and nesting');

  await runTest('adding a task jumps straight into it, and it starts with no hazards', async () => {
    await fillHeader(page);
    await page.click('#raAddTask');
    await page.waitForSelector('.ra-task-screen');

    const state = await page.evaluate(() => window.riskAssessmentState);
    assert.strictEqual(state.tasks.length, 2);
    assert.strictEqual(state.nav.screen, 'task');
    assert.strictEqual(state.nav.taskIndex, 1);
  });

  await runTest('typing a task name updates state and back returns to the list showing it', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup & Dismantling Activity');

    const stateBefore = await page.evaluate(() => window.riskAssessmentState.tasks[0].taskName);
    assert.strictEqual(stateBefore, 'Setup & Dismantling Activity');

    await page.click('#raBackToList');
    await page.waitForSelector('.ra-list-screen');
    const title = await page.textContent('.ra-task-card-title');
    assert.strictEqual(title.trim(), 'Setup & Dismantling Activity');
  });

  await runTest('adding a hazard jumps into it, and controls start empty', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    const hazard = await page.evaluate(() =>
      window.riskAssessmentState.tasks[0].hazards[0]);
    assert.strictEqual(hazard.controls.length, 0);
    assert.strictEqual(hazard.actOrCondition, 'Condition', 'default before the assessor picks one');
  });

  await runTest('one task can carry several distinct hazards, each scored independently', async () => {
    // This is the whole point of the rebuild: v1 crammed "manual handling,
    // falling object, electric shock" into one cell under one score. v2 must
    // let each hazard under the same task carry its own severity/probability.
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');

    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '2');
    await page.click('#raBackToTask');
    await page.waitForSelector('.ra-task-screen');

    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Manual handling strain');
    await page.selectOption('.ra-base-severity', '2');
    await page.selectOption('.ra-base-probability', '6');

    const hazards = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards);
    assert.strictEqual(hazards.length, 2);
    assert.strictEqual(hazards[0].hazardText, 'Electric shock');
    assert.strictEqual(hazards[0].baseSeverity, 8);
    assert.strictEqual(hazards[1].hazardText, 'Manual handling strain');
    assert.strictEqual(hazards[1].baseSeverity, 2);
  });

  await runTest('adding several controls under one hazard nests them all', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Vetted transport only');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="1"]', 'PPE issued');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="2"]', 'Daily briefing');

    const controls = await page.evaluate(() =>
      window.riskAssessmentState.tasks[0].hazards[0].controls.map(c => c.controlText));
    assert.deepStrictEqual(controls, ['Vetted transport only', 'PPE issued', 'Daily briefing']);
  });

  console.log('\nRemoval — task, hazard, control');

  await runTest('removing a control drops only that one, keeping order', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'First');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="1"]', 'Second');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="2"]', 'Third');

    await page.click('.ra-control-remove[data-control-index="1"]'); // remove "Second"

    const controls = await page.evaluate(() =>
      window.riskAssessmentState.tasks[0].hazards[0].controls.map(c => c.controlText));
    assert.deepStrictEqual(controls, ['First', 'Third']);
  });

  await runTest('removing a hazard drops only that one and returns to the task screen', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');

    await page.click('#raAddHazard');
    await page.fill('.ra-hazard-text', 'Hazard A');
    await page.click('#raBackToTask');
    await page.click('#raAddHazard');
    await page.fill('.ra-hazard-text', 'Hazard B');
    await page.click('#raBackToTask');
    await page.waitForSelector('.ra-hazard-card');

    await page.click('.ra-hazard-remove[data-hazard-index="0"]');
    await page.waitForSelector('.ra-task-screen');

    const hazards = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards);
    assert.strictEqual(hazards.length, 1);
    assert.strictEqual(hazards[0].hazardText, 'Hazard B', 'removing index 0 must leave hazard B, not A');
  });

  await runTest('removing a task from the list drops only that one', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Task One');
    await page.click('#raBackToList');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raAddTask');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Task Two');
    await page.click('#raBackToList');
    await page.waitForSelector('.ra-task-card:nth-child(2)');

    await page.click('.ra-task-remove[data-task-index="0"]');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].taskName, 'Task Two', 'removing index 0 must leave Task Two, not Task One');
  });

  await runTest('removing the current task from inside it returns to the list', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raRemoveTask');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks.length, 0);
  });

  console.log('\nLive category chip (Base Risk section)');

  await runTest('chip updates live and shows M+ for S=8/P=1, L for S=4/P=2 — same rating, different category', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '1');
    assert.strictEqual(await page.textContent('.ra-base-rating'), '8');
    assert.strictEqual(await page.textContent('.ra-base-category'), 'M+');

    await page.selectOption('.ra-base-severity', '4');
    await page.selectOption('.ra-base-probability', '2');
    assert.strictEqual(await page.textContent('.ra-base-rating'), '8');
    assert.strictEqual(await page.textContent('.ra-base-category'), 'L');
  });

  await runTest('base and residual chips are independent', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '8');
    await page.selectOption('.ra-residual-severity', '1');
    await page.selectOption('.ra-residual-probability', '1');

    assert.strictEqual(await page.textContent('.ra-base-category'), 'VH');
    assert.strictEqual(await page.textContent('.ra-residual-category'), 'VL');
  });

  console.log('\nHTML escaping (DOM inspection, not string matching)');

  const MALICIOUS = '<img src=x onerror=alert(1)>Ladder & "Rigging" work';

  await runTest('a task name with angle brackets and a quote renders as visible text on the list card', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', MALICIOUS);
    await page.click('#raBackToList');
    await page.waitForSelector('.ra-list-screen');

    const result = await page.evaluate(() => {
      const el = document.querySelector('.ra-task-card-title');
      return {
        text: el.textContent,
        imgCount: document.querySelectorAll('.ra-task-card img').length,
        cardCount: document.querySelectorAll('.ra-task-card').length,
      };
    });

    assert.strictEqual(result.text, MALICIOUS, 'the raw name must come back as plain text, unchanged');
    assert.strictEqual(result.imgCount, 0, 'the markup must not have created an <img> element');
    assert.strictEqual(result.cardCount, 1, 'nothing extra injected');
  });

  await runTest('a double quote in Person at risk does not break out of the value attribute', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    const payload = 'Forklift driver " onmouseover="alert(1)';
    await page.fill('.ra-person', payload);

    const result = await page.evaluate(() => {
      const input = document.querySelector('.ra-person');
      return {
        value: input.value,
        onmouseover: input.getAttribute('onmouseover'),
        extraInputs: document.querySelectorAll('.ra-person').length,
      };
    });

    assert.strictEqual(result.value, payload);
    assert.strictEqual(result.onmouseover, null, 'the quote must not have terminated the value attribute early');
    assert.strictEqual(result.extraInputs, 1, 'the quote must not have injected a stray element');
  });

  await runTest('markup in hazard text and a control line renders as text on the review screen, no injection', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', MALICIOUS);
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', '<script>alert(2)<'.concat('/script>A "quoted" control'));

    await page.click('#raBackToTask');
    await page.click('#raBackToList');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const result = await page.evaluate(() => {
      const hazardHead = document.querySelector('.ra-review-hazard-head strong');
      const controlLi = document.querySelector('.ra-review-controls li');
      return {
        hazardText: hazardHead.textContent,
        hazardInnerHtml: hazardHead.innerHTML,
        controlText: controlLi.textContent,
        imgCount: document.querySelectorAll('.ra-review-list img').length,
        scriptCount: document.querySelectorAll('.ra-review-list script').length,
      };
    });

    assert.strictEqual(result.hazardText, MALICIOUS);
    assert.strictEqual(result.imgCount, 0);
    assert.strictEqual(result.scriptCount, 0, 'the control text must not have injected a <script> element');
    assert.ok(result.controlText.includes('A "quoted" control'));
    assert.strictEqual(result.hazardInnerHtml,
      '&lt;img src=x onerror=alert(1)&gt;Ladder &amp; "Rigging" work',
      'escaped exactly once, matching escapeHtml\'s own output');
  });

  console.log('\nReview validation (mirrors the backend\'s own rejection rules)');

  await runTest('Review is blocked with no tasks, naming nothing to fix but explaining why', async () => {
    await fillHeader(page);
    // The starting task has no hazards yet and we are already on the list —
    // delete it directly to get down to zero tasks.
    await page.click('.ra-task-remove[data-task-index="0"]');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raReviewBtn');

    assert.strictEqual(await page.isVisible('.ra-review-screen'), false);
    const error = await page.textContent('#raError');
    assert.ok(/at least one task/i.test(error), `expected a "no tasks" error, got: "${error}"`);
  });

  await runTest('Review is blocked and the empty task is named when it has no hazards', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Travel to Store');
    await page.click('#raBackToList');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raReviewBtn');

    assert.strictEqual(await page.isVisible('.ra-review-screen'), false);
    const error = await page.textContent('#raError');
    assert.ok(error.includes('Travel to Store'), `expected the task to be named in the error, got: "${error}"`);
  });

  await runTest('a hazard with no controls passes review and reaches Submit — that is a legitimate finding', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Travel to Store');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Road traffic accident');
    await page.click('#raBackToTask');
    await page.click('#raBackToList');
    await page.click('#raReviewBtn');

    await page.waitForSelector('.ra-review-screen');
    const error = await page.textContent('#raError');
    assert.strictEqual(error, '');
  });

  console.log('\nSubmit payload — nesting, sortOrder, siteId as string');

  await runTest('submit posts the header and the full task -> hazard -> control tree, correctly nested', async () => {
    await fillHeader(page, {
      activity: 'Lux BA Deployment - Aug run',
      typeOfActivity: 'Promotional',
      location: 'KLI - Gate 3',
      eventActivities: 'Female BA deployment',
      department: 'Field Sales',
      area: 'North Zone',
    });

    // Task 1: two hazards, the first with two controls, the second with none.
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup & Dismantling Activity');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.click('.ra-toggle-btn[data-value="Act"]');
    await page.fill('.ra-person', 'Rigger');
    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '2');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="1"]', 'Licensed electrician only');
    await page.selectOption('.ra-residual-severity', '8');
    await page.selectOption('.ra-residual-probability', '1');
    await page.click('#raBackToTask');

    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Manual handling strain');
    await page.fill('.ra-person', 'Rigger');
    await page.selectOption('.ra-base-severity', '2');
    await page.selectOption('.ra-base-probability', '6');
    // No controls added on purpose - accepted finding.
    await page.click('#raBackToTask');
    await page.click('#raBackToList');

    // Task 2: one hazard.
    await page.click('#raAddTask');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Travel to Store');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Road traffic accident');
    await page.fill('.ra-person', 'BA');
    await page.selectOption('.ra-base-severity', '6');
    await page.selectOption('.ra-base-probability', '6');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Online taxi services used');
    await page.click('#raBackToTask');
    await page.click('#raBackToList');

    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    const body = JSON.parse(request.postData());

    assert.strictEqual(body.activity, 'Lux BA Deployment - Aug run');
    assert.strictEqual(body.typeOfActivity, 'Promotional');
    assert.strictEqual(body.location, 'KLI - Gate 3');
    assert.strictEqual(body.eventActivities, 'Female BA deployment');
    assert.strictEqual(body.department, 'Field Sales');
    assert.strictEqual(body.area, 'North Zone');
    assert.strictEqual(typeof body.siteId, 'string', 'siteId must be sent as a string');
    assert.strictEqual(body.siteId, '1');
    assert.strictEqual(body.reportedBy, 'mohsin@be.com.pk');

    // No client-computed rating/category anywhere in the payload - the server
    // is the sole authority and recomputes both.
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes('baseRating') && !raw.includes('baseCategory') &&
      !raw.includes('residualRating') && !raw.includes('residualCategory'),
      'the payload must not send any client-computed rating/category');

    assert.strictEqual(body.tasks.length, 2);

    const task1 = body.tasks[0];
    assert.strictEqual(task1.sortOrder, 1);
    assert.strictEqual(task1.taskName, 'Setup & Dismantling Activity');
    assert.strictEqual(task1.hazards.length, 2, 'one task, two distinct hazards - the whole point of the rebuild');

    const shock = task1.hazards[0];
    assert.strictEqual(shock.sortOrder, 1);
    assert.strictEqual(shock.hazardText, 'Electric shock');
    assert.strictEqual(shock.actOrCondition, 'Act');
    assert.strictEqual(shock.personAtRisk, 'Rigger');
    assert.strictEqual(shock.baseSeverity, 8);
    assert.strictEqual(shock.baseProbability, 2);
    assert.strictEqual(shock.residualSeverity, 8);
    assert.strictEqual(shock.residualProbability, 1);
    assert.strictEqual(shock.controls.length, 2);
    assert.deepStrictEqual(shock.controls, [
      { sortOrder: 1, controlText: 'Isolate power before rigging' },
      { sortOrder: 2, controlText: 'Licensed electrician only' },
    ]);

    const strain = task1.hazards[1];
    assert.strictEqual(strain.hazardText, 'Manual handling strain');
    assert.strictEqual(strain.controls.length, 0, 'a hazard with no controls must still be posted, just with an empty array');

    const task2 = body.tasks[1];
    assert.strictEqual(task2.sortOrder, 2);
    assert.strictEqual(task2.taskName, 'Travel to Store');
    assert.strictEqual(task2.hazards.length, 1);
    assert.strictEqual(task2.hazards[0].hazardText, 'Road traffic accident');
    assert.strictEqual(task2.hazards[0].controls[0].controlText, 'Online taxi services used');

    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
  });

  console.log('\nReview summary counts hazards, not tasks');

  await runTest('the base/residual summary table counts by hazard', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup & Dismantling Activity');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.selectOption('.ra-base-severity', '6');
    await page.selectOption('.ra-base-probability', '6'); // H
    await page.selectOption('.ra-residual-severity', '6');
    await page.selectOption('.ra-residual-probability', '2'); // M
    await page.click('#raBackToTask');

    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.selectOption('.ra-base-severity', '2');
    await page.selectOption('.ra-base-probability', '6'); // M
    await page.click('#raBackToTask');
    await page.click('#raBackToList');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const summary = await page.evaluate(() =>
      window.buildRiskSummary(window.riskAssessmentState.tasks));

    const baseTotal = Object.values(summary.base).reduce((a, b) => a + b, 0);
    assert.strictEqual(baseTotal, 2, 'two hazards under one task must both be counted, not just the task once');
    assert.strictEqual(summary.base['H'], 1);
    assert.strictEqual(summary.base['M'], 1);
    assert.strictEqual(summary.residual['M'], 1);
  });

  console.log('\nPhoto attachments (review screen)');

  async function goToReviewWithOneHazard(page) {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Travel to Store');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Road traffic accident');
    await page.click('#raBackToTask');
    await page.click('#raBackToList');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');
  }

  await runTest('attaching a photo posts it to the upload endpoint and shows it in the list', async () => {
    await goToReviewWithOneHazard(page);

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/uploadFiles'),
      page.setInputFiles('#raPhotoInput', fakePhoto('loading-bay.jpg')),
    ]);

    assert.strictEqual(request.method(), 'POST');
    const body = request.postData() || '';
    assert.ok(body.includes('name="files"'));
    assert.ok(body.includes('loading-bay.jpg'));

    await page.waitForFunction(() => window.riskAssessmentState.photos.length === 1);
    const photos = await page.evaluate(() => window.riskAssessmentState.photos);
    assert.strictEqual(photos[0].key, 'ra/2026/08/uploaded-0.jpg');
    assert.strictEqual(photos[0].name, 'loading-bay.jpg');

    const listText = await page.textContent('#raPhotoList');
    assert.ok(listText.includes('loading-bay.jpg'));
  });

  await runTest('the returned keys appear in the files field of the submit payload', async () => {
    await goToReviewWithOneHazard(page);

    await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/uploadFiles'),
      page.setInputFiles('#raPhotoInput', [fakePhoto('spill.jpg'), fakePhoto('drum.jpg')]),
    ]);
    await page.waitForFunction(() => window.riskAssessmentState.photos.length === 2);

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);

    const body = JSON.parse(request.postData());
    assert.strictEqual(typeof body.files, 'string');
    assert.deepStrictEqual(JSON.parse(body.files),
      ['ra/2026/08/uploaded-0.jpg', 'ra/2026/08/uploaded-1.jpg']);

    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
  });

  await runTest('a user can remove an attached photo before submitting', async () => {
    await goToReviewWithOneHazard(page);

    await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/uploadFiles'),
      page.setInputFiles('#raPhotoInput', [fakePhoto('one.jpg'), fakePhoto('two.jpg')]),
    ]);
    await page.waitForFunction(() => window.riskAssessmentState.photos.length === 2);

    await page.click('.ra-photo-remove[data-index="0"]');
    await page.waitForFunction(() => window.riskAssessmentState.photos.length === 1);

    const remaining = await page.evaluate(() => window.riskAssessmentState.photos);
    assert.strictEqual(remaining[0].name, 'two.jpg');

    const listText = await page.textContent('#raPhotoList');
    assert.ok(!listText.includes('one.jpg'));
    assert.ok(listText.includes('two.jpg'));
  });

  await runTest('a failed photo upload leaves Submit usable and keeps wizard state intact', async () => {
    await goToReviewWithOneHazard(page);

    const tasksBefore = await page.evaluate(() => JSON.stringify(window.riskAssessmentState.tasks));

    await page.route('**/api/RiskAssessment/uploadFiles', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Upload failed on the server' }),
    }));
    await page.route('**/api/diagnostics/clientlog', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

    await page.setInputFiles('#raPhotoInput', fakePhoto('storm-photo.jpg'));

    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    await page.click('.swal2-confirm');

    await page.waitForFunction(() => document.getElementById('raSubmit').disabled === false);

    const statusText = await page.textContent('#raPhotoStatus');
    assert.ok(!/uploading/i.test(statusText), `must not still say Uploading, got: "${statusText}"`);

    const tasksAfter = await page.evaluate(() => JSON.stringify(window.riskAssessmentState.tasks));
    assert.strictEqual(tasksAfter, tasksBefore, 'a failed upload must not alter or wipe the wizard state');
    assert.strictEqual(await page.evaluate(() => window.riskAssessmentState.photos.length), 0);

    await page.unroute('**/api/RiskAssessment/uploadFiles');
    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    const body = JSON.parse(request.postData());
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'files'), false,
      'submitting without the photo must not send a bogus files value');

    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
    await page.unroute('**/api/diagnostics/clientlog');
  });

  await runTest('submitting with no photos sends no files field at all', async () => {
    await goToReviewWithOneHazard(page);

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);

    const body = JSON.parse(request.postData());
    assert.strictEqual(Object.prototype.hasOwnProperty.call(body, 'files'), false);

    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
  });

  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
