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
      $(".reports").html('<p style="text-align:center;color:#aaa;padding:40px 0;font-size:14px;">No reports yet. Tap + to create one.</p>');
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
