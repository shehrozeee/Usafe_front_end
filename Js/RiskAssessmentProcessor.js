// Drives the v2 risk assessment wizard: header page, then a self-built
// task -> hazard -> control tree (unlimited at every level), then review +
// optional photos + submit. There is no template picker and no Skip any
// more — with a user-built list there is nothing to skip, the assessor
// simply does not add what did not happen.
//
// Structured as three "screens" under one mount point (#raScreen) rather
// than a single long form, because the source data is three levels deep and
// no phone screen can show all three at once without turning into the very
// 20-column spreadsheet this feature replaces:
//   list  -> every task, collapsed, with a worst-category chip and a count
//   task  -> one task's name + its hazards, collapsed
//   hazard -> one hazard's full scoring form + its controls
// review is a fourth, flat screen reached from the list once every task has
// at least one hazard.
//
// Declared with var, not const: a top-level const does not become a property
// of window, and the tests reach this through window.riskAssessmentState.
var riskAssessmentState = {
  header: { activity: '', typeOfActivity: '', location: '', eventActivities: '', department: '', area: '' },
  // Hardcoded fallback so the scoring selects are never empty even if
  // getRiskScale is slow to answer - overwritten as soon as it does. Must
  // match Controllers/api/RiskAssessmentController.cs's SeverityScale /
  // ProbabilityScale; the server is still the source of truth for the
  // labels, this is only a placeholder while that request is in flight.
  scale: {
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
  },
  tasks: [],
  // Which of the three builder screens is showing, and which task/hazard it
  // is showing. taskIndex/hazardIndex are null on the list screen.
  nav: { screen: 'list', taskIndex: null, hazardIndex: null },
  // Photos attach to the assessment as a whole, not per task or hazard - see
  // handlePhotoSelect / renderPhotoList. Each entry is { key, name }: key is
  // what uploadFiles returned (what gets sent back to saveRiskAssessment),
  // name is the original filename, kept for display only.
  photos: [],
};

function makeHazard() {
  return {
    hazardText: '',
    actOrCondition: 'Condition',
    personAtRisk: '',
    baseSeverity: 2,
    baseProbability: 2,
    controls: [],
    residualSeverity: 2,
    residualProbability: 2,
  };
}

function makeTask() {
  return { taskName: '', hazards: [] };
}

function currentTask() {
  return riskAssessmentState.tasks[riskAssessmentState.nav.taskIndex];
}

function currentHazard() {
  const task = currentTask();
  return task ? task.hazards[riskAssessmentState.nav.hazardIndex] : undefined;
}

/** Counts hazards per category, base against residual - the hazard is the scoring unit in v2, not the task. */
function buildRiskSummary(tasks) {
  const empty = () => ({ 'VL': 0, 'L': 0, 'M': 0, 'M+': 0, 'H': 0, 'VH': 0 });
  const summary = { base: empty(), residual: empty() };

  tasks.forEach(function (task) {
    task.hazards.forEach(function (hazard) {
      const base = evaluateRisk(hazard.baseSeverity, hazard.baseProbability);
      const residual = evaluateRisk(hazard.residualSeverity, hazard.residualProbability);
      if (base) summary.base[base.category]++;
      if (residual) summary.residual[residual.category]++;
    });
  });

  return summary;
}

// ── Navigation ─────────────────────────────────────────────────────────────

/**
 * Keeps the page-level subtitle (in the topbar area, outside #raScreen) in
 * sync with wherever render() just put the assessor - this is the "where am
 * I" signal that survives even if they scroll past the in-screen breadcrumb.
 * Uses .text() throughout, which sets textContent rather than parsing HTML,
 * so raw task/hazard names never need escapeHtml here.
 */
