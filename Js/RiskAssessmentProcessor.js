// Drives the risk assessment wizard: template pick, event header, one task card
// at a time, review, submit. Structured after Js/GenericQuestioneerProcessor.js
// so the two read alike.

// Declared with var, not const: a top-level const does not become a property of
// window, and the tests reach this through window.riskAssessmentState.
var riskAssessmentState = {
  formId: null,
  formName: '',
  header: {},
  scale: { severity: [], probability: [] },
  tasks: [],
  index: 0,
};

function currentTask() {
  return riskAssessmentState.tasks[riskAssessmentState.index];
}

/** Counts tasks per category, base against residual. Skipped tasks are excluded. */
function buildRiskSummary(tasks) {
  const empty = () => ({ 'VL': 0, 'L': 0, 'M': 0, 'M+': 0, 'H': 0, 'VH': 0 });
  const summary = { base: empty(), residual: empty() };

  tasks.filter(t => !t.skipped).forEach(function (task) {
    const base = evaluateRisk(task.baseSeverity, task.baseProbability);
    const residual = evaluateRisk(task.residualSeverity, task.residualProbability);
    if (base) summary.base[base.category]++;
    if (residual) summary.residual[residual.category]++;
  });

  return summary;
}

function refreshChips() {
  const task = currentTask();

  const base = evaluateRisk(task.baseSeverity, task.baseProbability);
  $('.ra-base-rating').text(base ? base.rating : '-');
  $('#raBaseCategory')
    .text(base ? base.category : '-')
    .css('background-color', base ? RISK_CATEGORY_COLOUR[base.category] : 'transparent');

  const residual = evaluateRisk(task.residualSeverity, task.residualProbability);
  $('.ra-residual-rating').text(residual ? residual.rating : '-');
  $('#raResidualCategory')
    .text(residual ? residual.category : '-')
    .css('background-color', residual ? RISK_CATEGORY_COLOUR[residual.category] : 'transparent');
}

/** Copies the visible card back into state. Called before any navigation. */
function captureCard() {
  const task = currentTask();
  if (!task) return;

  task.actOrCondition = $('.ra-actcond').val();
  task.personAtRisk = $('.ra-person').val();
  task.baseSeverity = parseInt($('.ra-base-severity').val(), 10);
  task.baseProbability = parseInt($('.ra-base-probability').val(), 10);
  task.additionalControl = $('.ra-control').val();
  task.residualSeverity = parseInt($('.ra-residual-severity').val(), 10);
  task.residualProbability = parseInt($('.ra-residual-probability').val(), 10);
}

function renderCard() {
  const state = riskAssessmentState;
  $('#riskAssessmentCard').html(
    createRiskAssessmentCard(currentTask(), state.index, state.tasks.length, state.scale));

  $('#raBack').prop('disabled', state.index === 0);
  $('#raNext').prop('disabled', state.index === state.tasks.length - 1);
  refreshChips();
}

function goTo(index) {
  captureCard();
  riskAssessmentState.index = Math.max(0, Math.min(index, riskAssessmentState.tasks.length - 1));
  renderCard();
}

function addTask() {
  captureCard();
  riskAssessmentState.tasks.push({
    riskAssessmentRowId: null,   // marks a task added on site, not planned
    sortOrder: riskAssessmentState.tasks.length + 1,
    taskName: '',
    hazard: '',
    actOrCondition: 'Condition',
    personAtRisk: '',
    hazardDescription: '',
    baseSeverity: 2,
    baseProbability: 2,
    additionalControl: '',
    residualSeverity: 2,
    residualProbability: 2,
    skipped: false,
  });
  riskAssessmentState.index = riskAssessmentState.tasks.length - 1;
  renderCard();
}

function renderReview() {
  captureCard();
  const summary = buildRiskSummary(riskAssessmentState.tasks);
  const categories = ['VL', 'L', 'M', 'M+', 'H', 'VH'];

  const headerCells = categories.map(c => `<th>${c}</th>`).join('');
  const baseCells = categories.map(c => `<td>${summary.base[c]}</td>`).join('');
  const residualCells = categories.map(c => `<td>${summary.residual[c]}</td>`).join('');

  const rows = riskAssessmentState.tasks.map(function (task) {
    const base = evaluateRisk(task.baseSeverity, task.baseProbability);
    const residual = evaluateRisk(task.residualSeverity, task.residualProbability);
    const label = task.skipped
      ? '<span class="ra-skipped">Skipped</span>'
      : `${base ? base.category : '-'} &rarr; ${residual ? residual.category : '-'}`;
    return `<li><strong>${task.taskName || '(unnamed task)'}</strong> ${label}</li>`;
  }).join('');

  $('#riskAssessmentCard').hide();
  $('#raSummary').html(`
    <h3>Review</h3>
    <table class="table table-bordered ra-summary-table">
      <thead><tr><th></th>${headerCells}</tr></thead>
      <tbody>
        <tr><th>Base</th>${baseCells}</tr>
        <tr><th>Residual</th>${residualCells}</tr>
      </tbody>
    </table>
    <ul class="ra-review-list">${rows}</ul>
  `).show();

  $('#raSubmit').show();
}

