const createHeader = (heading) => {
  const shortHeading = heading && heading.length > 35 ? heading.substring(0, 35) + '...' : (heading || '');
  return `<div class="navbar">
    <button class="navbar-back" onclick="window.history.back()" type="button" aria-label="Go back">
      <i class="fas fa-arrow-left"></i>
    </button>
    <span class="navbar-heading">${shortHeading}</span>
  </div>`;
};

const navigateToHome = () => {
  window.location.href = "/Pages/reporting/reporting.html";
};
