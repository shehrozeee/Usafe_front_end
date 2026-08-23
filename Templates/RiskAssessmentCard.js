// Pure render functions for the v2 risk assessment builder: task list, one
// task's hazard list, one hazard's scoring form, and the final review. No
// state lives here — every function takes plain data and returns an HTML
// string. Js/RiskAssessmentProcessor.js owns riskAssessmentState and wires up
// events against the classes/ids these templates emit.

// No repo-wide HTML-escaping helper exists, so it is defined here (same as
// v1 — do not define a second copy). The builder has far more free text than
// v1 ever did (task name, hazard text, person at risk, every control line,
// all four header fields) and every one of those MUST be routed through this
// before landing in the HTML string, in element bodies and attribute values
// alike. Escape `&` first so the entities inserted for the other characters
// are not themselves re-escaped. Values this file generates itself (numeric
// scale values, the `selected`/`active` keywords, data-index attributes) are
// not user data and must NOT be passed through this.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Rank of severity, worst first, used only to pick a single "worst" chip to
// show on a collapsed task card that may carry several hazards.
var CATEGORY_ORDER = ['VL', 'L', 'M', 'M+', 'H', 'VH'];

function riskScaleOptions(options, selected) {
  return (options || []).map(function (option) {
    const isSelected = option.value === selected ? 'selected' : '';
    return `<option value="${option.value}" ${isSelected}>${option.value} - ${escapeHtml(option.label)}</option>`;
  }).join('');
}

/** category is a category string ('VL'..'VH') or null/falsy for "not yet scored". */
function categoryChip(category, extraClass) {
  const classes = ['ra-chip'];
  if (extraClass) classes.push(extraClass);
  const bg = category ? RISK_CATEGORY_COLOUR[category] : 'transparent';
  return `<span class="${classes.join(' ')}" style="background-color:${bg}">${category || '-'}</span>`;
}

/** Worst (highest-ranked) category among a task's hazards for the given field, or null if none scored yet. */
function worstCategory(hazards, field) {
  let worstIndex = -1;
  (hazards || []).forEach(function (hazard) {
    const result = field === 'base'
      ? evaluateRisk(hazard.baseSeverity, hazard.baseProbability)
      : evaluateRisk(hazard.residualSeverity, hazard.residualProbability);
    if (result) {
      const idx = CATEGORY_ORDER.indexOf(result.category);
      if (idx > worstIndex) worstIndex = idx;
    }
  });
  return worstIndex === -1 ? null : CATEGORY_ORDER[worstIndex];
}

/**
 * The photo list on the review screen. Photos attach to the assessment as a
 * whole, not to a task or hazard, so this only needs the flat list held on
 * riskAssessmentState.photos - each entry { key, name }, where key is what
 * the server returned from uploadFiles and name is the original filename,
 * kept only for display.
 */
function riskAssessmentPhotoList(photos) {
  if (!photos || !photos.length) {
    return '<li class="ra-photo-empty text-muted">No photos attached yet.</li>';
  }

  return photos.map(function (photo, index) {
    return `
      <li class="ra-photo-item">
        <span class="ra-photo-icon"><i class="fa fa-image"></i></span>
        <span class="ra-photo-name">${escapeHtml(photo.name)}</span>
        <button type="button" class="ra-photo-remove" data-index="${index}" aria-label="Remove photo">&times;</button>
      </li>`;
  }).join('');
}

// ── Screen 1: task list ──────────────────────────────────────────────────

function createTaskListCard(task, index) {
  const hazardCount = task.hazards.length;
  const baseWorst = worstCategory(task.hazards, 'base');
  const residualWorst = worstCategory(task.hazards, 'residual');
  const title = task.taskName
    ? escapeHtml(task.taskName)
    : `<span class="ra-placeholder">Untitled task ${index + 1}</span>`;

  return `
    <div class="ra-task-card">
      <button type="button" class="ra-task-remove" data-task-index="${index}" aria-label="Remove task">&times;</button>
      <div class="ra-task-open" data-task-index="${index}">
        <div class="ra-task-card-title">${title}</div>
        <div class="ra-task-card-meta">
          <span>${hazardCount} hazard${hazardCount === 1 ? '' : 's'}</span>
          ${baseWorst ? `Base ${categoryChip(baseWorst)}` : ''}
          ${residualWorst ? `&rarr; ${categoryChip(residualWorst)}` : ''}
        </div>
      </div>
    </div>`;
}

function createListScreen(tasks) {
  const body = tasks.length
    ? tasks.map(createTaskListCard).join('')
    : '<p class="ra-empty-hint">No tasks yet. Add one to start.</p>';

  return `
    <div class="ra-screen ra-list-screen">
      <div class="ra-screen-title">Tasks</div>
      <div class="ra-task-list">${body}</div>
      <button type="button" id="raAddTask" class="btn btn-default">+ Add task</button>
      <button type="button" id="raReviewBtn" class="btn btn-primary">Review &amp; Submit</button>
    </div>`;
}

