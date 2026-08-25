const Login = () => {
    $('#load').show();
    // Phone keyboards routinely append a space when they autocomplete an address,
    // and the server looks the account up by exact email — Identity normalises case
    // but not whitespace. Untrimmed, that invisible character comes back as
    // "Invalid username or password", which nobody can diagnose from the screen.
    // The password is deliberately left alone: a space can be part of it.
    let username = document.getElementById('username').value.trim();
    let password = document.getElementById('password').value;
    let data = { username: username, password: password };
    sendRequest('api/account/login', 'POST', JSON.stringify(data), (data) => {
        if (data) {
            if (data.status === 'success') {
                localStorage.setItem("userName", data.userName);
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