function updatePageSubtitle() {
  const nav = riskAssessmentState.nav;
  const tasks = riskAssessmentState.tasks;
  let subtitle = 'Tasks';

  if (nav.screen === 'list') {
    subtitle = 'Tasks';
  } else if (nav.screen === 'task') {
    const task = currentTask();
    subtitle = (task && task.taskName) ? task.taskName : `Task ${nav.taskIndex + 1}`;
  } else if (nav.screen === 'hazard') {
    // Not the hazard's own free text (which can run to a full sentence and
    // wrap awkwardly here) - the breadcrumb below already names the hazard
    // and the task it belongs to. This line's job is just "how far along am
    // I in this task's hazard list".
    const task = currentTask();
    const hazardTotal = task ? task.hazards.length : 0;
    subtitle = `Hazard ${nav.hazardIndex + 1} of ${hazardTotal}`;
  } else if (nav.screen === 'review') {
    subtitle = 'Review & submit';
  }
  $('#raPageSubtitle').text(subtitle);

  let progress = '';
  if (tasks && tasks.length && nav.screen !== 'review') {
    const hazardCount = tasks.reduce((sum, t) => sum + t.hazards.length, 0);
    progress = `${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${hazardCount} hazard${hazardCount === 1 ? '' : 's'}`;
  }
  $('#raProgressCount').text(progress);
}

function render() {
  const nav = riskAssessmentState.nav;

  if (nav.screen === 'list') {
    $('#raScreen').html(createListScreen(riskAssessmentState.tasks));
  } else if (nav.screen === 'task') {
    $('#raScreen').html(createTaskScreen(currentTask(), nav.taskIndex));
  } else if (nav.screen === 'hazard') {
    $('#raScreen').html(createHazardScreen(
      currentTask(), currentHazard(), nav.taskIndex, nav.hazardIndex, riskAssessmentState.scale));
  } else if (nav.screen === 'review') {
    renderReview();
  }
  updatePageSubtitle();
}

function goToList() {
  riskAssessmentState.nav = { screen: 'list', taskIndex: null, hazardIndex: null };
  $('#raError').text('');
  render();
}

function goToTask(index) {
  riskAssessmentState.nav = { screen: 'task', taskIndex: index, hazardIndex: null };
  render();
}

function goToHazard(taskIndex, hazardIndex) {
  riskAssessmentState.nav = { screen: 'hazard', taskIndex: taskIndex, hazardIndex: hazardIndex };
  render();
}

/**
 * Mirrors the server's own rejection rules (RiskAssessmentController.
 * SaveRiskAssessment) so the assessor sees the problem before submitting
 * rather than after a 400: no tasks at all, or a task with no hazards, named.
 * A hazard with no controls is deliberately NOT checked here - that is an
 * accepted, legitimate finding on the server, not an error.
 */
function tryGoToReview() {
  if (!riskAssessmentState.tasks.length) {
    $('#raError').text('Add at least one task before submitting.');
    return;
  }

  const emptyIndex = riskAssessmentState.tasks.findIndex(t => t.hazards.length === 0);
  if (emptyIndex !== -1) {
    const task = riskAssessmentState.tasks[emptyIndex];
    const label = task.taskName ? `"${escapeHtml(task.taskName)}"` : `${emptyIndex + 1}`;
    $('#raError').text(`Task ${label} needs at least one hazard before you can submit.`);
    return;
  }

  $('#raError').text('');
  riskAssessmentState.nav = { screen: 'review', taskIndex: null, hazardIndex: null };
  render();
}

// ── Add / remove ─────────────────────────────────────────────────────────

function addTask() {
  riskAssessmentState.tasks.push(makeTask());
  // Jump straight into the new task rather than leaving it collapsed on the
  // list - there is nothing useful to look at on a task with no hazards yet.
  goToTask(riskAssessmentState.tasks.length - 1);
}

function removeTask(index) {
  riskAssessmentState.tasks.splice(index, 1);
  goToList();
}

/**
 * Removing a task discards every hazard (and every hazard's controls) scored
 * under it — the single most destructive action in the wizard, so it is the
 * only removal gated behind an explicit confirm. Reuses the confirm-dialog
 * pattern already established in Components/tasks/index.js's
 * confirmTaskAction (Swal.fire, showCancelButton) rather than inventing a
 * second one, and reads its colours from the same CSS custom properties the
 * page already styles with instead of hardcoding hex here.
 */
