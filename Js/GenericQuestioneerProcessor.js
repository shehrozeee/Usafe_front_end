// Format question text: convert inline lists like (i), (ii) and semicolons to line breaks
const formatQuestionText = (text) => {
  if (!text) return '';
  // Convert (i), (ii), (iii), (iv), (v), (vi), (vii), (viii), (ix), (x) to line breaks
  let formatted = text.replace(/;\s*\(([ivx]+)\)\s*/g, ';<br><span class="list-item">($1)</span> ');
  // Also handle patterns like ": (i)" that start a list
  formatted = formatted.replace(/:\s*\(([ivx]+)\)\s*/g, ':<br><span class="list-item">($1)</span> ');
  // Handle standalone (i) at start after a sentence
  formatted = formatted.replace(/\.\s*\(([ivx]+)\)\s*/g, '.<br><span class="list-item">($1)</span> ');
  return formatted;
};

var _currentCheckList = "";
var _formMeta = null;
var responsiblePersons = [];
let sectionFor = getValue("sectionFor");
let currentIndex = 0;
let _allSections = [];
let _allQuestions = [];
let resultSet = [];
let _headerFields = [];
let _totalSteps = 0;

const GenericQuestioneerProcessor = (sectionName) => {
  // Try getFormMeta first (for UPL checklists with header fields)
  sendRequest(`api/checklist/getFormMeta?checkListFormName=${sectionFor}&formName=${sectionName}`, 'GET', null, (data) => {
    if (data && !data.error && data.sections) {
      _formMeta = data;
      _currentCheckList = sectionName;
      _headerFields = data.headerFields || [];
      _allSections = data.sections;
      _totalSteps = _allSections.length + 1; // +1 for header step

      // Flatten all questions for result tracking
      _allQuestions = [];
      _allSections.forEach(section => {
        section.questions.forEach(q => {
          _allQuestions.push({ ...q, sectionName: section.sectionName });
        });
      });

      buildSectionWizard();
    } else {
      // Fallback to old getQuestions for legacy DCA/PI checklists
      sendRequest(`api/checklist/getQuestions?checkListFormName=${sectionFor}&formName=${sectionName}`, 'GET', null, (data) => {
        if (!data || !data.length) {
          console.error('No checklist data found for:', sectionName);
          $('#wizardContainer').html('<div class="container mt-4"><p class="text-center text-danger">Could not load checklist. Please go back and try again.</p></div>');
          return;
        }
        // Match by exact name or by partial (section names may contain em-dash suffix)
        let section = data.find(x => x.sectionName === sectionName)
                   || data.find(x => x.sectionName.includes(sectionName))
                   || data[0];
        _currentCheckList = section.sectionName;
        let questions = section.questions;
        _allQuestions = questions;
        _allSections = [{ sectionName: section.sectionName, questions }];
        _totalSteps = 2;
        buildSectionWizard();
      });
    }
  });
};

const buildSectionWizard = () => {
  let wizardHtml = '';

  // Step 0: Header (custom header fields only — skip if none)
  const hasHeaderStep = _headerFields.length > 0;
  if (hasHeaderStep) {
    wizardHtml += buildHeaderStep();
  } else {
    _totalSteps = _allSections.length; // no header step
  }

  // Steps 1..N: One step per section
  _allSections.forEach((section, sIdx) => {
    wizardHtml += buildSectionStep(section, sIdx);
  });

  // Stepper bar
  const firstStepLabel = hasHeaderStep ? 'Details' : (_allSections[0]?.sectionName?.split('—').pop().trim() || 'Section 1');
  const stepperHtml = `
    <div class="section-stepper" id="sectionStepper">
      <div class="stepper-progress"><div class="stepper-progress-fill" id="stepperFill" style="width: ${(1/_totalSteps)*100}%"></div></div>
      <div class="stepper-text" id="stepperText">Step <strong>1</strong> of <strong>${_totalSteps}</strong> — ${firstStepLabel}</div>
    </div>`;

  $("#wizardContainer").html(stepperHtml + wizardHtml);

  // Build result page
  const resultHtml = buildResultPage();
  $("#resultContainer").html(resultHtml);

  showForm(0);
};

