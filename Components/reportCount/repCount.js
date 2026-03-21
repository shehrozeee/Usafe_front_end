const animateCount = (element, target) => {
  if (!target || target <= 0) { element.textContent = target; return; }
  let current = 0;
  const step = target / 30;
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      element.textContent = target;
      clearInterval(interval);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 20);
};

const reportCount = (repCount) => {
  return (
    `<div class='ReportCountContainer' style="background-color:whitesmoke;">
      <table class="table table-borderless table-sm" >
      <tbody>
      <tr style="text-align:center">
      <td style="font-weight:bold" id="submittedCount">0</td>
      <td style="font-weight:bold" id="offlineCount">0</td>
    </tr>
        <tr style="text-align:center">
          <td style="font-size:14px">Submitted Reports</td>
          <td style="font-size:14px">Offline Reports</td>
          </tr>
          </tbody>
      </div>
  `
  )
}
const reportCountCaller = (repCount) => {
  $(".reportCount").html(reportCount(repCount));
  const submittedEl = document.getElementById('submittedCount');
  if (submittedEl) animateCount(submittedEl, repCount);
}