// ── Screen 2: one task's hazard list ─────────────────────────────────────

function createHazardListCard(hazard, index) {
  const base = evaluateRisk(hazard.baseSeverity, hazard.baseProbability);
  const residual = evaluateRisk(hazard.residualSeverity, hazard.residualProbability);
  const text = hazard.hazardText
    ? escapeHtml(hazard.hazardText)
    : '<span class="ra-placeholder">Untitled hazard</span>';

  return `
    <div class="ra-hazard-card">
      <button type="button" class="ra-hazard-remove" data-hazard-index="${index}" aria-label="Remove hazard">&times;</button>
      <div class="ra-hazard-open" data-hazard-index="${index}">
        <div class="ra-hazard-card-text">${text}</div>
        <div class="ra-hazard-card-meta">
          <span class="ra-badge">${escapeHtml(hazard.actOrCondition)}</span>
          ${categoryChip(base ? base.category : null)} &rarr; ${categoryChip(residual ? residual.category : null)}
        </div>
      </div>
    </div>`;
}

function createTaskScreen(task, index) {
  const backLabel = 'Tasks';
  const body = task.hazards.length
    ? task.hazards.map(createHazardListCard).join('')
    : '<p class="ra-empty-hint">No hazards logged yet for this task.</p>';

  return `
    <div class="ra-screen ra-task-screen">
      <button type="button" class="ra-back" id="raBackToList">&larr; ${backLabel}</button>
      <div class="ra-screen-title">Task ${index + 1}</div>
      <div class="form-group">
        <label>Task name</label>
        <input type="text" class="form-control ra-task-name-input" placeholder="What is being done?"
          value="${escapeHtml(task.taskName)}">
      </div>
      <div class="ra-section-title">Hazards</div>
      <div class="ra-hazard-list">${body}</div>
      <button type="button" id="raAddHazard" class="btn btn-default">+ Add hazard</button>
      <button type="button" id="raRemoveTask" class="btn btn-outline-danger btn-block">Remove this task</button>
    </div>`;
}

// ── Screen 3: one hazard's scoring form ──────────────────────────────────

function createRatingSection(title, prefix, severity, probability, scale) {
  const result = evaluateRisk(severity, probability);
  return `
    <div class="ra-section">
      <div class="ra-section-title">${title}</div>
      <div class="form-group">
        <label>Severity</label>
        <select class="form-control ra-${prefix}-severity">${riskScaleOptions(scale.severity, severity)}</select>
      </div>
      <div class="form-group">
        <label>Probability</label>
        <select class="form-control ra-${prefix}-probability">${riskScaleOptions(scale.probability, probability)}</select>
      </div>
      <div class="ra-rating-line">
        Rating <strong class="ra-${prefix}-rating">${result ? result.rating : '-'}</strong>
        ${categoryChip(result ? result.category : null, `ra-${prefix}-category`)}
      </div>
    </div>`;
}

function createControlRow(control, index) {
  return `
    <div class="ra-control-row">
      <input type="text" class="form-control ra-control-text" data-control-index="${index}"
        placeholder="Control in place or planned" value="${escapeHtml(control.controlText)}">
      <button type="button" class="ra-control-remove" data-control-index="${index}" aria-label="Remove control">&times;</button>
    </div>`;
}

function createHazardScreen(task, hazard, taskIndex, hazardIndex, scale) {
  const backLabel = task.taskName ? escapeHtml(task.taskName) : `Task ${taskIndex + 1}`;
  const controlsBody = hazard.controls.length
    ? hazard.controls.map(createControlRow).join('')
    : '<p class="ra-empty-hint">No controls added yet — that is fine, an unmitigated hazard is still a valid finding.</p>';

  return `
    <div class="ra-screen ra-hazard-screen">
      <button type="button" class="ra-back" id="raBackToTask">&larr; ${backLabel}</button>
      <div class="ra-screen-title">Hazard ${hazardIndex + 1}</div>

      <div class="form-group">
        <label>Hazard</label>
        <textarea class="form-control ra-hazard-text" rows="2"
          placeholder="What could go wrong?">${escapeHtml(hazard.hazardText)}</textarea>
      </div>

      <div class="form-group">
        <label>Act / Condition</label>
        <div class="ra-toggle" role="group">
          <button type="button" class="ra-toggle-btn ${hazard.actOrCondition === 'Act' ? 'active' : ''}" data-value="Act">Act</button>
          <button type="button" class="ra-toggle-btn ${hazard.actOrCondition === 'Condition' ? 'active' : ''}" data-value="Condition">Condition</button>
        </div>
      </div>

      <div class="form-group">
        <label>Person at risk</label>
        <input type="text" class="form-control ra-person" value="${escapeHtml(hazard.personAtRisk)}">
      </div>

      ${createRatingSection('Base Risk', 'base', hazard.baseSeverity, hazard.baseProbability, scale)}

      <div class="ra-controls-block">
        <div class="ra-section-title">Controls <span class="ra-optional">(optional)</span></div>
        <div class="ra-control-list">${controlsBody}</div>
        <button type="button" id="raAddControl" class="btn btn-default">+ Add control</button>
      </div>

      ${createRatingSection('Residual Risk', 'residual', hazard.residualSeverity, hazard.residualProbability, scale)}

      <button type="button" id="raRemoveHazard" class="btn btn-outline-danger btn-block">Remove this hazard</button>
    </div>`;
}

