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

/**
 * How a category chip should look. RISK_CATEGORY_COLOUR (Js/RiskMatrix.js) is
 * the one and only source of the background colour - that map is off limits
 * and stays exactly as-is. This only decides the *contrast* around it (text
 * colour + a warn/calm marker) so that a VH chip reads as an alarm and a VL
 * chip reads as calm, instead of every category looking like the same grey
 * pill with a different pastel behind it. The two worst categories (H, VH)
 * get dark backgrounds from that map, so they need light text; everything
 * else keeps dark text on its pale background.
 *
 * The warn/calm marker is applied as a CSS class (ra-chip-warn / ra-chip-safe,
 * styled with a ::before icon in css/risk-assessment.css) rather than as a
 * literal character in the chip's text - several tests read the chip's exact
 * textContent (e.g. expecting precisely "L" or "VH"), and a ::before glyph is
 * rendering-only, so it never appears in textContent and those assertions
 * stay valid. Both colours used here are already design-system tokens
 * (--usafe-charcoal / --usafe-white), nothing new.
 */
function categoryChipStyle(category) {
  if (!category) {
    return { bg: 'transparent', color: 'var(--usafe-text-light)', marker: '', alarm: false };
  }
  const rank = CATEGORY_ORDER.indexOf(category);
  const isHigh = rank >= 4; // H, VH
  const isLow = rank >= 0 && rank <= 1; // VL, L
  return {
    bg: RISK_CATEGORY_COLOUR[category],
    color: isHigh ? 'var(--usafe-white)' : 'var(--usafe-charcoal)',
    marker: isHigh ? 'ra-chip-warn' : (isLow ? 'ra-chip-safe' : ''),
    alarm: isHigh,
  };
}

/** category is a category string ('VL'..'VH') or null/falsy for "not yet scored". */
function categoryChip(category, extraClass) {
  const style = categoryChipStyle(category);
  const classes = ['ra-chip'];
  if (extraClass) classes.push(extraClass);
  if (style.marker) classes.push(style.marker);
  if (style.alarm) classes.push('ra-chip-alarm');
  return `<span class="${classes.join(' ')}" style="background-color:${style.bg};color:${style.color}">${category || '-'}</span>`;
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
          <span><i class="fas fa-exclamation-triangle"></i> ${hazardCount} hazard${hazardCount === 1 ? '' : 's'}</span>
          ${baseWorst ? `Base ${categoryChip(baseWorst)}` : ''}
          ${residualWorst ? `&rarr; ${categoryChip(residualWorst)}` : ''}
        </div>
      </div>
    </div>`;
}

function createListScreen(tasks) {
  const body = tasks.length
    ? tasks.map(createTaskListCard).join('')
    : `<div class="ra-empty-hint"><i class="fas fa-clipboard-list"></i>No tasks yet. Tap "Add Task" below to log the first thing being done.</div>`;

  return `
    <div class="ra-screen ra-list-screen">
      <div class="ra-screen-title"><i class="fas fa-tasks"></i> Tasks</div>
      <div class="ra-task-list">${body}</div>
      <button type="button" id="raAddTask" class="btn btn-default"><i class="fas fa-plus"></i> Add Task</button>
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
  const taskLabel = task.taskName ? escapeHtml(task.taskName) : `Task ${index + 1}`;
  const body = task.hazards.length
    ? task.hazards.map(createHazardListCard).join('')
    : `<div class="ra-empty-hint"><i class="fas fa-exclamation-triangle"></i>No hazards logged yet. Tap "Add Hazard" for the first thing that could go wrong here.</div>`;

  return `
    <div class="ra-screen ra-task-screen">
      <div class="ra-breadcrumb">
        <span class="ra-crumb ra-crumb-link" id="raBackToList"><i class="fas fa-tasks"></i> Tasks</span>
        <span class="ra-crumb-sep">&rsaquo;</span>
        <span class="ra-crumb ra-crumb-current">${taskLabel}</span>
      </div>
      <div class="ra-screen-title"><i class="fas fa-tasks"></i> Task ${index + 1}</div>
      <div class="ra-taskname-block">
        <div class="form-group">
          <label>Task name</label>
          <input type="text" class="form-control ra-task-name-input" placeholder="What is being done?"
            value="${escapeHtml(task.taskName)}">
        </div>
      </div>
      <div class="ra-section-title"><i class="fas fa-exclamation-triangle"></i> Hazards</div>
      <div class="ra-hazard-list">${body}</div>
      <button type="button" id="raAddHazard" class="btn btn-default"><i class="fas fa-plus"></i> Add Hazard</button>
    </div>
    ${createConfirmFooter('raConfirmTask', 'Confirm Task', 'raRemoveTask', 'Remove this task')}`;
}

