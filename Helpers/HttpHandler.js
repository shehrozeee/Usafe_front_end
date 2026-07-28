// ── Error reporting ─────────────────────────────────────────────────────────
// Every failure used to end as "some error occured", which told the user nothing
// and left us nothing to debug. Now the user gets a message that says what
// happened, and — when signed in — the details go to the server log too, so a
// screenshot is enough for us to find the entry.

const CLIENT_LOG_URL = "api/diagnostics/clientlog";

const isAuthenticated = () =>
  !!localStorage.getItem("token") && !!localStorage.getItem("userName");

// Cap reports per page load so a loop cannot flood the log. A simple in-flight
// lock would have been smaller, but it silently drops the second of two errors
// that happen together — which is exactly when we most want both.
const MAX_REPORTS_PER_PAGE = 10;
let _reportsSent = 0;

const reportErrorToServer = (details) => {
  if (!isAuthenticated()) return;
  if (_reportsSent >= MAX_REPORTS_PER_PAGE) return;
  // A failure while reporting must never report itself.
  if ((details.url || "").indexOf(CLIENT_LOG_URL) !== -1) return;

  _reportsSent++;
  try {
    $.ajax({
      url: `${serverURL}/${CLIENT_LOG_URL}`,
      method: "POST",
      contentType: "application/json",
      headers: {
        token: localStorage.getItem("token"),
        email: localStorage.getItem("userName"),
      },
      data: JSON.stringify({
        message: String(details.message || "unknown error").slice(0, 1000),
        page: window.location.pathname + window.location.search,
        url: details.url || "",
        status: details.status || 0,
        stack: String(details.stack || "").slice(0, 4000),
        userAgent: navigator.userAgent,
      }),
    });
  } catch (e) {
    // Reporting must never break the page it is reporting about.
  }
};

/** The server's own message and reference, when it sent JSON. */
const serverError = (xhr) => {
  let body = xhr.responseJSON;
  if (!body && xhr.responseText) {
    try {
      body = JSON.parse(xhr.responseText);
    } catch (e) {
      body = null;
    }
  }
  if (!body || typeof body !== "object") return {};
  return { message: body.message, reference: body.reference };
};

/** A message that says what actually happened and what to do about it. */
const describeHttpError = (xhr) => {
  const fromServer = serverError(xhr);

  if (xhr.status === 0) {
    return {
      text: "You appear to be offline. Check your connection and try again — your details are still on screen.",
      reference: null,
    };
  }

  let text;
  switch (xhr.status) {
    case 400:
      text =
        fromServer.message ||
        "Some details are missing or not valid. Please check the form and try again.";
      break;
    case 403:
      text =
        fromServer.message ||
        "You do not have access to this. If you think you should, ask your site manager.";
      break;
    case 404:
      text = fromServer.message || "We could not find that — it may have been removed.";
      break;
    case 413:
      text = "That photo is too large. Please take or choose a smaller one.";
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      text =
        fromServer.message ||
        "Something went wrong on our side. Please try again in a moment.";
      break;
    default:
      text =
        fromServer.message ||
        `Something went wrong (error ${xhr.status}). Please try again.`;
  }

  return { text, reference: fromServer.reference || null };
};

/** Shared failure path for both request helpers. */
const handleRequestError = (xhr, url) => {
  if (xhr.status === 401) {
    localStorage.clear();
    swal
      .fire({
        title: "Session expired",
        text: "Please sign in again to continue.",
        icon: "warning",
        confirmButtonText: "Sign in",
      })
      .then(() => {
        window.location.href = "/Pages/Authentication/loginPage/loginPage.html";
      });
    return;
  }

  // Re-enable whatever the user pressed so they can retry.
  $("button").attr("disabled", false);
  $("#load").hide();

  const described = describeHttpError(xhr);

  reportErrorToServer({
    message: `HTTP ${xhr.status} on ${url} — ${described.text}`,
    url: url,
    status: xhr.status,
    stack: String(xhr.responseText || "").slice(0, 2000),
  });

  swal.fire({
    title: "That did not work",
    text: described.reference
      ? `${described.text}\n\nReference: ${described.reference}`
      : described.text,
    icon: "error",
    confirmButtonText: "OK",
  });
};

const sendRequest = (url, method, body, successCallback) => {
  $.ajax({
    url: `${serverURL}/${url}`,
    method: method || "GET",
    data: body || {},
    contentType: "application/json",
    //add headers
    headers: {
      token: localStorage.getItem("token"),
      email : localStorage.getItem("userName")
    },
    success: successCallback
      ? successCallback
      : (data) => {
          swalSuccess("Data Saved Successfully");
        },
    error: (xhr) => handleRequestError(xhr, url),
  });
};

const sendRequestWithFiles = (url, method, body, successCallback) => {
  $.ajax({
    url: `${serverURL}/${url}`,
    method: method || "GET",
    data: body || {},
    processData: false,
    contentType: false,
    headers: {
      token: localStorage.getItem("token"),
      email : localStorage.getItem("userName")
    },
    success: successCallback
      ? successCallback
      : (data) => {
          swalSuccess("Data Saved Successfully");
        },
    error: (xhr) => handleRequestError(xhr, url),
  });
};

const swalNotification = (message, type) => {
  swal.fire({
    title: type == "success" ? "Done!" : "Hold on",
    text: message,
    icon: type,
    confirmButtonText: "OK",
  });
};

function swalSuccess(message) {
  if (typeof celebrate === 'function') {
    celebrate(message);
    return;
  }
  swal.fire({
    title: "Saved Successfully",
    text: message,
    icon: "success",
    showCancelButton: false,
    confirmButtonText: "Continue",
  }).then((result) => {
    if (result.isConfirmed) {
      window.location.href = "/Pages/reporting/reporting.html";
    }
  });
}

// ── Uncaught client-side errors ─────────────────────────────────────────────
// A crash in page code never reached us before; it just left a dead button.
window.addEventListener("error", (event) => {
  reportErrorToServer({
    message: event.message || "Uncaught error",
    url: `${event.filename || "?"}:${event.lineno || 0}`,
    stack: (event.error && event.error.stack) || "",
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason || {};
  reportErrorToServer({
    message: "Unhandled promise rejection: " + (reason.message || String(reason)),
    stack: reason.stack || "",
  });
});