// ===== Header Step =====
const buildHeaderStep = () => {
  let html = `<div class="container wizard-form active-form" data-step="0">
    <div class="section-card">
      <div class="section-title">Checklist Details</div>`;

  // Custom header fields from API
  if (_headerFields.length > 0) {
    html += renderHeaderFieldsCard(_headerFields);
  }

  html += `</div>
    <div class="wizard-nav">
      <button class="btn btn-wizard-next" onclick="handleNext()">Next →</button>
    </div>
  </div>`;
  return html;
};

// ===== Section Step =====
const buildSectionStep = (section, sectionIndex) => {
  const questions = section.questions;
  const sectionTitle = section.sectionName.includes('—')
    ? section.sectionName.split('—').pop().trim()
    : section.sectionName;

  // Determine if we can show "Mark All" button
  const responseTypes = [...new Set(questions.map(q => q.responseType || 'compliance'))];
  const canMarkAll = responseTypes.every(t => ['yes_no', 'yes_no_na', 'pass_fail', 'compliance'].includes(t));
  const markAllValue = responseTypes.includes('pass_fail') ? 'Pass' :
                       responseTypes.includes('compliance') ? 'Compliant' : 'Yes';

  const stepOffset = _headerFields.length > 0 ? 1 : 0;
  const isFirstStep = (sectionIndex === 0 && stepOffset === 0);

  let html = `<div class="container wizard-form ${isFirstStep ? 'active-form' : ''}" data-step="${sectionIndex + stepOffset}">
    <div class="section-card">
      <div class="section-title">${sectionTitle}
        ${canMarkAll ? `<button class="mark-all-btn" onclick="markAllInSection(${sectionIndex}, '${markAllValue}')">✓ Mark All ${markAllValue}</button>` : ''}
      </div>`;

  // Calculate global question offset
  let globalOffset = 0;
  for (let i = 0; i < sectionIndex; i++) {
    globalOffset += _allSections[i].questions.length;
  }

  questions.forEach((q, qIdx) => {
    const questionId = globalOffset + qIdx + 1;
    const refHtml = q.refNumber ? `<span class="question-ref">${q.refNumber}</span>` : '';
    const objHtml = q.objective ? `<div class="question-objective">${q.objective}</div>` : '';
    const formattedQuestion = formatQuestionText(q.question);

    html += `
      <div class="question-item" data-response-type="${q.responseType || 'compliance'}" data-question-id="${questionId}">
        <div class="question-text">
          <span class="question-number">${qIdx + 1}</span>
          ${refHtml}${formattedQuestion}
        </div>
        ${objHtml}
        ${renderResponseInput(q, questionId)}
      </div>`;
  });

  const showBack = (_headerFields.length > 0) || (sectionIndex > 0);
  html += `</div>
    <div class="wizard-nav">
      ${showBack ? '<button class="btn btn-wizard-back" onclick="handleBack()">← Back</button>' : ''}
      <button class="btn btn-wizard-next" onclick="handleNext()">Next →</button>
    </div>
  </div>`;
  return html;
};

