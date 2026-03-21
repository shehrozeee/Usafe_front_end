(function fetchMyTasks (){
    let username = localStorage.getItem("userName");

    sendRequest("api/ChangeForm/fetchmyTasks?userName="+username, "GET",{}, (data) => {
        if (!data || !data.length) {
            $(".tasks").html(`
                <div class="usafe-empty-state">
                    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="8" y="10" width="48" height="44" rx="4" stroke="#2d2d2d" stroke-width="2.5" fill="none"/>
                        <path d="M8 20h48" stroke="#2d2d2d" stroke-width="2"/>
                        <circle cx="16" cy="15" r="2" fill="#f5b700"/>
                        <circle cx="23" cy="15" r="2" fill="#f5b700"/>
                        <circle cx="30" cy="15" r="2" fill="#f5b700"/>
                        <line x1="18" y1="30" x2="26" y2="30" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round"/>
                        <rect x="28" y="27" width="18" height="6" rx="3" stroke="#2d2d2d" stroke-width="1.5" fill="none"/>
                        <line x1="18" y1="40" x2="26" y2="40" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round"/>
                        <rect x="28" y="37" width="18" height="6" rx="3" stroke="#2d2d2d" stroke-width="1.5" fill="none"/>
                    </svg>
                    <h3>No tasks assigned</h3>
                    <p>Tasks assigned to you will show up here.</p>
                    <a href="/Pages/reportingType.html" class="usafe-empty-cta">
                        <i class="fa fa-plus"></i> Create Report
                    </a>
                </div>`);
            return;
        }
        tasksCaller(data);
    });
})()