// ── Screen 3: one hazard's scoring form ──────────────────────────────────

/**
 * One scoring box (Base or Residual). Severity and Probability sit side by
 * side in one grid with a shared label above ("Severity x Probability"), and
 * the result is shown below a rule as "= Rating N [category chip]" - the
 * layout itself says "these two selects multiply into that result",  rather
 * than leaving three stacked, visually unrelated form-groups for the assessor
 * to mentally connect. The severity/probability/rating/category classes are
 * unchanged (tests select on them directly).
 */
function createRatingSection(title, subtitle, prefix, severity, probability, scale) {
  const result = evaluateRisk(severity, probability);
  return `
    <div class="ra-section ra-section--${prefix}">
      <div class="ra-section-title">${title} <span class="ra-section-sub">${subtitle}</span></div>
      <div class="ra-score-grid">
        <div class="form-group">
          <label>Severity</label>
          <select class="form-control ra-${prefix}-severity">${riskScaleOptions(scale.severity, severity)}</select>
        </div>
        <div class="form-group">
          <label>Probability</label>
          <select class="form-control ra-${prefix}-probability">${riskScaleOptions(scale.probability, probability)}</select>
        </div>
      </div>
      <div class="ra-score-result">
        <span class="ra-score-eq">=</span>
        <span class="ra-rating-line">Rating <strong class="ra-${prefix}-rating">${result ? result.rating : '-'}</strong></span>
        ${categoryChip(result ? result.category : null, `ra-${prefix}-category`)}
      </div>
    </div>`;
}

/**
 * Bottom action pair shared by the task and hazard screens: two full,
 * plainly visible buttons the assessor picks between having just filled the
 * screen in - Confirm to move forward, Remove if this was a mistake. Neither
 * screen had a forward action before this: both ended in a single full-width
 * red "Remove this X" button, which was the only thing to tap after scoring
 * a hazard or naming a task, and it destroyed the work instead of moving
 * forward. Remove is NOT shrunk or tucked away here - it stays a real,
 * full-width button, just styled as the destructive option (outline red)
 * stacked below Confirm (filled brand yellow, the forward/positive option),
 * so the two read as a clear pair of choices rather than one masquerading as
 * the other. Confirm is pure navigation (goToTask/goToList), never
 * validation - every field already writes straight into riskAssessmentState
 * as the assessor types (see the input/change handlers in
 * Js/RiskAssessmentProcessor.js), so there is nothing left to persist here.
 * Wrapped in .ra-sticky-footer (css/risk-assessment.css) so both actions are
 * reachable without scrolling past a long scoring form, not just at the very
 * bottom of it - the exact gap a real user hit.
 */
