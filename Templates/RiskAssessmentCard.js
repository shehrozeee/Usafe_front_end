// One task of a risk assessment, as a single mobile screen. The grid in the
// source workbook is twenty columns wide, which no phone can show; the wizard
// trades width for depth and shows one task at a time.

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
 * @param {object} task   the row being assessed
 * @param {number} index  zero-based position
 * @param {number} total  number of tasks
 * @param {object} scale  { severity: [{value,label}], probability: [{value,label}] }
 */
function createRiskAssessmentCard(task, index, total, scale) {
  return `
    <div class="ra-card" data-index="${index}">
      <div class="ra-progress">Task ${index + 1} of ${total}</div>

      <h3 class="ra-task-name">${task.taskName || ''}</h3>
      ${task.hazard ? `<p class="ra-hazard"><strong>Hazard:</strong> ${task.hazard}</p>` : ''}
      ${task.hazardDescription ? `<p class="ra-cause">${task.hazardDescription}</p>` : ''}

      <div class="form-group">
        <label>Act / Condition</label>
        <select class="form-control ra-actcond">
          <option value="Act" ${task.actOrCondition === 'Act' ? 'selected' : ''}>Act</option>
          <option value="Condition" ${task.actOrCondition !== 'Act' ? 'selected' : ''}>Condition</option>
        </select>
      </div>

      <div class="form-group">
        <label>Person at risk</label>
        <input type="text" class="form-control ra-person" value="${task.personAtRisk || ''}">
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
        <textarea class="form-control ra-control" rows="3">${task.additionalControl || task.suggestedAdditionalControl || ''}</textarea>
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
