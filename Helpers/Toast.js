const showToast = (message, type = 'success', duration = 3000) => {
  let container = document.querySelector('.usafe-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'usafe-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `usafe-toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
};