// ── Screen 4: review ──────────────────────────────────────────────────────

function createReviewHeaderSummary(header) {
  const rows = [
    ['Activity', header.activity],
    ['Type of Activity', header.typeOfActivity],
    ['Location', header.location],
    ['Event Activities', header.eventActivities],
    ['Department', header.department],
    ['Area', header.area],
  ];

  return `<div class="ra-review-header">${rows.map(function (row) {
    return `<div class="ra-review-header-row"><span class="ra-review-header-label">${escapeHtml(row[0])}</span><span class="ra-review-header-value">${escapeHtml(row[1]) || '-'}</span></div>`;
  }).join('')}</div>`;
}

function createRiskSummaryTable(summary) {
  const categories = ['VL', 'L', 'M', 'M+', 'H', 'VH'];
  const headerCells = categories.map(c => `<th>${c}</th>`).join('');
  const baseCells = categories.map(c => `<td>${summary.base[c]}</td>`).join('');
  const residualCells = categories.map(c => `<td>${summary.residual[c]}</td>`).join('');

  return `
    <table class="table table-bordered ra-summary-table">
      <thead><tr><th></th>${headerCells}</tr></thead>
      <tbody>
        <tr><th>Base</th>${baseCells}</tr>
        <tr><th>Residual</th>${residualCells}</tr>
      </tbody>
    </table>`;
}

/** Flat "task -> hazards -> controls" list, one row per hazard, task repeated as a header — the same shape the review is read in, whether on screen or in the eventual export. */
function createReviewList(tasks) {
  return tasks.map(function (task, taskIndex) {
    const hazardsHtml = task.hazards.map(function (hazard) {
      const base = evaluateRisk(hazard.baseSeverity, hazard.baseProbability);
      const residual = evaluateRisk(hazard.residualSeverity, hazard.residualProbability);
      const controlsHtml = hazard.controls.length
        ? `<ul class="ra-review-controls">${hazard.controls.map(c => `<li>${escapeHtml(c.controlText)}</li>`).join('')}</ul>`
        : '<p class="ra-review-no-controls">No controls recorded.</p>';

      return `
        <li class="ra-review-hazard">
          <div class="ra-review-hazard-head">
            <strong>${escapeHtml(hazard.hazardText) || '(unnamed hazard)'}</strong>
            <span class="ra-badge">${escapeHtml(hazard.actOrCondition)}</span>
          </div>
          <div class="ra-review-hazard-meta">
            Person at risk: ${escapeHtml(hazard.personAtRisk) || '-'}<br>
            Base ${categoryChip(base ? base.category : null)} &rarr; Residual ${categoryChip(residual ? residual.category : null)}
          </div>
          ${controlsHtml}
        </li>`;
    }).join('');

    return `
      <li class="ra-review-task">
        <div class="ra-review-task-name">${taskIndex + 1}. ${escapeHtml(task.taskName) || '(unnamed task)'}</div>
        <ul class="ra-review-hazards">${hazardsHtml}</ul>
      </li>`;
  }).join('');
}

function createReviewScreen(header, tasks, summary, photos) {
  return `
    <div class="ra-screen ra-review-screen">
      <button type="button" class="ra-back" id="raBackToBuilder">&larr; Back to tasks</button>
      <div class="ra-screen-title">Review</div>

      ${createReviewHeaderSummary(header)}
      ${createRiskSummaryTable(summary)}
      <ul class="ra-review-list">${createReviewList(tasks)}</ul>

      <div id="raPhotoSection" class="ra-photo-section">
        <div class="ra-photo-section-title">Attach Photos (Optional)</div>
        <div class="ra-photo-controls">
          <button type="button" id="raPhotoAdd" class="btn btn-default"><i class="fa fa-camera"></i> Choose Photos</button>
          <input type="file" id="raPhotoInput" accept="image/*" multiple capture="environment" style="display:none;">
          <span id="raPhotoStatus" class="ra-photo-status"></span>
        </div>
        <ul id="raPhotoList" class="ra-photo-list">${riskAssessmentPhotoList(photos)}</ul>
      </div>

      <button type="button" id="raSubmit" class="btn btn-success btn-block">Submit</button>
    </div>`;
}
