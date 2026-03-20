// Legacy result HTML for backward compatibility with old DCA/PI checklists
const createResultHtml = (questions) => {
  return `
    <div id="resultContainer">
    <h2>Checklist Results</h2>
    <div class="accordion" id="accordionResults">
      ${questions.map((question, index) => `
        <div class="card">
          <div class="card-header" id="questionHeading${index}">
            <h5 class="mb-0">
              <button class="btn btn-link" type="button" data-toggle="collapse" data-target="#questionCollapse${index}" aria-expanded="true" aria-controls="questionCollapse${index}">
                ${question.heading} (${question.question})
              </button>
            </h5>
          </div>
          <div id="questionCollapse${index}" class="collapse" aria-labelledby="questionHeading${index}" data-parent="#accordionResults">
            <div class="card-body">
              <p>Compliance: <span id="question${index + 1}ComplianceValue">${question.compliance || ''}</span></p>
              <p>Status: <span id="question${index + 1}StatusValue">${question.status || ''}</span></p>
              <p>Actions / Remarks: <span id="question${index + 1}ActionsValue">${question.actions || ''}</span></p>
              <p>Responsibility: <span id="question${index + 1}ResponsibilityValue">${question.responsibility || ''}</span></p>
            </div>
          </div>
        </div>`).join("")}
    </div>`;
};

const createSafetyActionsHtml = (actions) => {
  return `
    <div id="resultContainer">
    <h2>Safety Actions</h2>
    <div class="accordion" id="accordionResults">
      ${actions.map((action, index) => `
        <div class="card">
          <div class="card-header" id="questionHeading${index}">
            <h5 class="mb-0">
              <button class="btn btn-link" type="button" data-toggle="collapse" data-target="#questionCollapse${index}" aria-expanded="true" aria-controls="questionCollapse${index}">
                ${action.heading} (${action.question})
              </button>
            </h5>
          </div>
          <div id="questionCollapse${index}" class="collapse" aria-labelledby="questionHeading${index}" data-parent="#accordionResults">
            <div class="card-body">
              <p>Target Date: <span id="question${index + 1}ComplianceValue">${action.targetDate}</span></p>
              <p>Status: <span id="question${index + 1}StatusValue">${action.status}</span></p>
              <p>Actions / Remarks: <span id="question${index + 1}ActionsValue">${action.actions}</span></p>
              <p>Responsibility: <span id="question${index + 1}ResponsibilityValue">${action.responsibility}</span></p>
            </div>
          </div>
        </div>`).join("")}
    </div>`;
};
