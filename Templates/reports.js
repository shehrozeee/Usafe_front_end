const reports = (imageSrc, status, formName, assignedTo, date, entity, id) => {
  const isPending = status.toLowerCase() === 'pending';
  const statusColor = isPending ? '#b8860b' : '#16a34a';
  const statusBg = isPending ? '#fff8e1' : '#dcfce7';
  const dateStr = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
    <div class="report-card" onclick="NavigateToDetails('${entity}',${id})">
      <div class="report-card-top">
        <div class="report-card-info">
          <span class="report-card-type">${formName}</span>
          <span class="report-card-date">${dateStr}</span>
        </div>
        <span class="report-card-status" style="background:${statusBg};color:${statusColor};">${status}</span>
      </div>
      ${assignedTo && assignedTo !== 'N/A' ? `<div class="report-card-assigned">Assigned to: ${addStars(assignedTo)}</div>` : ''}
    </div>`;
};

const fetchReports = () => {
  let username = localStorage.getItem("userName");

  sendRequest("api/ChangeForm/fetchReports?userName=" + username, "GET", {}, (data) => {
    reportCountCaller(data.length);
    if (!data.length) {
      $(".reports").html(`
        <div class="usafe-empty-state">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="12" y="6" width="40" height="52" rx="4" stroke="#2d2d2d" stroke-width="2.5" fill="none"/>
            <line x1="22" y1="20" x2="42" y2="20" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round"/>
            <line x1="22" y1="28" x2="38" y2="28" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round"/>
            <line x1="22" y1="36" x2="34" y2="36" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round"/>
            <circle cx="46" cy="46" r="12" fill="#f5b700" stroke="#2d2d2d" stroke-width="2"/>
            <line x1="42" y1="46" x2="50" y2="46" stroke="#2d2d2d" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="46" y1="42" x2="46" y2="50" stroke="#2d2d2d" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          <h3>No reports yet</h3>
          <p>Your submitted reports will appear here.</p>
          <a href="/Pages/reportingType.html" class="usafe-empty-cta">
            <i class="fa fa-plus"></i> Create Report
          </a>
        </div>`);
      return;
    }
    let html = '';
    for (const iterator of data) {
      html += reports(iterator.files ? JSON.parse(iterator.files)[0] : "", iterator.status, iterator.formName, iterator.assignedTo, iterator.createdDate, iterator.entity, iterator.id);
    }
    $(".reports").html(html);
  });
};
fetchReports();

const NavigateToDetails = (entity, id) => {
  window.location.href = "/Pages/reportDeatails/reportDetails.html?entity=" + entity + "&id=" + id;
};

function addStars(str) {
  if (!str) return '';
  if (str.length > 20) return str.slice(0, 18) + '...';
  return str;
}