function confirmRemoveTask(index) {
  const task = riskAssessmentState.tasks[index];
  const hazardCount = task ? task.hazards.length : 0;
  const text = hazardCount
    ? `This will also delete ${hazardCount} hazard${hazardCount === 1 ? '' : 's'} scored under this task. This cannot be undone.`
    : 'This cannot be undone.';
  const rootStyle = getComputedStyle(document.documentElement);

  Swal.fire({
    title: 'Remove this task?',
    text: text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Remove',
    cancelButtonText: 'Cancel',
    confirmButtonColor: rootStyle.getPropertyValue('--ra-danger').trim() || '#c62828',
    cancelButtonColor: rootStyle.getPropertyValue('--usafe-charcoal').trim() || '#2d2d2d',
  }).then(function (result) {
    if (result.isConfirmed) removeTask(index);
  });
}

function addHazard() {
  const task = currentTask();
  if (!task) return;
  task.hazards.push(makeHazard());
  goToHazard(riskAssessmentState.nav.taskIndex, task.hazards.length - 1);
}

function removeHazard(taskIndex, hazardIndex) {
  const task = riskAssessmentState.tasks[taskIndex];
  if (!task) return;
  task.hazards.splice(hazardIndex, 1);
  goToTask(taskIndex);
}

function addControl() {
  const hazard = currentHazard();
  if (!hazard) return;
  hazard.controls.push({ controlText: '' });
  render();
}

function removeControl(index) {
  const hazard = currentHazard();
  if (!hazard) return;
  hazard.controls.splice(index, 1);
  render();
}

// ── Live chip update on the hazard screen ───────────────────────────────
// Patches only the rating/category text rather than re-rendering the whole
// screen, so a select change never disturbs focus on the free-text fields
// around it.
/**
 * Repaints one category chip in place: text, background, text colour and the
 * warn/calm marker class, all driven by categoryChipStyle (Templates/
 * RiskAssessmentCard.js) so a live update never drifts from how the same chip
 * looks on first render.
 */
function paintCategoryChip($el, category) {
  const style = categoryChipStyle(category);
  $el.removeClass('ra-chip-warn ra-chip-safe ra-chip-alarm')
    .addClass(style.marker)
    .toggleClass('ra-chip-alarm', style.alarm)
    .css({ 'background-color': style.bg, color: style.color })
    .text(category || '-');
}

function updateHazardChips() {
  const base = evaluateRisk(
    parseInt($('.ra-base-severity').val(), 10), parseInt($('.ra-base-probability').val(), 10));
  $('.ra-base-rating').text(base ? base.rating : '-');
  paintCategoryChip($('.ra-base-category'), base ? base.category : null);

  const residual = evaluateRisk(
    parseInt($('.ra-residual-severity').val(), 10), parseInt($('.ra-residual-probability').val(), 10));
  $('.ra-residual-rating').text(residual ? residual.rating : '-');
  paintCategoryChip($('.ra-residual-category'), residual ? residual.category : null);
}

// ── Photos (review screen) ──────────────────────────────────────────────

function renderPhotoList() {
  $('#raPhotoList').html(riskAssessmentPhotoList(riskAssessmentState.photos));
}

/**
 * Uploads every file picked in one go. Mirrors the checklist wizard's
 * handleChecklistPhotoSelect (Js/GenericQuestioneerProcessor.js) - the server
 * endpoint is a deliberate mirror of api/checklist/uploadFiles. Goes through
 * sendRequestWithFiles rather than a bespoke $.ajax, so a failed upload runs
 * through the shared handleRequestError (session-expiry handling, the error
 * dialog, server-side logging) instead of a second, local error path - and
 * critically, the failure never adds anything to riskAssessmentState.photos,
 * so a failed upload cannot end up silently submitted as if it succeeded.
 */
