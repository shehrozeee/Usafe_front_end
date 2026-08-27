const Login = () => {
    $('#load').show();
    // Phone keyboards routinely append a space when they autocomplete an address,
    // and the server looks the account up by exact email — Identity normalises case
    // but not whitespace. Untrimmed, that invisible character comes back as
    // "Invalid username or password", which nobody can diagnose from the screen.
    // The password is deliberately left alone: a space can be part of it.
    //
    // Lowercased for the same reason: an iPhone capitalises the first letter of the
    // field, and the address it produced then travelled in the "email" header on every
    // later request. Login accepted it, the API did not, and the app read the 401 as
    // "Session expired" — a loop that cost ops@spoton.pk eleven minutes on 2026-08-27.
    // The server no longer cares about the case, but nothing is served by storing it.
    let username = document.getElementById('username').value.trim().toLowerCase();
    let password = document.getElementById('password').value;
    let data = { username: username, password: password };
    sendRequest('api/account/login', 'POST', JSON.stringify(data), (data) => {
        if (data) {
            if (data.status === 'success') {
                // The server echoes back whatever was typed; store the address we
                // normalised, not that echo, so the header stays lowercase from here on.
                localStorage.setItem("userName", (data.userName || username).toLowerCase());
                localStorage.setItem("siteId", data.siteId);
                localStorage.setItem("siteName", data.siteName || "");
                // Every agency this user may report for — drives the agency picker
                localStorage.setItem("sites", JSON.stringify(data.sites || []));
                //set token
                localStorage.setItem("token", data.token);
                localStorage.setItem("userRole", data.userRole);
                localStorage.setItem("fullName", data.fullName);
                //make an api call to get departments and store it in local storage
                sendRequest('Department/GetDepartments?siteId=' + data.siteId, 'GET', {}, (data) => {
                    $('#load').hide();

                    if (data) {
                        localStorage.removeItem("departments");
                        localStorage.setItem("departments", JSON.stringify(data));
                        window.location.href = '/Pages/reporting/reporting.html'
                    }
                    else {
                        console.log("Error in getting departments");
                    }
                });

                //set expiry date to 1 day
                let expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 1);
                localStorage.setItem("expiryDate", expiryDate);
            }
            else {
                $('#load').hide();
                swalNotification(data.message, "error");
            }
        }
    });
}