const createReportingTypeTemplate = (heading, href, urdu) => {
  const selectedLanguage = localStorage.getItem("previousLanguage");
  let title = heading;
  if (urdu) {
    title = selectedLanguage === "ur" ? urdu : heading;
  }
  var url_string = window.location.href;
  var url = new URL(url_string);

  // For reporting type pages, store sectionFor before navigating
  const isReportingPage = url.pathname.includes("reportingType.html") || url.pathname.includes("EnvironmentalChanges.html");
  const navigateAction = isReportingPage
    ? `setValue('sectionFor', '${heading}'); window.location.href='${href}?heading=${heading}';`
    : `window.location.href='${href}?heading=${heading}';`;

  return `
    <button class="usafe-card" onclick="${navigateAction}">
      <div class="usafe-card-content">
        <span class="usafe-card-title">${title}</span>
        <i class="fas fa-chevron-right usafe-card-arrow"></i>
      </div>
    </button>`;
};