function createConfirmFooter(confirmId, confirmLabel, removeId, removeLabel) {
  return `
    <div class="ra-sticky-footer">
      <button type="button" id="${confirmId}" class="btn ra-confirm-btn btn-block">
        <i class="fas fa-check"></i> ${confirmLabel}
      </button>
      <button type="button" id="${removeId}" class="btn btn-outline-danger btn-block ra-remove-btn">
        ${removeLabel}
      </button>
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
  const taskLabel = task.taskName ? escapeHtml(task.taskName) : `Task ${taskIndex + 1}`;
  const controlsBody = hazard.controls.length
    ? hazard.controls.map(createControlRow).join('')
    : `<div class="ra-empty-hint"><i class="fas fa-shield-alt"></i>No controls added yet - add at least one before this hazard can be confirmed.</div>`;

  return `
    <div class="ra-screen ra-hazard-screen">
      <div class="ra-breadcrumb">
        <span class="ra-crumb ra-crumb-link" id="raCrumbList"><i class="fas fa-tasks"></i> Tasks</span>
        <span class="ra-crumb-sep">&rsaquo;</span>
        <span class="ra-crumb ra-crumb-link" id="raBackToTask">${taskLabel}</span>
        <span class="ra-crumb-sep">&rsaquo;</span>
        <span class="ra-crumb ra-crumb-current">Hazard ${hazardIndex + 1}</span>
      </div>
      <div class="ra-screen-title"><i class="fas fa-exclamation-triangle"></i> Hazard ${hazardIndex + 1}</div>

      <div class="ra-hazardtext-block">
        <div class="form-group">
          <label>Hazard</label>
          <textarea class="form-control ra-hazard-text" rows="2"
            placeholder="What could go wrong?">${escapeHtml(hazard.hazardText)}</textarea>
        </div>
      </div>

      <div class="form-group">
        <label>Act / Condition</label>
        <div class="ra-toggle" role="group">
          <button type="button" class="ra-toggle-btn ${hazard.actOrCondition === 'Act' ? 'active' : ''}" data-value="Act">Act</button>
          <button type="button" class="ra-toggle-btn ${hazard.actOrCondition === 'Condition' ? 'active' : ''}" data-value="Condition">Condition</button>
        </div>
      </div>

      <div class="ra-person-block">
        <div class="form-group">
          <label>Person at risk</label>
          <input type="text" class="form-control ra-person" value="${escapeHtml(hazard.personAtRisk)}">
        </div>
      </div>

      ${createRatingSection('Base Risk', 'before controls', 'base', hazard.baseSeverity, hazard.baseProbability, scale)}

      <div class="ra-flow-arrow"><i class="fas fa-arrow-down"></i> Controls applied to reduce this risk</div>

      <div class="ra-controls-block">
        <div class="ra-section-title"><i class="fas fa-shield-alt"></i> Controls</div>
        <div class="ra-control-list">${controlsBody}</div>
        <button type="button" id="raAddControl" class="btn btn-default"><i class="fas fa-plus"></i> Add Control</button>
      </div>

      <div class="ra-flow-arrow"><i class="fas fa-arrow-down"></i> Risk remaining after controls</div>

      ${createRatingSection('Residual Risk', 'after controls', 'residual', hazard.residualSeverity, hazard.residualProbability, scale)}
    </div>
    ${createConfirmFooter('raConfirmHazard', 'Confirm Hazard', 'raRemoveHazard', 'Remove this hazard')}`;
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

/** Highest-ranked category with at least one hazard in it, or null if the row is all zero (nothing scored). */
function worstFromSummaryRow(row) {
  let worstIndex = -1;
  CATEGORY_ORDER.forEach(function (category, idx) {
    if (row[category] > 0) worstIndex = idx;
  });
  return worstIndex === -1 ? null : CATEGORY_ORDER[worstIndex];
}

function createRiskSummaryTable(summary) {
  const categories = ['VL', 'L', 'M', 'M+', 'H', 'VH'];
  const headerCells = categories.map(function (c) {
    const style = categoryChipStyle(c);
    return `<th style="background-color:${style.bg};color:${style.color}">${c}</th>`;
  }).join('');
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

/**
 * The one-line "so what" that opens the review screen: how many hazards were
 * logged and the worst category before vs. after controls, in the same big
 * chips used throughout the wizard - so the risk profile reads as the
 * assessment's conclusion, not as a small bordered table buried between the
 * header fields and a long list of tasks.
 */
function createReviewVerdict(summary) {
  const hazardCount = CATEGORY_ORDER.reduce((sum, c) => sum + summary.base[c], 0);
  if (!hazardCount) return '';

  const worstBase = worstFromSummaryRow(summary.base);
  const worstResidual = worstFromSummaryRow(summary.residual);

  return `
    <div class="ra-review-verdict">
      <span>${hazardCount} hazard${hazardCount === 1 ? '' : 's'} assessed &mdash; worst risk</span>
      ${categoryChip(worstBase)}
      <i class="fas fa-arrow-right"></i>
      ${categoryChip(worstResidual)}
      <span>after controls</span>
    </div>`;
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
      <div class="ra-breadcrumb">
        <span class="ra-crumb ra-crumb-link" id="raBackToBuilder"><i class="fas fa-tasks"></i> Tasks</span>
        <span class="ra-crumb-sep">&rsaquo;</span>
        <span class="ra-crumb ra-crumb-current">Review</span>
      </div>
      <div class="ra-screen-title"><i class="fas fa-clipboard-check"></i> Review &amp; Submit</div>

      ${createReviewHeaderSummary(header)}

      <div class="ra-review-summary">
        <div class="ra-review-summary-title">Risk Profile</div>
        ${createReviewVerdict(summary)}
        ${createRiskSummaryTable(summary)}
      </div>

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
