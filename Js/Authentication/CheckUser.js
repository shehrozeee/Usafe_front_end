let userName = localStorage.getItem("userName");
//check for expiry date of user
let expiryDate = new Date(localStorage.getItem("expiryDate"));
let currentDate = new Date();
if (expiryDate && expiryDate > currentDate) {
    console.log("user is valid");
} else {
    console.log("user is not valid");
  localStorage.removeItem("userName");
  localStorage.removeItem("expiryDate");
  window.location.href = "/Pages/Authentication/loginPage/loginPage.html";
}
if (!userName) {
  window.location.href = "/Pages/Authentication/loginPage/loginPage.html";
}

// Onboarding gate — redirect first-time users (skip if already on onboarding page)
if (!localStorage.getItem('usafe_onboarded') && !window.location.pathname.includes('/Pages/onboarding/')) {
  window.location.href = '/Pages/onboarding/onboarding.html';
}
