// Render a single header field based on its fieldType
const renderHeaderField = (field, index) => {
  const id = `headerField_${index}`;
  const required = field.isRequired ? 'required' : '';
  const defaultVal = field.defaultValue || '';
  const label = field.label;

  const reqStar = field.isRequired ? '<span class="text-danger">*</span>' : '';

  switch (field.fieldType) {
    case 'text':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="text" class="form-control header-field" data-label="${label}" value="${defaultVal}" placeholder="Enter ${label}..." ${required} />
        </div>`;
    case 'number':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="number" class="form-control header-field" data-label="${label}" value="${defaultVal}" placeholder="Enter ${label}..." ${required} />
        </div>`;
    case 'date':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="date" class="form-control header-field" data-label="${label}" value="${defaultVal}" ${required} />
        </div>`;
    case 'datetime':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="datetime-local" class="form-control header-field" data-label="${label}" value="${defaultVal}" ${required} />
        </div>`;
    case 'time':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="time" class="form-control header-field" data-label="${label}" value="${defaultVal}" ${required} />
        </div>`;
    case 'month':
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <select id="${id}" class="form-control header-field" data-label="${label}" ${required}>
            <option value="" disabled ${!defaultVal ? 'selected' : ''} hidden>Select Month</option>
            ${['January','February','March','April','May','June','July','August','September','October','November','December']
              .map(m => `<option value="${m}" ${defaultVal === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>`;
    case 'select':
      const options = field.options || [];
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <select id="${id}" class="form-control header-field" data-label="${label}" ${required}>
            <option value="" disabled selected hidden>Select ${label}</option>
            ${options.map(o => `<option value="${o}" ${defaultVal === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>`;
    default:
      return `
        <div class="form-group">
          <label for="${id}">${label} ${reqStar}</label>
          <input id="${id}" type="text" class="form-control header-field" data-label="${label}" value="${defaultVal}" placeholder="Enter ${label}..." ${required} />
        </div>`;
  }
};

// Render all header fields as a card
const renderHeaderFieldsCard = (headerFields) => {
  if (!headerFields || headerFields.length === 0) return '';
  let html = '<div class="header-fields-card">';
  html += '<h5 class="header-fields-title">Checklist Details</h5>';
  headerFields.forEach((field, i) => {
    html += renderHeaderField(field, i);
  });
  html += '</div>';
  return html;
};

// Collect all header field values
const collectHeaderValues = () => {
  const fields = document.querySelectorAll('.header-field');
  const values = [];
  fields.forEach(field => {
    values.push({
      label: field.dataset.label,
      value: field.value
    });
  });
  return values;
};

// Validate required header fields
const validateHeaderFields = () => {
  const fields = document.querySelectorAll('.header-field[required]');
  for (const field of fields) {
    if (!field.value.trim()) {
      swalNotification(`Please fill in "${field.dataset.label}"`, 'warning');
      field.focus();
      return false;
    }
  }
  return true;
};
