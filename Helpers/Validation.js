const markFieldError = (element, message) => {
  clearFieldError(element);
  element.classList.add('field-error', 'field-shake');
  const msg = document.createElement('span');
  msg.className = 'field-error-msg';
  msg.textContent = message;
  element.parentNode.appendChild(msg);
  // Remove shake after animation completes
  setTimeout(() => element.classList.remove('field-shake'), 300);
};

const clearFieldError = (element) => {
  element.classList.remove('field-error', 'field-shake');
  const existing = element.parentNode.querySelector('.field-error-msg');
  if (existing) existing.remove();
};

const validateRequired = (element) => {
  const val = element.value;
  if (val === '' || val.includes('Select')) {
    markFieldError(element, 'This field is required');
    return false;
  }
  clearFieldError(element);
  return true;
};