// ===== Navigation =====
const showForm = (index) => {
  const forms = document.getElementsByClassName("wizard-form");
  for (let i = 0; i < forms.length; i++) {
    forms[i].classList.remove("active-form", "fade-in");
  }
  if (forms[index]) {
    forms[index].classList.add("active-form", "fade-in");
  }
  updateStepper(index);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const updateStepper = (index) => {
  const fill = document.getElementById('stepperFill');
  const text = document.getElementById('stepperText');
  if (!fill || !text) return;

  const progress = ((index + 1) / _totalSteps) * 100;
  fill.style.width = `${progress}%`;

  const hasHeader = _headerFields.length > 0;
  if (hasHeader && index === 0) {
    text.innerHTML = `Step <strong>1</strong> of <strong>${_totalSteps}</strong> — Details`;
  } else {
    const sectionIdx = hasHeader ? index - 1 : index;
    const sectionName = _allSections[sectionIdx]?.sectionName || '';
    const shortName = sectionName.includes('—') ? sectionName.split('—').pop().trim() : sectionName;
    text.innerHTML = `Step <strong>${index + 1}</strong> of <strong>${_totalSteps}</strong> — ${shortName}`;
  }
};

const handleNext = () => {
  if (!validateStep(currentIndex)) return;

  if (currentIndex < _totalSteps - 1) {
    currentIndex++;
    showForm(currentIndex);
  } else {
    // All sections done — show results
    $("#wizardContainer").css("display", "none");
    $("#resultContainer").css("display", "block");
    displayResults();
  }
};

const handleBack = () => {
  if (currentIndex > 0) {
    currentIndex--;
    showForm(currentIndex);
  }
};

// ===== Mark All =====
const markAllInSection = (sectionIndex, value) => {
  let globalOffset = 0;
  for (let i = 0; i < sectionIndex; i++) {
    globalOffset += _allSections[i].questions.length;
  }

  const section = _allSections[sectionIndex];
  section.questions.forEach((q, qIdx) => {
    const questionId = globalOffset + qIdx + 1;
    const responseType = q.responseType || 'compliance';

    if (responseType === 'compliance') {
      const radio = document.querySelector(`input[name="Compliance${questionId}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else if (['yes_no', 'yes_no_na', 'pass_fail'].includes(responseType)) {
      const radio = document.querySelector(`input[name="Response${questionId}"][value="${value}"]`);
      if (radio) radio.checked = true;
    }
  });
};

// ===== Validation =====
const validateStep = (stepIndex) => {
  if (stepIndex === 0) {
    if (_headerFields.length > 0 && !validateHeaderFields()) {
      return false;
    }
    return true;
  }

  // Validate section questions
  const sectionIndex = stepIndex - 1;
  const section = _allSections[sectionIndex];
  let globalOffset = 0;
  for (let i = 0; i < sectionIndex; i++) {
    globalOffset += _allSections[i].questions.length;
  }

  for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
    const q = section.questions[qIdx];
    const questionId = globalOffset + qIdx + 1;
    if (!validateQuestionResponse(q.responseType || 'compliance', questionId)) {
      return false;
    }
  }
  return true;
};

// ===== Results =====
const displayResults = () => {
  resultSet = [];
  let globalIdx = 0;

  _allSections.forEach(section => {
    section.questions.forEach(q => {
      const questionId = globalIdx + 1;
      const responseType = q.responseType || 'compliance';
      const values = collectResponseValue(responseType, questionId);

      resultSet.push({
        questionId,
        compliance: values.compliance || '',
        status: values.status || '',
        actions: values.actions || '',
        responsibility: values.responsibility || '',
        responseType,
        responseValue: values.responseValue || '',
        remarks: values.remarks || '',
        question: q.question,
        heading: q.heading || section.sectionName,
        applicabilityLevel: q.applicabilityLevel || ''
      });

      // Update result display
      const summaryEl = document.getElementById(`resultSummary${questionId}`);
      if (summaryEl) {
        summaryEl.innerHTML = getResponseSummary(responseType, values);
      }
      const detailEl = document.getElementById(`resultDetail${questionId}`);
      if (detailEl) {
        let detail = '';
        if (responseType === 'compliance') {
          if (values.status) detail += `<p><small>Status:</small> ${values.status}</p>`;
          if (values.actions) detail += `<p><small>Actions:</small> ${values.actions}</p>`;
          if (values.responsibility) detail += `<p><small>Responsibility:</small> ${values.responsibility}</p>`;
        } else if (values.remarks) {
          detail += `<p><small>Remarks:</small> ${values.remarks}</p>`;
        }
        detailEl.innerHTML = detail || '<p class="text-muted"><small>No additional details</small></p>';
      }

      // Color the card header
      const headerEl = document.getElementById(`resultHeader${questionId}`);
      if (headerEl) {
        headerEl.className = 'result-card-header ' + getResultColorClass(responseType, values.responseValue || values.compliance);
      }

      globalIdx++;
    });
  });
};

const getResultColorClass = (responseType, value) => {
  const positive = ['Compliant', 'Yes', 'Pass', 'Acknowledged'];
  const negative = ['NonCompliant', 'No', 'Fail', 'Not Acknowledged'];
  if (positive.includes(value)) return 'result-success';
  if (negative.includes(value)) return 'result-danger';
  if (value === 'N/A') return 'result-muted';
  return 'result-info';
};

const buildResultPage = () => {
  let html = '<h5 class="text-center mb-3" style="font-weight:700;">Review Your Answers</h5>';

  let globalIdx = 0;
  _allSections.forEach(section => {
    const shortName = section.sectionName.includes('—') ? section.sectionName.split('—').pop().trim() : section.sectionName;
    html += `<div class="mb-2"><strong style="font-size:13px;color:#5f6368;">${shortName}</strong></div>`;

    section.questions.forEach((q, qIdx) => {
      const questionId = globalIdx + 1;
      const shortQ = q.question.length > 80 ? q.question.substring(0, 80) + '...' : q.question;

      html += `
        <div class="result-card">
          <div class="result-card-header result-muted" id="resultHeader${questionId}" data-toggle="collapse" data-target="#resultBody${questionId}">
            <span>${qIdx + 1}. ${shortQ}</span>
            <span id="resultSummary${questionId}">—</span>
          </div>
          <div id="resultBody${questionId}" class="collapse result-card-body">
            <div id="resultDetail${questionId}"><p class="text-muted"><small>No details</small></p></div>
          </div>
        </div>`;
      globalIdx++;
    });
  });

  html += `
    <div class="wizard-nav">
      <button class="btn btn-wizard-back" onclick="goBackFromReview()">← Edit Answers</button>
      <button class="btn btn-wizard-next" onclick="submitResultSet(this)">Submit ✓</button>
    </div>`;
  return html;
};

// ===== Submission =====
const submitResultSet = (obj) => {
  $(obj).attr("disabled", true);

  let parent = getValue("sectionFor");
  let reportedBy = localStorage.getItem("userName");
  let siteId = localStorage.getItem("siteId");
  let department = document.getElementById("department") ? $("#department option:selected").text() : "N/A";
  let area = document.getElementById("area") ? $("#area option:selected").text() : "N/A";

  // Validate all non-compliant items have actions/responsibility
  const nonCompliant = resultSet.filter(x => x.compliance === 'NonCompliant');
  const missingActions = nonCompliant.filter(x => !x.actions);
  const missingResp = nonCompliant.filter(x => !x.responsibility);

  if (missingActions.length > 0) {
    swalNotification(`Please provide actions for non-compliant items: ${missingActions.map(x => x.questionId).join(', ')}`, 'warning');
    returnToWizard(obj);
    return;
  }
  if (missingResp.length > 0) {
    swalNotification(`Please assign responsibility for non-compliant items: ${missingResp.map(x => x.questionId).join(', ')}`, 'warning');
    returnToWizard(obj);
    return;
  }

  const payload = {
    parentCheckList: parent,
    checkListName: _currentCheckList,
    reportedBy,
    department,
    area,
    siteId,
    headerValues: collectHeaderValues(),
    checkListData: resultSet
  };

  sendRequest('api/checklist/saveCheckList', 'POST', JSON.stringify(payload), result => {
    if (result.status == 200) {
      swalSuccess("Checklist Saved Successfully");
    }
  });
};

const returnToWizard = (obj) => {
  currentIndex = 0;
  resultSet = [];
  $(obj).attr("disabled", false);
  $("#wizardContainer").css("display", "block");
  $("#resultContainer").css("display", "none");
  showForm(0);
};

const goBackFromReview = () => {
  // Go back to last section step
  currentIndex = _totalSteps - 1;
  resultSet = [];
  $("#wizardContainer").css("display", "block");
  $("#resultContainer").css("display", "none");
  showForm(currentIndex);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ===== Area & Employee Helpers (same as before) =====
const getAreas = (element) => {
  let siteId = getValue("siteId");
  let departmentId = element.value;
  sendRequest(`Area/getArea?siteId=${siteId}&deptId=${departmentId}`, "GET", null, (response) => {
    let areaHtml = "<option selected disabled hidden> Select Area </option>";
    response.forEach(area => {
      areaHtml += `<option value="${area.id}">${area.areaName}</option>`;
    });
    document.getElementById("area").innerHTML = areaHtml;
  });
};

const getResponsiblePersons = () => {
  let siteId = getValue("siteId");
  let departmentId = $("#department option:selected").val();
  let areaId = $("#area option:selected").val();
  sendRequest(`Employee/GetAllEmployeeOfSite?siteId=${siteId}&deptId=${departmentId}&areaId=${areaId}`, "GET", null, (response) => {
    let responsibilityElements = document.querySelectorAll('.responsiblity');
    responsibilityElements.forEach(element => {
      let employeeHtml = "<option selected disabled hidden> Select Responsible Person </option>";
      response.forEach(employee => {
        employeeHtml += `<option value="${employee.id}">${employee.name}</option>`;
      });
      element.innerHTML = employeeHtml;
    });
  });
};
