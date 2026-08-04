// storesSectionFor: the caller says whether tapping a card starts a new report.
// Reporting-type pages pass true — sectionFor becomes formName on submit, and a
// missing one makes the API reject the report. Checklist-type pages pass false so
// the sectionFor set by the Checklists tab survives. This used to be inferred from
// ".html" in the path, which broke once the host started serving extensionless URLs.
const createReportingTypeTemplate = (heading, href, urdu, description, storesSectionFor) => {
  const selectedLanguage = localStorage.getItem("previousLanguage");
  let title = heading;
  if (urdu) {
    title = selectedLanguage === "ur" ? urdu : heading;
  }

  const navigateAction = storesSectionFor
    ? `setValue('sectionFor', '${heading}'); window.location.href='${href}?heading=${heading}';`
    : `window.location.href='${href}?heading=${heading}';`;

  return `
    <button class="usafe-card" onclick="${navigateAction}">
      <div class="usafe-card-content">
        <div style="flex:1;min-width:0;">
          <span class="usafe-card-title">${title}</span>
          ${description ? `<span style="display:block;font-size:12px;color:#999;font-weight:400;margin-top:3px;line-height:1.3;">${description}</span>` : ''}
        </div>
        <i class="fas fa-chevron-right usafe-card-arrow"></i>
      </div>
    </button>`;
};