function submitRiskAssessment() {
  captureCard();

  const named = riskAssessmentState.tasks.filter(t => t.taskName && t.taskName.trim() !== '');
  if (!named.length) {
    $('#raError').text('Add at least one task before submitting.');
    return;
  }

  const payload = {
    riskAssessmentFormId: riskAssessmentState.formId,
    formName: riskAssessmentState.formName,
    eventName: riskAssessmentState.header.eventName,
    location: riskAssessmentState.header.location,
    department: riskAssessmentState.header.department,
    area: riskAssessmentState.header.area,
    siteId: String(getValue('siteId') || '0'),
    // The signed-in user's email is stored under userName, not email.
    reportedBy: getValue('userName'),
    entries: named.map((task, position) => ({
      riskAssessmentRowId: task.riskAssessmentRowId,
      sortOrder: position + 1,
      taskName: task.taskName,
      hazard: task.hazard,
      actOrCondition: task.actOrCondition,
      personAtRisk: task.personAtRisk,
      hazardDescription: task.hazardDescription,
      baseSeverity: task.baseSeverity,
      baseProbability: task.baseProbability,
      additionalControl: task.additionalControl,
      residualSeverity: task.residualSeverity,
      residualProbability: task.residualProbability,
      skipped: !!task.skipped,
    })),
  };

  // sendRequest sets contentType application/json, so the body has to be a
  // string - handing jQuery an object here form-encodes it and the API sees
  // nothing. Errors go to the shared handleRequestError, same as every other page.
  sendRequest('api/RiskAssessment/saveRiskAssessment', 'POST', JSON.stringify(payload),
    function () { window.location.href = '/Pages/reporting/reporting.html'; });
}

function loadTemplate(formId) {
  sendRequest('api/RiskAssessment/getRiskScale', 'GET', null, function (scale) {
    riskAssessmentState.scale = scale;

    sendRequest(`api/RiskAssessment/getRiskAssessmentForm?formId=${formId}`, 'GET', null, function (form) {
      riskAssessmentState.formId = form.id;
      riskAssessmentState.formName = form.name;
      riskAssessmentState.header.location = form.location;
      riskAssessmentState.header.eventName = form.eventActivity;

      riskAssessmentState.tasks = form.rows.map(row => ({
        riskAssessmentRowId: row.id,
        sortOrder: row.sortOrder,
        taskName: row.taskName,
        hazard: row.hazard,
        actOrCondition: row.actOrCondition,
        personAtRisk: row.personAtRisk,
        hazardDescription: row.hazardDescription,
        baseSeverity: row.baseSeverity,
        baseProbability: row.baseProbability,
        additionalControl: row.suggestedAdditionalControl,
        residualSeverity: row.residualSeverity,
        residualProbability: row.residualProbability,
        skipped: false,
      }));

      renderCard();
    });
  });
}

$(function () {
  const params = new URLSearchParams(window.location.search);
  const formId = params.get('formId');

  if (formId) {
    loadTemplate(formId);
  } else {
    sendRequest('api/RiskAssessment/getRiskAssessmentForms', 'GET', null, function (forms) {
      $('#raTemplates').html(forms.map(form => `
        <button class="usafe-card" onclick="window.location.href='?formId=${form.id}'">
          <span class="usafe-card-title">${form.name}</span>
          <span class="ra-template-meta">${form.taskCount} tasks</span>
        </button>`).join(''));
    });
  }

  $('#riskAssessmentRoot')
    .on('change', '.ra-base-severity, .ra-base-probability, .ra-residual-severity, .ra-residual-probability',
      function () { captureCard(); refreshChips(); });

  $('#raNext').on('click', () => goTo(riskAssessmentState.index + 1));
  $('#raBack').on('click', () => goTo(riskAssessmentState.index - 1));
  $('#raSkip').on('click', function () {
    captureCard();
    currentTask().skipped = true;
    goTo(riskAssessmentState.index + 1);
  });
  $('#raAddTask').on('click', addTask);
  $('#raReview').on('click', renderReview);
  $('#raSubmit').on('click', submitRiskAssessment);
});