function handlePhotoSelect(input) {
  const files = input.files;
  if (!files || !files.length) return;

  const names = Array.from(files).map(f => f.name);
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  $('#raPhotoStatus').removeClass('text-danger').text(`Uploading ${files.length} photo(s)...`);
  // Disabled for the duration of the upload so a submit cannot go out while
  // the keys it would need are still in flight.
  $('#raSubmit').prop('disabled', true);

  sendRequestWithFiles('api/RiskAssessment/uploadFiles', 'POST', formData, function (result) {
    $('#raSubmit').prop('disabled', false);

    if (result && result.status === 200 && result.urls) {
      result.urls.forEach(function (key, i) {
        riskAssessmentState.photos.push({ key: key, name: names[i] || key });
      });
      $('#raPhotoStatus').text(`${riskAssessmentState.photos.length} photo(s) attached`);
      renderPhotoList();
    } else {
      // Not an HTTP failure (that goes through handleRequestError below) -
      // the server answered 200 without the shape we expect. Say so and
      // leave riskAssessmentState.photos untouched.
      $('#raPhotoStatus').addClass('text-danger').text('Upload failed - photos were not attached.');
    }
  });

  // Reset the input so re-picking the same file(s) still fires change.
  input.value = '';
}

// ── Review + submit ──────────────────────────────────────────────────────

function renderReview() {
  const summary = buildRiskSummary(riskAssessmentState.tasks);
  $('#raScreen').html(createReviewScreen(
    riskAssessmentState.header, riskAssessmentState.tasks, summary, riskAssessmentState.photos));
}

function submitRiskAssessment() {
  const payload = {
    activity: riskAssessmentState.header.activity,
    typeOfActivity: riskAssessmentState.header.typeOfActivity,
    location: riskAssessmentState.header.location,
    eventActivities: riskAssessmentState.header.eventActivities,
    department: riskAssessmentState.header.department,
    area: riskAssessmentState.header.area,
    // The backend parses this with int.TryParse - a number fails to bind.
    siteId: String(getValue('siteId') || '0'),
    // Ignored server-side (identity comes from the token), kept for the
    // audit trail / debugging, same idea as v1.
    reportedBy: getValue('userName'),
    tasks: riskAssessmentState.tasks.map(function (task, taskIndex) {
      return {
        sortOrder: taskIndex + 1,
        taskName: task.taskName,
        hazards: task.hazards.map(function (hazard, hazardIndex) {
          return {
            sortOrder: hazardIndex + 1,
            hazardText: hazard.hazardText,
            actOrCondition: hazard.actOrCondition,
            personAtRisk: hazard.personAtRisk,
            baseSeverity: hazard.baseSeverity,
            baseProbability: hazard.baseProbability,
            residualSeverity: hazard.residualSeverity,
            residualProbability: hazard.residualProbability,
            // Ratings/categories are NOT sent - the server recomputes both
            // from RiskMatrix and ignores anything the client sends for them.
            controls: hazard.controls.map(function (control, controlIndex) {
              return { sortOrder: controlIndex + 1, controlText: control.controlText };
            }),
          };
        }),
      };
    }),
  };

  // Only sent when there is at least one photo - RiskAssessment.Files is a
  // JSON string, and an empty/absent field reads more cleanly on the server
  // than a stringified empty array would ("[]" is still a value; omitting
  // the key is not).
  if (riskAssessmentState.photos.length) {
    payload.files = JSON.stringify(riskAssessmentState.photos.map(p => p.key));
  }

  // sendRequest sets contentType application/json, so the body has to be a
  // string - handing jQuery an object here form-encodes it and the API sees
  // nothing. Errors go to the shared handleRequestError, same as every other page.
  sendRequest('api/RiskAssessment/saveRiskAssessment', 'POST', JSON.stringify(payload),
    function () { window.location.href = '/Pages/reporting/reporting.html'; });
}

// ── Header gate ──────────────────────────────────────────────────────────

