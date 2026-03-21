// HTML template generators for each response type

const complianceTemplate = (questionId) => `
  <div class="response-group response-compliance">
    <div class="form-group radio-group">
      <label class="radio-label">
        <input id="compliance${questionId}" value="NonCompliant" type="radio" name="Compliance${questionId}" />
        <span class="radio-btn radio-btn-danger">Non Compliant</span>
      </label>
      <label class="radio-label">
        <input id="compliance${questionId}" checked value="Compliant" type="radio" name="Compliance${questionId}" />
        <span class="radio-btn radio-btn-success">Compliant</span>
      </label>
    </div>
    <div class="form-group">
      <label>Status</label>
      <textarea id="status${questionId}" class="form-control" rows="2" placeholder="Enter status..."></textarea>
    </div>
    <div class="form-group">
      <label>Actions / Remarks</label>
      <textarea id="actions${questionId}" class="form-control" rows="2" placeholder="Required if Non Compliant..."></textarea>
    </div>
    <div class="form-group">
      <label>Responsibility</label>
      <select id="responsibility${questionId}" class="form-control responsiblity">
      </select>
    </div>
  </div>`;

const yesNoTemplate = (questionId) => `
  <div class="response-group response-yesno">
    <div class="form-group radio-group">
      <label class="radio-label">
        <input id="response${questionId}" value="Yes" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-success">Yes</span>
      </label>
      <label class="radio-label">
        <input id="response${questionId}" value="No" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-danger">No</span>
      </label>
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="remarks${questionId}" class="form-control" rows="2" placeholder="Optional remarks..."></textarea>
    </div>
  </div>`;

const yesNoNaTemplate = (questionId, applicabilityLevel) => {
  const badgeClass = applicabilityLevel ? `badge-${applicabilityLevel.toLowerCase().replace(/ /g, '-')}` : '';
  const badgeHtml = applicabilityLevel ? `<span class="applicability-badge ${badgeClass}">${applicabilityLevel}</span>` : '';
  return `
  <div class="response-group response-yesnona">
    ${badgeHtml}
    <div class="form-group radio-group">
      <label class="radio-label">
        <input id="response${questionId}" value="Yes" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-success">Yes</span>
      </label>
      <label class="radio-label">
        <input id="response${questionId}" value="No" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-danger">No</span>
      </label>
      <label class="radio-label">
        <input id="response${questionId}" value="N/A" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-muted">N/A</span>
      </label>
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="remarks${questionId}" class="form-control" rows="2" placeholder="Optional remarks..."></textarea>
    </div>
  </div>`;
};

const passFailTemplate = (questionId) => `
  <div class="response-group response-passfail">
    <div class="form-group radio-group">
      <label class="radio-label">
        <input id="response${questionId}" value="Pass" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-success">Pass</span>
      </label>
      <label class="radio-label">
        <input id="response${questionId}" value="Fail" type="radio" name="Response${questionId}" />
        <span class="radio-btn radio-btn-danger">Fail</span>
      </label>
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="remarks${questionId}" class="form-control" rows="2" placeholder="Optional remarks..."></textarea>
    </div>
  </div>`;

const textTemplate = (questionId) => `
  <div class="response-group response-text">
    <div class="form-group">
      <textarea id="response${questionId}" class="form-control" rows="2" placeholder="Enter your response..."></textarea>
    </div>
  </div>`;

const numberTemplate = (questionId) => `
  <div class="response-group response-number">
    <div class="form-group">
      <input id="response${questionId}" type="number" class="form-control" placeholder="Enter number..." />
    </div>
  </div>`;

const dateTemplate = (questionId) => `
  <div class="response-group response-date">
    <div class="form-group">
      <input id="response${questionId}" type="date" class="form-control" />
    </div>
  </div>`;

const acknowledgedTemplate = (questionId) => `
  <div class="response-group response-acknowledged">
    <div class="form-group">
      <label class="checkbox-label">
        <input id="response${questionId}" type="checkbox" value="Acknowledged" />
        <span class="checkmark"></span>
        I acknowledge and understand this item
      </label>
    </div>
  </div>`;

const ratingTemplate = (questionId) => `
  <div class="response-group response-rating">
    <div class="form-group">
      <div class="rating-buttons" id="ratingGroup${questionId}">
        ${[1,2,3,4,5].map(n => `
          <label class="rating-label">
            <input type="radio" name="Response${questionId}" value="${n}" />
            <span class="rating-btn">${n}</span>
          </label>
        `).join('')}
      </div>
      <div class="rating-scale-labels">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
    <div class="form-group">
      <label>Remarks</label>
      <textarea id="remarks${questionId}" class="form-control" rows="2" placeholder="Optional remarks..."></textarea>
    </div>
  </div>`;
