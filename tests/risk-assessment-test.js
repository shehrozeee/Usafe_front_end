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

  await runTest('removing the current task from inside it asks for confirmation, then returns to the list', async () => {
    // Removing a task discards every hazard scored under it, so - unlike
    // removing a single hazard or control - it is gated behind an explicit
    // Swal confirm (see confirmRemoveTask in Js/RiskAssessmentProcessor.js).
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raRemoveTask');

    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    assert.strictEqual(await page.isVisible('.ra-list-screen'), false,
      'must not remove anything before the dialog is confirmed');
    await page.click('.swal2-confirm');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks.length, 0);
  });

  await runTest('cancelling the remove-task confirmation keeps the task intact', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Do Not Delete Me');
    await page.click('#raRemoveTask');

    await page.waitForSelector('.swal2-cancel', { state: 'visible' });
    await page.click('.swal2-cancel');

    assert.strictEqual(await page.isVisible('.ra-task-screen'), true,
      'cancelling must leave the assessor on the task screen');
    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].taskName, 'Do Not Delete Me');
  });

  console.log('\nConfirm actions — the wizard must never dead-end on a Remove button');

  await runTest('Confirm Hazard returns to the task screen and keeps what was entered', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Forklift collision');
    await page.selectOption('.ra-base-severity', '6');
    await page.selectOption('.ra-base-probability', '6');
    // A hazard needs a person at risk and at least one non-blank control
    // before Confirm will move on - not what this test is about, but
    // required to even get past it.
    await page.fill('.ra-person', 'Warehouse staff');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Keep pedestrians clear of forklift lanes');

    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');

    const hazard = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards[0]);
    assert.strictEqual(hazard.hazardText, 'Forklift collision', 'the hazard text must survive the navigation');
    assert.strictEqual(hazard.baseSeverity, 6);
    assert.strictEqual(hazard.baseProbability, 6);
    const cardText = await page.textContent('.ra-hazard-card-text');
    assert.strictEqual(cardText.trim(), 'Forklift collision', 'the hazard must show up on the task screen, not be removed');
  });

  await runTest('Confirm Task returns to the list and keeps the task name and its hazards', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');

    // Both options must be present and visible together on the task screen too.
    assert.strictEqual(await page.isVisible('#raConfirmTask'), true);
    assert.strictEqual(await page.isVisible('#raRemoveTask'), true);
    assert.strictEqual((await page.textContent('#raRemoveTask')).trim(), 'Remove this task');

    await page.fill('.ra-task-name-input', 'Loading Dock Work');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Falling boxes');
    await page.fill('.ra-person', 'Dock crew');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Boxes stacked to rated height only');
    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');

    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks[0].taskName, 'Loading Dock Work', 'the task name must survive the navigation');
    assert.strictEqual(tasks[0].hazards.length, 1, 'the hazard scored under it must not be lost or removed');
    assert.strictEqual(tasks[0].hazards[0].hazardText, 'Falling boxes');
    const title = await page.textContent('.ra-task-card-title');
    assert.strictEqual(title.trim(), 'Loading Dock Work');
  });

  await runTest('a complete path from scoring a hazard to Review & Submit, without touching the breadcrumb', async () => {
    // This is the dead end from the bug report, walked end to end: score a
    // hazard, confirm it, confirm the task, and land on Review & Submit -
    // using only the new confirm buttons, never #raBackToTask/#raBackToList/
    // #raCrumbList.
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup Activity');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.fill('.ra-person', 'Rigger');
    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '2');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');
    await page.selectOption('.ra-residual-severity', '8');
    await page.selectOption('.ra-residual-probability', '1');

    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const error = await page.textContent('#raError');
    assert.strictEqual(error, '', 'the review gate must pass - the scored hazard and its task reached it intact');
    const reviewText = await page.textContent('.ra-review-list');
    assert.ok(reviewText.includes('Setup Activity'));
    assert.ok(reviewText.includes('Electric shock'));
    assert.ok(reviewText.includes('Isolate power before rigging'));

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    const body = JSON.parse(request.postData());
    assert.strictEqual(body.tasks[0].hazards[0].hazardText, 'Electric shock',
      'what was scored via Confirm must be exactly what gets submitted');
    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
  });

  await runTest('Remove this hazard stays a full, visible button alongside Confirm Hazard, and still works', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Mistake - wrong hazard');

    // Both options must be present and visible together - Remove is not
    // hidden, shrunk, or replaced just because Confirm now exists alongside it.
    assert.strictEqual(await page.isVisible('#raConfirmHazard'), true);
    assert.strictEqual(await page.isVisible('#raRemoveHazard'), true);
    assert.strictEqual((await page.textContent('#raRemoveHazard')).trim(), 'Remove this hazard');

    await page.click('#raRemoveHazard');
    await page.waitForSelector('.ra-task-screen');

    const hazards = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards);
    assert.strictEqual(hazards.length, 0, 'Remove this hazard must still remove it');
  });

  console.log('\nControls are now mandatory — a hazard needs at least one before Confirm will move on');

  await runTest('Confirm Hazard is blocked with no controls, and explains why in place rather than dead-ending', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Chemical spill');

    await page.click('#raConfirmHazard');

    // Must not have silently succeeded and moved on - this is exactly the
    // "dead or silent button" trap the wizard already had once (see the
    // Confirm/Remove sticky footer history above).
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'Confirm must not navigate away while the hazard has no control');
    assert.strictEqual(await page.isVisible('.ra-task-screen'), false);

    const inlineMessage = await page.textContent('.ra-controls-error-msg');
    assert.ok(/control/i.test(inlineMessage), `expected an inline reason next to the controls list, got: "${inlineMessage}"`);
    const pageError = await page.textContent('#raError');
    assert.ok(/control/i.test(pageError), `expected the page-level error too, got: "${pageError}"`);

    const hazard = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards[0]);
    assert.strictEqual(hazard.hazardText, 'Chemical spill', 'nothing entered must be lost while blocked');
  });

  await runTest('a whitespace-only control is treated as no control at all', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Chemical spill');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', '   ');

    await page.click('#raConfirmHazard');

    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'a whitespace-only control must satisfy none of the requirement\'s purpose, so it must still block');
    const pageError = await page.textContent('#raError');
    assert.ok(/control/i.test(pageError));
  });

  await runTest('typing real text into that control unblocks Confirm Hazard', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Chemical spill');
    await page.fill('.ra-person', 'Warehouse staff');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', '   ');
    await page.click('#raConfirmHazard');
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true, 'sanity check: still blocked with blank text');

    await page.fill('.ra-control-text[data-control-index="0"]', 'Spill kit on site');
    await page.click('#raConfirmHazard');

    await page.waitForSelector('.ra-task-screen');
    const hazard = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards[0]);
    assert.strictEqual(hazard.controls[0].controlText, 'Spill kit on site', 'the real control must have been kept');
  });

  console.log('\nHazard description and person at risk are now required too');

  await runTest('Confirm Hazard is blocked with a blank hazard description, and explains why in place', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-person', 'Rigger');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');

    await page.click('#raConfirmHazard');

    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'Confirm must not navigate away while the hazard has no description');
    assert.strictEqual(await page.isVisible('.ra-task-screen'), false);

    const inlineMessage = await page.textContent('.ra-hazardtext-error-msg');
    assert.ok(/hazard/i.test(inlineMessage), `expected an inline reason next to the hazard text field, got: "${inlineMessage}"`);
    const pageError = await page.textContent('#raError');
    assert.ok(/hazard description/i.test(pageError), `expected the page-level error too, got: "${pageError}"`);
  });

  await runTest('a whitespace-only hazard description is treated as blank', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', '   ');
    await page.fill('.ra-person', 'Rigger');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');

    await page.click('#raConfirmHazard');
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'whitespace-only must satisfy none of the requirement\'s purpose, so it must still block');
  });

  await runTest('Confirm Hazard is blocked with a blank person at risk, and explains why in place', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');

    await page.click('#raConfirmHazard');

    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'Confirm must not navigate away while the hazard has no person at risk');
    const inlineMessage = await page.textContent('.ra-person-error-msg');
    assert.ok(/who is at risk/i.test(inlineMessage), `expected an inline reason next to the person field, got: "${inlineMessage}"`);
    const pageError = await page.textContent('#raError');
    assert.ok(/who is at risk/i.test(pageError), `expected the page-level error too, got: "${pageError}"`);
  });

  await runTest('a whitespace-only person at risk is treated as blank', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.fill('.ra-person', '   ');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');

    await page.click('#raConfirmHazard');
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'whitespace-only must satisfy none of the requirement\'s purpose, so it must still block');
  });

  await runTest('a hazard missing every required field reports all of them together, not one at a time', async () => {
    // Hazard text, person at risk and controls all live on this one screen
    // at once, so being sent back three times in a row for one field each
    // would be worse than being told once what is outstanding.
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');

    await page.click('#raConfirmHazard');

    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true);
    const [hazardtextError, personError, controlsError] = await Promise.all([
      page.isVisible('.ra-hazardtext-error-msg'),
      page.isVisible('.ra-person-error-msg'),
      page.isVisible('.ra-controls-error-msg'),
    ]);
    assert.ok(hazardtextError && personError && controlsError,
      'all three missing fields must be flagged in the same pass, not just the first');
  });

  await runTest('filling in the hazard description and person at risk unblocks Confirm Hazard', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.click('#raConfirmHazard');
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true, 'sanity check: blocked when empty');

    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.fill('.ra-person', 'Rigger');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');
    await page.click('#raConfirmHazard');

    await page.waitForSelector('.ra-task-screen');
    const hazard = await page.evaluate(() => window.riskAssessmentState.tasks[0].hazards[0]);
    assert.strictEqual(hazard.hazardText, 'Electric shock');
    assert.strictEqual(hazard.personAtRisk, 'Rigger');
  });

  console.log('\nTask name is now required too');

  await runTest('Confirm Task is blocked with a blank task name, and explains why in place', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');

    await page.click('#raConfirmTask');

    assert.strictEqual(await page.isVisible('.ra-task-screen'), true,
      'Confirm must not navigate away while the task has no name');
    assert.strictEqual(await page.isVisible('.ra-list-screen'), false);

    const inlineMessage = await page.textContent('.ra-taskname-error-msg');
    assert.ok(/task name/i.test(inlineMessage), `expected an inline reason next to the task name field, got: "${inlineMessage}"`);
    const pageError = await page.textContent('#raError');
    assert.ok(/task name/i.test(pageError), `expected the page-level error too, got: "${pageError}"`);
  });

  await runTest('a whitespace-only task name is treated as blank', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', '   ');

    await page.click('#raConfirmTask');
    assert.strictEqual(await page.isVisible('.ra-task-screen'), true,
      'whitespace-only must satisfy none of the requirement\'s purpose, so it must still block');
  });

  await runTest('typing a real task name unblocks Confirm Task', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raConfirmTask');
    assert.strictEqual(await page.isVisible('.ra-task-screen'), true, 'sanity check: blocked when blank');

    await page.fill('.ra-task-name-input', 'Rig the stage');
    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks[0].taskName, 'Rig the stage');
  });

  await runTest('Submit identifies an unnamed hazard by its position when it has no name to quote', async () => {
    // A hazard can only be born with a blank name today via a pre-rule draft
    // (Confirm now refuses one) - simulated the same way the control-less
    // draft case above is: written straight into state rather than driven
    // through the wizard, since the wizard itself can no longer produce it.
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup Activity');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.fill('.ra-person', 'Rigger');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');
    await page.click('#raBackToTask');
    await page.click('#raBackToList');

    await page.evaluate(() => {
      window.riskAssessmentState.tasks[0].hazards.push({
        hazardText: '', actOrCondition: 'Condition', personAtRisk: '',
        baseSeverity: 2, baseProbability: 2, controls: [],
        residualSeverity: 2, residualProbability: 2,
      });
      window.riskAssessmentState.nav = { screen: 'review', taskIndex: null, hazardIndex: null };
      window.render();
    });
    await page.waitForSelector('.ra-review-screen');

    await page.click('#raSubmit');

    await page.waitForSelector('.ra-hazard-screen');
    const nav = await page.evaluate(() => window.riskAssessmentState.nav);
    assert.strictEqual(nav.taskIndex, 0);
    assert.strictEqual(nav.hazardIndex, 1, 'must jump to the second hazard - the unnamed one');

    const error = await page.textContent('#raError');
    assert.ok(/Hazard 2/.test(error), `expected the hazard to be identified by position, got: "${error}"`);
    assert.ok(!/""/.test(error), 'must not print an empty quoted name when there is none to quote');
    assert.ok(error.includes('Setup Activity'), `expected the task to still be named, got: "${error}"`);
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
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Task With Markup');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', MALICIOUS);
    await page.fill('.ra-person', 'Someone at risk');
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

  // INVERTED (was: "a hazard with no controls passes review and reaches
  // Submit — that is a legitimate finding"). The product decision reversed:
  // a hazard with no control is no longer an accepted finding, it is a
  // blocked submission. This test used to prove the old, now-wrong rule; it
  // is deliberately flipped to prove the new one, not deleted, so the suite
  // still exercises this exact path.
  await runTest('a hazard with no controls blocks Review, naming the hazard and its task', async () => {
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Travel to Store');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Road traffic accident');
    await page.click('#raBackToTask'); // plain nav, not Confirm - bypasses the hazard-screen gate on purpose
    await page.click('#raBackToList');
    await page.click('#raReviewBtn');

    assert.strictEqual(await page.isVisible('.ra-review-screen'), false,
      'a hazard with no control must no longer be allowed to reach review');
    const error = await page.textContent('#raError');
    assert.ok(/no control/i.test(error), `expected a no-control message, got: "${error}"`);
    assert.ok(error.includes('Road traffic accident'), `expected the hazard to be named, got: "${error}"`);
    assert.ok(error.includes('Travel to Store'), `expected the task to be named too, got: "${error}"`);
  });

  await runTest('Submit refuses a hazard with no control even when it reaches Review directly, and jumps to it', async () => {
    // The Review gate above stops a normal walk through the wizard from ever
    // getting here with an invalid hazard - but a hazard can still reach the
    // review screen without going through tryGoToReview at all (a draft
    // restored straight onto 'review', see restoreRaDraft). Simulate exactly
    // that by writing the invalid hazard into state directly and forcing the
    // review screen, instead of going through the draft/localStorage plumbing
    // (that path is covered separately below) - this test is about Submit's
    // own guard, the last checkpoint before the network call.
    await fillHeader(page);
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Setup Activity');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Electric shock');
    await page.fill('.ra-person', 'Rigger');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Isolate power before rigging');
    await page.click('#raBackToTask');
    await page.click('#raBackToList');

    await page.evaluate(() => {
      window.riskAssessmentState.tasks[0].hazards.push({
        hazardText: 'Falling tools', actOrCondition: 'Condition', personAtRisk: '',
        baseSeverity: 2, baseProbability: 2, controls: [],
        residualSeverity: 2, residualProbability: 2,
      });
      window.riskAssessmentState.nav = { screen: 'review', taskIndex: null, hazardIndex: null };
      window.render();
    });
    await page.waitForSelector('.ra-review-screen');

    await page.click('#raSubmit');

    // Must land on the exact offending hazard, not just refuse silently.
    await page.waitForSelector('.ra-hazard-screen');
    const nav = await page.evaluate(() => window.riskAssessmentState.nav);
    assert.strictEqual(nav.taskIndex, 0);
    assert.strictEqual(nav.hazardIndex, 1, 'must jump to the second hazard - the one missing a control');

    const error = await page.textContent('#raError');
    assert.ok(error.includes('Falling tools'), `expected the offending hazard to be named, got: "${error}"`);
    assert.ok(/no control/i.test(error));

    const hasInlineBanner = await page.evaluate(() => !!document.querySelector('.ra-controls-error-msg'));
    assert.ok(hasInlineBanner, 'the controls block itself must show an inline reason too, not just the page-level error');
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
    // A hazard with no controls is no longer a valid finding - Submit refuses
    // it - so this fixture (about payload nesting/shape, not the control
    // rule) needs one too, same as every hazard below.
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Team lift for anything over 15kg');
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
    assert.strictEqual(strain.controls.length, 1, 'this hazard\'s own control must still be posted, nested under it');
    assert.strictEqual(strain.controls[0].controlText, 'Team lift for anything over 15kg');

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
    await page.fill('.ra-hazard-text', 'Falling rigging');
    await page.fill('.ra-person', 'Rigger');
    await page.selectOption('.ra-base-severity', '6');
    await page.selectOption('.ra-base-probability', '6'); // H
    await page.selectOption('.ra-residual-severity', '6');
    await page.selectOption('.ra-residual-probability', '2'); // M
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Rigging inspected daily');
    await page.click('#raBackToTask');

    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Manual handling strain');
    await page.fill('.ra-person', 'Crew');
    await page.selectOption('.ra-base-severity', '2');
    await page.selectOption('.ra-base-probability', '6'); // M
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'PPE issued');
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
    await page.fill('.ra-person', 'BA');
    // Review (and therefore Submit) now refuses a hazard with no control, so
    // every one of these photo-focused tests needs one just to get there.
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Online taxi services used');
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

  console.log('\nDraft auto-save (matches Js/GenericQuestioneerProcessor.js\'s checklist pattern)');

  // Scoped per logged-in user (see _getRaDraftKey in Js/RiskAssessmentProcessor.js) -
  // setupAuth always seeds this same userName, so every draft test reads/writes
  // this one key directly to set up or verify state without waiting on timers
  // where a timer isn't the thing under test.
  const RA_DRAFT_KEY = 'usafe_ra_draft_mohsin@be.com.pk';

  await runTest('filling part of an assessment then reloading offers the resume prompt', async () => {
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await fillHeader(page, { activity: 'Draft Prompt Test' });
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Rig the stage');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Falling truss');

    // Let the 2s input-debounce actually persist the draft before reloading -
    // this is exercising the real timer, not a forced save.
    await page.waitForTimeout(2200);

    await page.reload();
    await page.waitForSelector('.swal2-popup', { state: 'visible' });

    const title = await page.textContent('.swal2-title');
    assert.strictEqual(title.trim(), 'Resume Draft?');
    const html = await page.textContent('.swal2-html-container');
    assert.ok(html.includes('unsaved draft from'), `expected draft timestamp wording, got: "${html}"`);
    assert.ok(html.includes('Would you like to resume?'), `expected exact wording, got: "${html}"`);
    assert.strictEqual((await page.textContent('.swal2-confirm')).trim(), 'Resume');
    assert.strictEqual((await page.textContent('.swal2-cancel')).trim(), 'Start Fresh');

    await page.click('.swal2-cancel');
  });

  await runTest('resuming restores the header, tasks, hazards, scores and controls intact', async () => {
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await fillHeader(page, {
      activity: 'Resume Restore Activity',
      department: 'Ops',
      area: 'Zone 9',
    });
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Rig the stage');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Falling truss');
    await page.selectOption('.ra-base-severity', '8');
    await page.selectOption('.ra-base-probability', '4');
    await page.selectOption('.ra-residual-severity', '2');
    await page.selectOption('.ra-residual-probability', '2');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Rated rigging only');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="1"]', 'Daily inspection');

    await page.waitForTimeout(2200); // let the debounce persist the draft

    await page.reload();
    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    await page.click('.swal2-confirm'); // Resume

    // Restoring must put the assessor back on the exact screen they left,
    // not just recover the data.
    await page.waitForSelector('.ra-hazard-screen');

    const state = await page.evaluate(() => window.riskAssessmentState);
    assert.strictEqual(state.header.activity, 'Resume Restore Activity');
    assert.strictEqual(state.header.department, 'Ops');
    assert.strictEqual(state.header.area, 'Zone 9');
    assert.strictEqual(state.headerDone, true);
    assert.strictEqual(state.tasks.length, 1);
    assert.strictEqual(state.tasks[0].taskName, 'Rig the stage');
    assert.strictEqual(state.tasks[0].hazards.length, 1);

    const hazard = state.tasks[0].hazards[0];
    assert.strictEqual(hazard.hazardText, 'Falling truss');
    assert.strictEqual(hazard.baseSeverity, 8);
    assert.strictEqual(hazard.baseProbability, 4);
    assert.strictEqual(hazard.residualSeverity, 2);
    assert.strictEqual(hazard.residualProbability, 2);
    assert.deepStrictEqual(hazard.controls.map(c => c.controlText),
      ['Rated rigging only', 'Daily inspection']);

    assert.strictEqual(state.nav.screen, 'hazard');
    assert.strictEqual(state.nav.taskIndex, 0);
    assert.strictEqual(state.nav.hazardIndex, 0);

    // And the DOM itself reflects the restored data, not just in-memory state.
    assert.strictEqual(await page.inputValue('.ra-hazard-text'), 'Falling truss');
    const controlVals = await page.$$eval('.ra-control-text', els => els.map(el => el.value));
    assert.deepStrictEqual(controlVals, ['Rated rigging only', 'Daily inspection']);
  });

  await runTest('a pre-rule draft with a control-less hazard restores without crashing, and can be fixed and submitted', async () => {
    // Written straight to localStorage (rather than built by driving the
    // wizard) because this shape - a hazard with an empty controls array,
    // sitting on the review screen - could only ever have been saved before
    // this rule existed. The wizard itself can no longer produce it, but a
    // draft saved weeks ago on an old build still can, and resuming it must
    // neither crash nor silently let it through.
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await page.evaluate((key) => {
      const draft = {
        header: { activity: 'Legacy Draft', typeOfActivity: '', location: '', eventActivities: '', department: '', area: '' },
        headerDone: true,
        tasks: [{
          taskName: 'Old Task',
          hazards: [{
            hazardText: 'Unmitigated slip hazard', actOrCondition: 'Condition', personAtRisk: '',
            baseSeverity: 2, baseProbability: 2, controls: [],
            residualSeverity: 2, residualProbability: 2,
          }],
        }],
        nav: { screen: 'review', taskIndex: null, hazardIndex: null },
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(draft));
    }, RA_DRAFT_KEY);

    const pageErrors = [];
    const onPageError = (err) => pageErrors.push(err.message);
    page.on('pageerror', onPageError);

    await page.reload();
    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    await page.click('.swal2-confirm'); // Resume
    await page.waitForSelector('.ra-review-screen');

    assert.deepStrictEqual(pageErrors, [],
      `restoring a pre-rule draft must never throw, got: ${pageErrors.join('; ')}`);
    page.off('pageerror', onPageError);

    const reviewText = await page.textContent('.ra-review-list');
    assert.ok(reviewText.includes('Unmitigated slip hazard'), 'the restore itself must still show the legacy hazard');
    assert.ok(/no controls recorded/i.test(reviewText));

    // Submit must still refuse it, not silently accept legacy data just
    // because it predates the rule - and it must point the assessor at
    // exactly what to fix rather than leave them stuck on the review screen.
    await page.click('#raSubmit');
    await page.waitForSelector('.ra-hazard-screen');
    const error = await page.textContent('#raError');
    assert.ok(error.includes('Unmitigated slip hazard'), `expected the legacy hazard to be named, got: "${error}"`);

    // And the assessor can actually fix it from here and submit for real -
    // this legacy hazard predates the person-at-risk rule too, so that has
    // to be filled in alongside the control before Confirm will accept it.
    await page.fill('.ra-person', 'Store staff');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Wet floor signage placed');
    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    const body = JSON.parse(request.postData());
    assert.strictEqual(body.tasks[0].hazards[0].controls[0].controlText, 'Wet floor signage placed',
      'the fix made after resuming must be exactly what gets submitted');

    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});
  });

  await runTest('a draft restored with blank task and hazard names does not crash and can be corrected', async () => {
    // Simulates a draft saved before hazard text / person at risk / task
    // name were required at all (not just before controls were, covered
    // above). Both names are blank, and the draft drops the assessor
    // straight onto that exact hazard screen, to prove the in-place Confirm
    // guards treat a restored blank exactly like a freshly typed one.
    //
    // The previous test ends on a real submit that navigates to
    // reporting.html (unmocked) - that page can 401 against the live API and
    // clear localStorage via the shared handleRequestError, so the session
    // is re-seeded here the same way fillHeader always does, rather than
    // assuming it survived.
    await page.goto(PAGE_URL);
    await setupAuth(page);
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await page.evaluate((key) => {
      const draft = {
        header: { activity: 'Very Old Draft', typeOfActivity: '', location: '', eventActivities: '', department: '', area: '' },
        headerDone: true,
        tasks: [{
          taskName: '',
          hazards: [{
            hazardText: '', actOrCondition: 'Condition', personAtRisk: '',
            baseSeverity: 2, baseProbability: 2, controls: [],
            residualSeverity: 2, residualProbability: 2,
          }],
        }],
        nav: { screen: 'hazard', taskIndex: 0, hazardIndex: 0 },
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(draft));
    }, RA_DRAFT_KEY);

    const pageErrors = [];
    const onPageError = (err) => pageErrors.push(err.message);
    page.on('pageerror', onPageError);

    await page.reload();
    await page.waitForSelector('.swal2-confirm', { state: 'visible' });
    await page.click('.swal2-confirm'); // Resume
    await page.waitForSelector('.ra-hazard-screen');

    assert.deepStrictEqual(pageErrors, [],
      `restoring a fully blank pre-rule hazard must never throw, got: ${pageErrors.join('; ')}`);
    page.off('pageerror', onPageError);

    // Nothing has been fixed yet - Confirm must still refuse it, in place.
    await page.click('#raConfirmHazard');
    assert.strictEqual(await page.isVisible('.ra-hazard-screen'), true,
      'a restored blank hazard must not be confirmable as-is');

    await page.fill('.ra-hazard-text', 'Slip on wet floor');
    await page.fill('.ra-person', 'Store staff');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Wet floor signage placed');
    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');

    // The task itself is still nameless - Confirm Task must refuse that too.
    await page.click('#raConfirmTask');
    assert.strictEqual(await page.isVisible('.ra-task-screen'), true,
      'a restored blank task name must not be confirmable as-is');

    await page.fill('.ra-task-name-input', 'Clean up spill');
    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');

    const tasks = await page.evaluate(() => window.riskAssessmentState.tasks);
    assert.strictEqual(tasks[0].taskName, 'Clean up spill');
    assert.strictEqual(tasks[0].hazards[0].hazardText, 'Slip on wet floor');
    assert.strictEqual(tasks[0].hazards[0].personAtRisk, 'Store staff');
  });

  await runTest('declining the prompt starts clean and does not leave the old draft to reappear later', async () => {
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await fillHeader(page, { activity: 'Discard Me' });
    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Temp Task');

    await page.waitForTimeout(2200);

    await page.reload();
    await page.waitForSelector('.swal2-cancel', { state: 'visible' });
    await page.click('.swal2-cancel'); // Start Fresh

    await page.waitForSelector('#raHeaderStep', { state: 'visible' });
    assert.strictEqual(await page.inputValue('#raActivity'), '',
      'starting fresh must not prefill the discarded draft\'s activity');

    const draftGoneImmediately = await page.evaluate((key) => localStorage.getItem(key), RA_DRAFT_KEY);
    assert.strictEqual(draftGoneImmediately, null, 'declining must remove the old draft immediately');

    // A later reload must not resurrect what was just discarded.
    await page.reload();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.isVisible('.swal2-popup'), false,
      'a discarded draft must never reappear on a later reload');
  });

  await runTest('submitting clears the draft so the next assessment starts empty', async () => {
    await page.goto(PAGE_URL);
    await page.evaluate((key) => localStorage.removeItem(key), RA_DRAFT_KEY);
    await goToReviewWithOneHazard(page);

    await page.waitForTimeout(2200); // let a draft actually get persisted before submit

    const draftBeforeSubmit = await page.evaluate((key) => localStorage.getItem(key), RA_DRAFT_KEY);
    assert.ok(draftBeforeSubmit, 'sanity check: a draft must exist before submit for this test to prove anything');

    await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    await page.waitForURL('**/reporting.html', { timeout: 5000 }).catch(() => {});

    const draftAfterSubmit = await page.evaluate((key) => localStorage.getItem(key), RA_DRAFT_KEY);
    assert.strictEqual(draftAfterSubmit, null, 'a successful submit must clear the draft');

    // The next assessment must start empty: no leftover resume prompt.
    await page.goto(PAGE_URL);
    await page.waitForTimeout(300);
    assert.strictEqual(await page.isVisible('.swal2-popup'), false);
    await page.waitForSelector('#raHeaderStep', { state: 'visible' });
  });

  await runTest('a localStorage failure does not break the wizard or block submitting', async () => {
    await fillHeader(page, { activity: 'Quota Exceeded Test' });

    const pageErrors = [];
    const onPageError = (err) => pageErrors.push(err.message);
    page.on('pageerror', onPageError);

    // Simulate private-browsing/quota-exceeded: only the draft key's writes
    // throw, so auth/session localStorage keys the rest of the app depends on
    // are untouched.
    await page.evaluate((key) => {
      window.__realSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return window.__realSetItem.call(this, k, v);
      };
    }, RA_DRAFT_KEY);

    await page.click('.ra-task-open');
    await page.waitForSelector('.ra-task-screen');
    await page.fill('.ra-task-name-input', 'Loading Dock Setup');
    await page.click('#raAddHazard');
    await page.waitForSelector('.ra-hazard-screen');
    await page.fill('.ra-hazard-text', 'Forklift near pedestrians');
    await page.fill('.ra-person', 'Warehouse staff');
    await page.click('#raAddControl');
    await page.fill('.ra-control-text[data-control-index="0"]', 'Marshalled pedestrian routes');

    // Let the debounce timer fire and attempt (and fail) to save.
    await page.waitForTimeout(2200);

    assert.deepStrictEqual(pageErrors, [],
      `a failed draft save must never throw up to the page, got: ${pageErrors.join('; ')}`);

    // The wizard must still work end to end despite every draft save failing.
    await page.click('#raConfirmHazard');
    await page.waitForSelector('.ra-task-screen');
    await page.click('#raConfirmTask');
    await page.waitForSelector('.ra-list-screen');
    await page.click('#raReviewBtn');
    await page.waitForSelector('.ra-review-screen');

    const [request] = await Promise.all([
      page.waitForRequest('**/api/RiskAssessment/saveRiskAssessment'),
      page.click('#raSubmit'),
    ]);
    const body = JSON.parse(request.postData());
    assert.strictEqual(body.tasks[0].hazards[0].hazardText, 'Forklift near pedestrians',
      'submitting must still work with a permanently failing draft save');

    assert.deepStrictEqual(pageErrors, [], 'submit itself must not have thrown either');
    page.off('pageerror', onPageError);
  });

  console.log('\nReport detail view (reportDetails.html) — reading back a saved nested assessment');

  // v2's fetchTaskDetails response for a Risk Assessment: riskAssessmentData
  // is now an object (activity/typeOfActivity/location/eventActivities plus
  // tasks[].hazards[].controls[]), not the v1 flat TaskName/Hazard/Rating
  // list, and ratings/categories arrive pre-computed from the server — the
  // page must render them, not recompute. See Pages/reportDeatails/
  // reportDetails.html's riskAssessmentData branch.
  const DETAILS_URL = `${BASE_URL}/Pages/reportDeatails/reportDetails.html?id=501&entity=RiskAssessment`;

  function control(id, sortOrder, controlText) {
    return { id, sortOrder, controlText };
  }

  function hazard(overrides) {
    return Object.assign({
      id: 1, sortOrder: 1, hazardText: 'Hazard', actOrCondition: 'Condition',
      personAtRisk: 'BA',
      baseSeverity: 6, baseProbability: 6, baseRating: 36, baseCategory: 'H',
      residualSeverity: 6, residualProbability: 2, residualRating: 12, residualCategory: 'M',
      controls: [],
    }, overrides);
  }

  const NESTED_FIXTURE = {
    formName: 'Risk Assessment',
    location: 'Site HQ',
    department: 'Field Sales',
    area: 'North Zone',
    status: 'Approved',
    createdDate: '2026-08-20T09:30:00Z',
    reportedBy: 'Mohsin Ali',
    riskAssessmentData: {
      activity: 'Lux Instore BA Deployment',
      typeOfActivity: 'Promotional',
      location: 'KLI - Gate 3',
      eventActivities: 'BA deployment for Lux instore promotion',
      tasks: [
        {
          id: 1, sortOrder: 1, taskName: 'Travel to Store',
          hazards: [
            hazard({
              id: 1, sortOrder: 1, hazardText: 'Road traffic accident', actOrCondition: 'Condition',
              personAtRisk: 'BA',
              baseSeverity: 6, baseProbability: 6, baseRating: 36, baseCategory: 'H',
              residualSeverity: 6, residualProbability: 2, residualRating: 12, residualCategory: 'M',
              controls: [control(1, 1, 'Online taxi service')],
            }),
            hazard({
              id: 2, sortOrder: 2, hazardText: 'Heat exhaustion', actOrCondition: 'Condition',
              personAtRisk: 'BA',
              baseSeverity: 4, baseProbability: 4, baseRating: 16, baseCategory: 'M',
              residualSeverity: 4, residualProbability: 2, residualRating: 8, residualCategory: 'L',
              controls: [], // no controls logged — must not break rendering
            }),
          ],
        },
        {
          id: 2, sortOrder: 2, taskName: 'Instore Setup',
          hazards: [
            hazard({
              id: 3, sortOrder: 1, hazardText: 'Manual handling injury', actOrCondition: 'Act',
              personAtRisk: 'BA, Store staff',
              baseSeverity: 4, baseProbability: 6, baseRating: 24, baseCategory: 'M+',
              residualSeverity: 4, residualProbability: 2, residualRating: 8, residualCategory: 'L',
              controls: [
                control(2, 1, 'Two-person lift for boxes over 15kg'),
                control(3, 2, 'Trolley provided'),
              ],
            }),
          ],
        },
      ],
    },
  };

  async function gotoDetails(page, payload) {
    await page.route('**/api/ChangeForm/fetchTaskDetails**', route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) }));
    await page.goto(DETAILS_URL);
    await setupAuth(page); // page must carry a session before the fetch fires
    await page.goto(DETAILS_URL);
    await page.waitForSelector('#detailsDiv .rd-ra-task, #detailsDiv .dropContent', { state: 'attached' });
    await page.unroute('**/api/ChangeForm/fetchTaskDetails**');
  }

  await runTest('renders tasks, hazards and controls in order, correctly nested', async () => {
    await gotoDetails(page, NESTED_FIXTURE);

    const result = await page.evaluate(() => {
      const taskEls = Array.from(document.querySelectorAll('#detailsDiv .rd-ra-task'));
      return taskEls.map(taskEl => ({
        taskName: taskEl.querySelector('.rd-ra-taskname').textContent.trim(),
        hazards: Array.from(taskEl.querySelectorAll('.rd-ra-hazard')).map(hazardEl => ({
          text: hazardEl.querySelector('.rd-ra-hazard-text').textContent.trim(),
          controls: Array.from(hazardEl.querySelectorAll('.rd-ra-controls li')).map(li => li.textContent.trim()),
        })),
      }));
    });

    assert.strictEqual(result.length, 2, 'both tasks must render');
    assert.strictEqual(result[0].taskName, 'Travel to Store');
    assert.strictEqual(result[1].taskName, 'Instore Setup');

    assert.strictEqual(result[0].hazards.length, 2, 'task 1 must nest exactly its own two hazards');
    assert.strictEqual(result[0].hazards[0].text, 'Road traffic accident');
    assert.deepStrictEqual(result[0].hazards[0].controls, ['Online taxi service']);
    assert.strictEqual(result[0].hazards[1].text, 'Heat exhaustion');

    assert.strictEqual(result[1].hazards.length, 1, 'task 2 must not pick up task 1\'s hazards');
    assert.strictEqual(result[1].hazards[0].text, 'Manual handling injury');
    assert.deepStrictEqual(result[1].hazards[0].controls,
      ['Two-person lift for boxes over 15kg', 'Trolley provided'],
      'controls must render in sortOrder');
  });

  await runTest('header shows activity, type of activity, location, event activities, status and who filed it', async () => {
    await gotoDetails(page, NESTED_FIXTURE);

    const bodyText = await page.textContent('#detailsDiv');
    assert.ok(bodyText.includes('Lux Instore BA Deployment'), 'activity must appear');
    assert.ok(bodyText.includes('Promotional'), 'type of activity must appear');
    assert.ok(bodyText.includes('KLI - Gate 3'), 'the activity location must appear');
    assert.ok(bodyText.includes('BA deployment for Lux instore promotion'), 'event activities must appear');
    assert.ok(bodyText.includes('Approved'), 'status must appear');
    assert.ok(bodyText.includes('Mohsin Ali'), 'reportedBy must appear');
  });

  await runTest('both base and residual categories appear for a hazard, with a visible drop indicator', async () => {
    await gotoDetails(page, NESTED_FIXTURE);

    const first = await page.evaluate(() => {
      const hazardEl = document.querySelector('#detailsDiv .rd-ra-hazard');
      return {
        base: hazardEl.querySelector('.rd-ra-base-category').textContent.trim(),
        residual: hazardEl.querySelector('.rd-ra-residual-category').textContent.trim(),
        arrowClass: hazardEl.querySelector('.rd-ra-risk-arrow').className,
      };
    });

    // Fixture's first hazard goes H (base) -> M (residual): a real improvement.
    assert.strictEqual(first.base, 'H');
    assert.strictEqual(first.residual, 'M');
    assert.notStrictEqual(first.base, first.residual, 'base and residual categories must be independently visible');
    assert.ok(first.arrowClass.includes('rd-ra-trend-down'),
      'an improved residual category must be flagged distinctly from the base, not just printed as two equal chips');
  });

  await runTest('a hazard with no controls renders sensibly rather than breaking', async () => {
    await gotoDetails(page, NESTED_FIXTURE);

    const result = await page.evaluate(() => {
      const taskEls = Array.from(document.querySelectorAll('#detailsDiv .rd-ra-task'));
      const hazardEl = taskEls[0].querySelectorAll('.rd-ra-hazard')[1]; // "Heat exhaustion", zero controls
      return {
        hazardText: hazardEl.querySelector('.rd-ra-hazard-text').textContent.trim(),
        hasControlsList: !!hazardEl.querySelector('.rd-ra-controls'),
        noControlsText: hazardEl.querySelector('.rd-ra-no-controls') ? hazardEl.querySelector('.rd-ra-no-controls').textContent.trim() : null,
        baseCategory: hazardEl.querySelector('.rd-ra-base-category').textContent.trim(),
        residualCategory: hazardEl.querySelector('.rd-ra-residual-category').textContent.trim(),
      };
    });

    assert.strictEqual(result.hazardText, 'Heat exhaustion');
    assert.strictEqual(result.hasControlsList, false, 'no <ul> should render when there are no controls');
    assert.ok(result.noControlsText, 'a "no controls" message must render instead');
    assert.ok(/no controls/i.test(result.noControlsText));
    // The rest of the hazard (its own scores) must still render fully.
    assert.strictEqual(result.baseCategory, 'M');
    assert.strictEqual(result.residualCategory, 'L');
  });

  await runTest('a task with zero hazards renders sensibly rather than breaking', async () => {
    const fixture = JSON.parse(JSON.stringify(NESTED_FIXTURE));
    fixture.riskAssessmentData.tasks.push({ id: 3, sortOrder: 3, taskName: 'Pack Down', hazards: [] });
    await gotoDetails(page, fixture);

    const result = await page.evaluate(() => {
      const taskEls = Array.from(document.querySelectorAll('#detailsDiv .rd-ra-task'));
      const lastTask = taskEls[taskEls.length - 1];
      return {
        taskName: lastTask.querySelector('.rd-ra-taskname').textContent.trim(),
        hazardCount: lastTask.querySelectorAll('.rd-ra-hazard').length,
        hasEmptyHint: !!lastTask.querySelector('.rd-ra-empty-hint'),
      };
    });

    assert.strictEqual(result.taskName, 'Pack Down');
    assert.strictEqual(result.hazardCount, 0);
    assert.ok(result.hasEmptyHint, 'an empty task must say so rather than rendering nothing');
  });

  await runTest('free text with angle brackets and a double quote renders as visible text, never as markup', async () => {
    const fixture = {
      formName: 'Risk Assessment',
      status: 'Pending',
      createdDate: '2026-08-20T09:30:00Z',
      reportedBy: MALICIOUS,
      riskAssessmentData: {
        activity: MALICIOUS,
        typeOfActivity: MALICIOUS,
        location: MALICIOUS,
        eventActivities: MALICIOUS,
        tasks: [{
          id: 1, sortOrder: 1, taskName: MALICIOUS,
          hazards: [
            hazard({
              id: 1, sortOrder: 1, hazardText: MALICIOUS, actOrCondition: 'Condition',
              personAtRisk: MALICIOUS,
              baseCategory: 'H', residualCategory: 'M',
              controls: [control(1, 1, MALICIOUS)],
            }),
          ],
        }],
      },
    };
    await gotoDetails(page, fixture);

    const result = await page.evaluate(() => {
      const taskEl = document.querySelector('#detailsDiv .rd-ra-task');
      const hazardEl = document.querySelector('#detailsDiv .rd-ra-hazard');
      return {
        taskName: taskEl.querySelector('.rd-ra-taskname').textContent,
        hazardText: hazardEl.querySelector('.rd-ra-hazard-text').textContent,
        controlText: hazardEl.querySelector('.rd-ra-controls li').textContent,
        imgCount: document.querySelectorAll('#detailsDiv img').length,
        scriptCount: document.querySelectorAll('#detailsDiv script').length,
        taskCount: document.querySelectorAll('#detailsDiv .rd-ra-task').length,
        hazardCount: document.querySelectorAll('#detailsDiv .rd-ra-hazard').length,
      };
    });

    assert.strictEqual(result.taskName, MALICIOUS, 'raw task name must come back as plain text');
    assert.strictEqual(result.hazardText, MALICIOUS, 'raw hazard text must come back as plain text');
    assert.strictEqual(result.controlText, MALICIOUS, 'raw control text must come back as plain text');
    assert.strictEqual(result.imgCount, 0, 'the onerror payload must not have created an <img> element');
    assert.strictEqual(result.scriptCount, 0, 'nothing must have injected a <script> element');
    assert.strictEqual(result.taskCount, 1, 'nothing extra injected');
    assert.strictEqual(result.hazardCount, 1, 'nothing extra injected');

    const bodyText = await page.textContent('#detailsDiv');
    assert.ok(bodyText.includes(MALICIOUS), 'the header fields must also render the raw text, not stripped or broken');
  });

  await browser.close();

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
