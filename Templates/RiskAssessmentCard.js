// One task of a risk assessment, as a single mobile screen. The grid in the
// source workbook is twenty columns wide, which no phone can show; the wizard
// trades width for depth and shows one task at a time.

// No repo-wide HTML-escaping helper exists today, so it is defined here.
// Task 9 re-renders this card on every wizard Back/Next, reading the
// assessor's own typed values back out and feeding them through this same
// template — so any user-entered field (taskName, hazard,
// hazardDescription, additionalControl, personAtRisk, ...) MUST be routed
// through this before landing in the HTML string, whether it lands in an
// element body or inside an attribute value. Escape `&` first so the
// entities inserted for the other characters don't themselves get escaped.
// Values this file generates itself (numeric scale values, the `selected`
// keyword, data-index) are not user data and must NOT be passed through
// this - see riskScaleOptions below.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function riskScaleOptions(options, selected) {
  return options.map(function (option) {
    const isSelected = option.value === selected ? 'selected' : '';
    return `<option value="${option.value}" ${isSelected}>${option.value} - ${option.label}</option>`;
  }).join('');
}

function riskCategoryChip(id) {
  return `<span class="ra-chip" id="${id}">-</span>`;
}

/**
 * The photo list on the review screen. Photos attach to the assessment as a
 * whole (see submitRiskAssessment), not to a task, so this only needs the
 * flat list held on riskAssessmentState.photos - each entry
 * { key, name }, where key is what the server returned from uploadFiles and
 * name is the original filename, kept only for display.
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

/**
 * @param {object} task   the row being assessed
 * @param {number} index  zero-based position
 * @param {number} total  number of tasks
 * @param {object} scale  { severity: [{value,label}], probability: [{value,label}] }
 */
function createRiskAssessmentCard(task, index, total, scale) {
  if (!task) {
    return `<div class="ra-card"><p class="text-muted">No tasks to assess yet. Use "+ Add task" to log one.</p></div>`;
  }

  // A task added on site (riskAssessmentRowId === null) has no author to
  // attribute a name/hazard/description to, so the assessor has to supply
  // them here. A template-derived task already carries that plan from
  // whoever authored the template - letting the assessor silently reword it
  // would misrepresent the template, so those three stay read-only text.
  const isSiteAdded = task.riskAssessmentRowId === null;

  const nameAndHazardHtml = isSiteAdded ? `
      <div class="form-group">
        <label>Task name</label>
        <input type="text" class="form-control ra-task-name-input" placeholder="What were you doing?"
          value="${escapeHtml(task.taskName)}">
      </div>
      <div class="form-group">
        <label>Hazard</label>
        <input type="text" class="form-control ra-hazard-input" placeholder="What could go wrong?"
          value="${escapeHtml(task.hazard)}">
      </div>
      <div class="form-group">
        <label>Hazard description</label>
        <textarea class="form-control ra-hazard-description-input" rows="2"
          placeholder="Describe the cause">${escapeHtml(task.hazardDescription)}</textarea>
      </div>` : `
      <h3 class="ra-task-name">${escapeHtml(task.taskName)}</h3>
      ${task.hazard ? `<p class="ra-hazard"><strong>Hazard:</strong> ${escapeHtml(task.hazard)}</p>` : ''}
      ${task.hazardDescription ? `<p class="ra-cause">${escapeHtml(task.hazardDescription)}</p>` : ''}`;

  return `
    <div class="ra-card" data-index="${index}">
      <div class="ra-progress">Task ${index + 1} of ${total}</div>
      ${task.skipped ? '<div class="ra-skipped-banner alert alert-warning py-2">This task is marked as skipped.</div>' : ''}

      ${nameAndHazardHtml}

      <div class="form-group">
        <label>Act / Condition</label>
        <select class="form-control ra-actcond">
          <option value="Act" ${task.actOrCondition === 'Act' ? 'selected' : ''}>Act</option>
          <option value="Condition" ${task.actOrCondition !== 'Act' ? 'selected' : ''}>Condition</option>
        </select>
      </div>

      <div class="form-group">
        <label>Person at risk</label>
        <input type="text" class="form-control ra-person" value="${escapeHtml(task.personAtRisk)}">
      </div>

      <div class="ra-section">
        <div class="ra-section-title">BASE RISK</div>
        <div class="form-group">
          <label>Severity</label>
          <select class="form-control ra-base-severity">
            ${riskScaleOptions(scale.severity, task.baseSeverity)}
          </select>
        </div>
        <div class="form-group">
          <label>Probability</label>
          <select class="form-control ra-base-probability">
            ${riskScaleOptions(scale.probability, task.baseProbability)}
          </select>
        </div>
        <div class="ra-rating">
          Rating <strong class="ra-base-rating">-</strong>
          ${riskCategoryChip('raBaseCategory')}
        </div>
      </div>

      <div class="form-group">
        <label>Additional Control</label>
        <textarea class="form-control ra-control" rows="3">${escapeHtml(task.additionalControl)}</textarea>
      </div>

      <div class="ra-section">
        <div class="ra-section-title">RESIDUAL RISK</div>
        <div class="form-group">
          <label>Severity</label>
          <select class="form-control ra-residual-severity">
            ${riskScaleOptions(scale.severity, task.residualSeverity)}
          </select>
        </div>
        <div class="form-group">
          <label>Probability</label>
          <select class="form-control ra-residual-probability">
            ${riskScaleOptions(scale.probability, task.residualProbability)}
          </select>
        </div>
        <div class="ra-rating">
          Rating <strong class="ra-residual-rating">-</strong>
          ${riskCategoryChip('raResidualCategory')}
        </div>
      </div>
    </div>`;
}