function confirmHeader() {
  const activity = $('#raActivity').val().trim();
  if (!activity) {
    $('#raError').text('Enter the activity before continuing.');
    // markFieldError/clearFieldError (Helpers/Validation.js, shared and
    // unchanged) give the same red-border-plus-shake feedback every other
    // form page uses for a required field, on top of the text error below.
    markFieldError(document.getElementById('raActivity'), 'Enter the activity before continuing.');
    return;
  }
  clearFieldError(document.getElementById('raActivity'));

  riskAssessmentState.header.activity = activity;
  riskAssessmentState.header.typeOfActivity = $('#raTypeOfActivity').val().trim();
  riskAssessmentState.header.location = $('#raLocation').val().trim();
  riskAssessmentState.header.eventActivities = $('#raEventActivities').val().trim();
  riskAssessmentState.header.department = $('#raDepartment').val().trim();
  riskAssessmentState.header.area = $('#raArea').val().trim();

  $('#raError').text('');
  $('#raHeaderStep').hide();
  $('#raScreen').show();
  riskAssessmentState.tasks = [makeTask()];
  goToList();
}

$(function () {
  // The scale values ({1,2,4,6,8,10}) never change, only their labels can -
  // the hardcoded default above keeps the selects populated immediately;
  // this just refreshes the labels from the server, which is the source of
  // truth for them (see Controllers/api/RiskAssessmentController.cs).
  sendRequest('api/RiskAssessment/getRiskScale', 'GET', null, function (scale) {
    if (scale && scale.severity && scale.probability) {
      riskAssessmentState.scale = scale;
    }
  });

  // ── List screen ──
  $('#riskAssessmentRoot').on('click', '.ra-task-open', function () {
    goToTask(parseInt($(this).data('task-index'), 10));
  });
  $('#riskAssessmentRoot').on('click', '.ra-task-remove', function (e) {
    e.stopPropagation();
    removeTask(parseInt($(this).data('task-index'), 10));
  });
  $('#riskAssessmentRoot').on('click', '#raAddTask', addTask);
  $('#riskAssessmentRoot').on('click', '#raReviewBtn', tryGoToReview);

  // ── Task screen ──
  $('#riskAssessmentRoot').on('click', '#raBackToList', goToList);
  // The hazard screen's breadcrumb root crumb ("Tasks") - a one-tap jump back
  // to the very top of the hierarchy from three levels deep, distinct from
  // #raBackToTask which only goes up one level.
  $('#riskAssessmentRoot').on('click', '#raCrumbList', goToList);
  $('#riskAssessmentRoot').on('input', '.ra-task-name-input', function () {
    const task = currentTask();
    if (task) task.taskName = $(this).val();
  });
  $('#riskAssessmentRoot').on('click', '.ra-hazard-open', function () {
    goToHazard(riskAssessmentState.nav.taskIndex, parseInt($(this).data('hazard-index'), 10));
  });
  $('#riskAssessmentRoot').on('click', '.ra-hazard-remove', function (e) {
    e.stopPropagation();
    removeHazard(riskAssessmentState.nav.taskIndex, parseInt($(this).data('hazard-index'), 10));
  });
  $('#riskAssessmentRoot').on('click', '#raAddHazard', addHazard);
  // The dominant bottom action on the task screen: confirms the task and
  // returns to the list, where Review & Submit lives - identical to the
  // breadcrumb's #raBackToList, kept as a separate id because it is a
  // distinct, always-visible affordance (see .ra-sticky-footer), not a
  // second way to trigger the same handler by coincidence.
  $('#riskAssessmentRoot').on('click', '#raConfirmTask', goToList);
  $('#riskAssessmentRoot').on('click', '#raRemoveTask', function () {
    confirmRemoveTask(riskAssessmentState.nav.taskIndex);
  });

  // ── Hazard screen ──
  $('#riskAssessmentRoot').on('click', '#raBackToTask', function () {
    goToTask(riskAssessmentState.nav.taskIndex);
  });
  // The dominant bottom action on the hazard screen: confirms the hazard and
  // returns to the task it belongs to - identical to the breadcrumb's
  // #raBackToTask above, same reasoning as #raConfirmTask.
  $('#riskAssessmentRoot').on('click', '#raConfirmHazard', function () {
    goToTask(riskAssessmentState.nav.taskIndex);
  });
  $('#riskAssessmentRoot').on('input', '.ra-hazard-text', function () {
    const hazard = currentHazard();
    if (hazard) hazard.hazardText = $(this).val();
  });
  $('#riskAssessmentRoot').on('click', '.ra-toggle-btn', function () {
    const hazard = currentHazard();
    if (!hazard) return;
    hazard.actOrCondition = $(this).data('value');
    $(this).addClass('active').siblings('.ra-toggle-btn').removeClass('active');
  });
  $('#riskAssessmentRoot').on('input', '.ra-person', function () {
    const hazard = currentHazard();
    if (hazard) hazard.personAtRisk = $(this).val();
  });
  $('#riskAssessmentRoot').on('change',
    '.ra-base-severity, .ra-base-probability, .ra-residual-severity, .ra-residual-probability',
    function () {
      const hazard = currentHazard();
      if (hazard) {
        hazard.baseSeverity = parseInt($('.ra-base-severity').val(), 10);
        hazard.baseProbability = parseInt($('.ra-base-probability').val(), 10);
        hazard.residualSeverity = parseInt($('.ra-residual-severity').val(), 10);
        hazard.residualProbability = parseInt($('.ra-residual-probability').val(), 10);
      }
      updateHazardChips();
    });
  $('#riskAssessmentRoot').on('click', '#raAddControl', addControl);
  $('#riskAssessmentRoot').on('click', '.ra-control-remove', function () {
    removeControl(parseInt($(this).data('control-index'), 10));
  });
  $('#riskAssessmentRoot').on('input', '.ra-control-text', function () {
    const hazard = currentHazard();
    if (!hazard) return;
    const index = parseInt($(this).data('control-index'), 10);
    if (hazard.controls[index]) hazard.controls[index].controlText = $(this).val();
  });
  $('#riskAssessmentRoot').on('click', '#raRemoveHazard', function () {
    removeHazard(riskAssessmentState.nav.taskIndex, riskAssessmentState.nav.hazardIndex);
  });

  // ── Review screen ──
  $('#riskAssessmentRoot').on('click', '#raBackToBuilder', goToList);
  $('#riskAssessmentRoot').on('click', '#raSubmit', submitRiskAssessment);
  $('#riskAssessmentRoot').on('click', '#raPhotoAdd', () => $('#raPhotoInput').trigger('click'));
  $('#riskAssessmentRoot').on('change', '#raPhotoInput', function () { handlePhotoSelect(this); });
  $('#riskAssessmentRoot').on('click', '.ra-photo-remove', function () {
    const index = parseInt($(this).data('index'), 10);
    riskAssessmentState.photos.splice(index, 1);
    renderPhotoList();
  });

  // A failed upload must never leave the assessor stuck. sendRequestWithFiles
  // (Helpers/HttpHandler.js - shared with every other page, not ours to
  // change) has no complete/always hook of its own; every failure routes to
  // the shared handleRequestError, which re-enables every button on the page
  // and puts up its own error dialog - but it knows nothing about this
  // page's own "Uploading..." status text, which would otherwise sit there
  // forever. jQuery fires ajaxComplete for every request, success or
  // failure, unless the caller passes global:false (sendRequestWithFiles
  // does not), so that is the one hook available here without touching the
  // shared helper. Scoped to the upload endpoint by URL so it never reacts
  // to anything else.
  $(document).on('ajaxComplete.raPhotoUpload', function (event, xhr, settings) {
    if (!settings || (settings.url || '').indexOf('api/RiskAssessment/uploadFiles') === -1) return;
    if (xhr.status >= 200 && xhr.status < 300) return; // the success callback above already handled this

    // By the time this runs, handleRequestError has already re-enabled every
    // button and shown its own dialog - riskAssessmentState.tasks was never
    // touched by the failed upload, so the assessment itself is untouched.
    $('#raSubmit').prop('disabled', false);
    $('#raPhotoStatus').addClass('text-danger')
      .text('Photo upload failed. Your answers are safe - retry, or Submit without this photo.');
  });

  $('#raHeaderNext').on('click', confirmHeader);
});
