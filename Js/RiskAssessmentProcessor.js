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
  if (!task) {
    $('.ra-base-rating, .ra-residual-rating').text('-');
    $('#raBaseCategory, #raResidualCategory').text('-').css('background-color', 'transparent');
    return;
  }

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

  // Only a task added on site renders these three as inputs (see
  // createRiskAssessmentCard) - a template-derived task keeps them as
  // read-only text, so there is nothing to read back for it.
  if (task.riskAssessmentRowId === null) {
    task.taskName = $('.ra-task-name-input').val() || '';
    task.hazard = $('.ra-hazard-input').val() || '';
    task.hazardDescription = $('.ra-hazard-description-input').val() || '';
  }

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
  const task = currentTask();

  $('#riskAssessmentCard').html(
    createRiskAssessmentCard(task, state.index, state.tasks.length, state.scale));

  // A template with zero rows (or every task removed) has no card to move
  // between - disable both, rather than let Back/Next throw on a missing task.
  $('#raBack').prop('disabled', !task || state.index === 0);
  $('#raNext').prop('disabled', !task || state.index === state.tasks.length - 1);
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
    return `<li><strong>${escapeHtml(task.taskName) || '(unnamed task)'}</strong> ${label}</li>`;
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

  if (!riskAssessmentState.tasks.length) {
    $('#raError').text('Add at least one task before submitting.');
    return;
  }

  // A task the assessor never named (and never marked Skip either) would
  // otherwise be silently dropped from the entries below - block the submit
  // and say exactly which task, instead of navigating away as though it saved.
  const unnamed = riskAssessmentState.tasks
    .map((task, position) => ({ task, position }))
    .filter(({ task }) => !task.skipped && (!task.taskName || task.taskName.trim() === ''));

  if (unnamed.length) {
    const positions = unnamed.map(({ position }) => position + 1).join(', ');
    $('#raError').text(`Task ${positions} needs a name before you can submit - fill it in or tap Skip.`);
    return;
  }

  $('#raError').text('');

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
    entries: riskAssessmentState.tasks.map((task, position) => ({
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

/**
 * Shown once between picking a template and the first task card. eventName
 * and location are prefilled from the template as a starting point, but the
 * template's location/name describe the plan, not necessarily what actually
 * happened - so both stay editable, and department/area (which the template
 * never carries) are captured here for the first time.
 */
function showHeaderStep() {
  $('#raError').text('');
  $('#raEventName').val(riskAssessmentState.header.eventName || '');
  $('#raLocation').val(riskAssessmentState.header.location || '');
  $('#raDepartment').val(riskAssessmentState.header.department || '');
  $('#raArea').val(riskAssessmentState.header.area || '');
  $('#raHeaderStep').show();
}

function confirmHeader() {
  const eventName = $('#raEventName').val().trim();
  if (!eventName) {
    $('#raError').text('Enter an event name before continuing.');
    return;
  }

  riskAssessmentState.header.eventName = eventName;
  riskAssessmentState.header.location = $('#raLocation').val().trim();
  riskAssessmentState.header.department = $('#raDepartment').val().trim();
  riskAssessmentState.header.area = $('#raArea').val().trim();

  $('#raError').text('');
  $('#raHeaderStep').hide();
  $('#riskAssessmentCard, .ra-nav, .ra-actions').show();
  renderCard();
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

      showHeaderStep();
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
          <span class="usafe-card-title">${escapeHtml(form.name)}</span>
          <span class="ra-template-meta">${escapeHtml(form.taskCount)} tasks</span>
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
    const task = currentTask();
    if (!task) return;
    task.skipped = true;

    // On the last card there is nowhere left to advance to card-wise - move
    // on to Review instead of re-rendering the same card with no visible
    // change. The skipped banner (see createRiskAssessmentCard) is what makes
    // the skip visible when this card is revisited via Back.
    if (riskAssessmentState.index === riskAssessmentState.tasks.length - 1) {
      renderReview();
    } else {
      goTo(riskAssessmentState.index + 1);
    }
  });
  $('#raAddTask').on('click', addTask);
  $('#raReview').on('click', renderReview);
  $('#raSubmit').on('click', submitRiskAssessment);
  $('#raHeaderNext').on('click', confirmHeader);
});
