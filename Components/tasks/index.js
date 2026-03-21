var taskId = 0;
var entity = null;

function getStatusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s === 'approved' || s === 'completed') return '<span style="display:inline-flex;align-items:center;gap:4px;color:#16a34a;font-weight:700;font-size:12px;"><i class="fa fa-check-circle"></i> ' + status + '</span>';
  if (s === 'rejected') return '<span style="color:#dc2626;font-weight:700;font-size:12px;">' + status + '</span>';
  if (s === 'in progress' || s === 'inprogress') return '<span style="color:#2563eb;font-weight:700;font-size:12px;">' + status + '</span>';
  return '<span style="color:#b8860b;font-weight:700;font-size:12px;">' + status + '</span>';
}

function getTaskActionButton(task) {
  const s = (task.status || '').toLowerCase();
  if (s === 'pending') {
    return `<button class='ReportButton task-action-btn' style="background:var(--safety-yellow)!important;color:var(--charcoal)!important;" onclick="confirmTaskAction(${task.id}, '${task.entity}', 'In Progress', 'Start this task?')">START</button>`;
  }
  if (s === 'in progress' || s === 'inprogress') {
    return `<button class='ReportButton task-action-btn' style="background:#16a34a!important;color:#fff!important;" onclick="confirmTaskAction(${task.id}, '${task.entity}', 'Completed', 'Mark task as completed?')">COMPLETE</button>`;
  }
  if (s === 'approved' || s === 'completed') {
    return `<span class='ReportButton' style="background:#dcfce7!important;color:#16a34a!important;cursor:default;text-align:center;"><i class="fa fa-check-circle"></i> DONE</span>`;
  }
  if (s === 'rejected') {
    return `<span class='ReportButton' style="background:#fee2e2!important;color:#dc2626!important;cursor:default;text-align:center;">REJECTED</span>`;
  }
  return `<button class='ReportButton' data-toggle="modal" data-target="#taskModal" onclick="setTaskId(${task.id}, '${task.entity}', '${task.status}')">CHANGE STATUS</button>`;
}

const createTasks = (tasks) => {
   let html = "";
   tasks.forEach(task => {
      html += `<div class='TaskContainer'>
      <div class='ReportContent'>

        <div class='TaskHeadings'>
          <p>Status:</p>
          <p>Type:</p>
          <p>Assigned to:</p>
          <p>Due Date:</p>
        </div>

        <div class='ReportDescriptions'>
          <p>${getStatusBadge(task.status)}</p>
          <p>${task.formName}</p>
          <p>${task.assignedTo}</p>
          <p>${new Date(task.createdDate).toDateString()}</p>
        </div>

      </div>
      <div class='ReportBorder'> </div>
      <div class='TaskBtn'>
        <button class='ReportButton' onclick="NavigateToDetails('${task.entity}',${task.id})">VIEW DETAILS</button>
        ${getTaskActionButton(task)}
      </div>
    </div>
  `
  });
  return html;
  }
  const tasksCaller=(tasks)=>{
      $(".tasks").html(createTasks(tasks))
  }
  function setTaskId(id,et, status){
    taskId = id;
    entity = et;
    showNextStatus(status);
  }

  function changeTaskStatus(){
    //get status value by name
    let status = $("input[name='status']:checked").val();
    sendRequest(`api/ChangeForm/changeTaskStatus?id=${taskId}&entity=${entity}&taskValue=${status}`,'POST',{},(data)=>{
      if(data){
        $('#taskModal').modal('hide');
        showToast('Task updated', 'success');
        fetchMyTasks();
      }
    });
  }

  function confirmTaskAction(id, et, newStatus, message) {
    Swal.fire({
      title: 'Confirm',
      text: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2d2d2d',
      cancelButtonColor: '#999',
    }).then((result) => {
      if (result.isConfirmed) {
        sendRequest(`api/ChangeForm/changeTaskStatus?id=${id}&entity=${et}&taskValue=${newStatus}`, 'POST', {}, (data) => {
          if (data) {
            showToast('Task updated', 'success');
            fetchMyTasks();
          }
        });
      }
    });
  }

  //create a function which takes a status string and only shows next status options. i.e if status is pending then only show in progress and completed and so on
  function showNextStatus(status){
    let statusArray = [];
    switch(status){
      case "Pending":
        statusArray = ["In Progress", "Completed"];
        break;
      case "In Progress":
        statusArray = ["Completed"];
        break;
      case "InProgress":
        statusArray = ["Completed"];
        break;
      case "Completed":
        statusArray = ["In Progress"];
        break;
    }
    let html = "";
    for (const iterator of statusArray) {
      html += `<input type="radio" id="status1" checked name="status" value="${iterator}">
      <label for="status1">${iterator}</label> <br>`
    }

    $("#changeStatusModalBody").html(html);
  }

  const NavigateToDetails = (entity,id) => {
    window.location.href = "/Pages/reportDeatails/reportDetails.html?entity="+entity+"&id="+id;
  };