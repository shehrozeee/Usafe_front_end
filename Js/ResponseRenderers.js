// Dispatch function: returns the correct HTML template based on responseType
const renderResponseInput = (question, questionId) => {
  const type = question.responseType || 'compliance';
  switch (type) {
    case 'compliance':
      return complianceTemplate(questionId);
    case 'yes_no':
      return yesNoTemplate(questionId);
    case 'yes_no_na':
      return yesNoNaTemplate(questionId, question.applicabilityLevel);
    case 'pass_fail':
      return passFailTemplate(questionId);
    case 'text':
      return textTemplate(questionId);
    case 'number':
      return numberTemplate(questionId);
    case 'date':
      return dateTemplate(questionId);
    case 'acknowledged':
      return acknowledgedTemplate(questionId);
    case 'rating':
      return ratingTemplate(questionId);
    default:
      return complianceTemplate(questionId);
  }
};

// Collect the response value from a question's inputs based on its responseType
const collectResponseValue = (responseType, questionId) => {
  const type = responseType || 'compliance';
  switch (type) {
    case 'compliance': {
      const selected = document.querySelector(`input[name="Compliance${questionId}"]:checked`);
      return {
        responseValue: selected ? selected.value : '',
        compliance: selected ? selected.value : '',
        status: document.getElementById(`status${questionId}`)?.value || '',
        actions: document.getElementById(`actions${questionId}`)?.value || '',
        responsibility: getSelectedText(`responsibility${questionId}`)
      };
    }
    case 'yes_no':
    case 'yes_no_na':
    case 'pass_fail': {
      const selected = document.querySelector(`input[name="Response${questionId}"]:checked`);
      return {
        responseValue: selected ? selected.value : '',
        compliance: selected ? selected.value : '',
        status: '',
        actions: '',
        responsibility: '',
        remarks: document.getElementById(`remarks${questionId}`)?.value || ''
      };
    }
    case 'text': {
      return {
        responseValue: document.getElementById(`response${questionId}`)?.value || '',
        compliance: '',
        status: '',
        actions: '',
        responsibility: ''
      };
    }
    case 'number': {
      return {
        responseValue: document.getElementById(`response${questionId}`)?.value || '',
        compliance: '',
        status: '',
        actions: '',
        responsibility: ''
      };
    }
    case 'date': {
      return {
        responseValue: document.getElementById(`response${questionId}`)?.value || '',
        compliance: '',
        status: '',
        actions: '',
        responsibility: ''
      };
    }
    case 'acknowledged': {
      const checked = document.getElementById(`response${questionId}`)?.checked;
      return {
        responseValue: checked ? 'Acknowledged' : 'Not Acknowledged',
        compliance: checked ? 'Acknowledged' : 'Not Acknowledged',
        status: '',
        actions: '',
        responsibility: ''
      };
    }
    case 'rating': {
      const selected = document.querySelector(`input[name="Response${questionId}"]:checked`);
      return {
        responseValue: selected ? selected.value : '',
        compliance: selected ? selected.value : '',
        status: '',
        actions: '',
        responsibility: '',
        remarks: document.getElementById(`remarks${questionId}`)?.value || ''
      };
    }
    default:
      return { responseValue: '', compliance: '', status: '', actions: '', responsibility: '' };
  }
};

// Get the visible text of a select element (not its value)
const getSelectedText = (elementId) => {
  const el = document.getElementById(elementId);
  if (!el) return '';
  const text = el.options[el.selectedIndex]?.text || '';
  return text === 'Select Responsible Person' ? '' : text;
};

// Validate a single question based on its response type
const validateQuestionResponse = (responseType, questionId) => {
  const type = responseType || 'compliance';
  switch (type) {
    case 'compliance': {
      const selected = document.querySelector(`input[name="Compliance${questionId}"]:checked`);
      if (selected && selected.value === 'NonCompliant') {
        const actions = document.getElementById(`actions${questionId}`)?.value;
        const resp = document.getElementById(`responsibility${questionId}`)?.value;
        if (!actions) {
          swalNotification('Please enter actions for non-compliant item', 'warning');
          return false;
        }
        if (!resp || resp === 'Select Responsible Person') {
          swalNotification('Please select responsible person for non-compliant item', 'warning');
          return false;
        }
      }
      return true;
    }
    case 'yes_no':
    case 'yes_no_na':
    case 'pass_fail': {
      const selected = document.querySelector(`input[name="Response${questionId}"]:checked`);
      return !!selected;
    }
    case 'text':
      return true; // text is optional unless we add required flag
    case 'number':
      return true;
    case 'date':
      return true;
    case 'acknowledged': {
      const checked = document.getElementById(`response${questionId}`)?.checked;
      if (!checked) {
        swalNotification('Please acknowledge this item', 'warning');
        return false;
      }
      return true;
    }
    case 'rating': {
      const selected = document.querySelector(`input[name="Response${questionId}"]:checked`);
      return !!selected;
    }
    default:
      return true;
  }
};

// Get a display-friendly summary for the result accordion
const getResponseSummary = (responseType, values) => {
  const type = responseType || 'compliance';
  switch (type) {
    case 'compliance':
      return `<span class="result-value ${values.compliance === 'Compliant' ? 'text-success' : 'text-danger'}">${values.compliance}</span>`;
    case 'yes_no':
    case 'yes_no_na':
      return `<span class="result-value ${values.responseValue === 'Yes' ? 'text-success' : values.responseValue === 'No' ? 'text-danger' : 'text-muted'}">${values.responseValue}</span>`;
    case 'pass_fail':
      return `<span class="result-value ${values.responseValue === 'Pass' ? 'text-success' : 'text-danger'}">${values.responseValue}</span>`;
    case 'text':
    case 'number':
    case 'date':
      return `<span class="result-value text-info">${values.responseValue || '—'}</span>`;
    case 'acknowledged':
      return `<span class="result-value ${values.responseValue === 'Acknowledged' ? 'text-success' : 'text-danger'}">${values.responseValue}</span>`;
    case 'rating': {
      const val = parseInt(values.responseValue) || 0;
      const color = val >= 4 ? 'text-success' : val >= 3 ? 'text-warning' : 'text-danger';
      return `<span class="result-value ${color}">${val}/5</span>`;
    }
    default:
      return values.responseValue || '';
  }
};
