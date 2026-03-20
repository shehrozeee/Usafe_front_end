# USafe Frontend — Mobile Web App

## Quick Reference

- **Tech:** Vanilla JS + jQuery 3.7.0 + Bootstrap 4.4.1
- **No build step** — static HTML/JS/CSS served directly
- **API:** `https://usafe.innidata.com` (configured in `Global/URLS.js`)
- **Auth:** Token in localStorage, sent via request headers
- **Language:** Bilingual English/Urdu

## Project Layout

```
Pages/                     # HTML pages
  Authentication/loginPage/  # Login
  reporting/                 # Reports list (main hub after login)
  taskPage/                  # Tasks list
  myProfile/                 # User profile
  reportingType.html         # Select reporting type (7 options)
  Checklist/                 # Checklist wizard
  IncidentReporting/         # Incident/hazard/safe-unsafe forms + SAM
  reportDeatails/            # Report detail view
  guidlines/                 # SAM guidelines
  checklistType.html         # Select checklist sub-type
  EnvironmentalChanges.html  # Environmental reporting types

Js/                        # Core logic
  Authentication/            # Login.js, CheckUser.js, ForgetPassword.js
  Common/Initials.js         # Renders initial common fields
  Common/Teminal.js          # Renders terminal common fields
  GenericQuestioneerProcessor.js  # Checklist wizard logic
  DcaChecklistType.js        # Checklist type selection
  ReportingType.js           # Reporting type rendering
  myTasks.js                 # Task list + status changes
  ReportDetails.js           # Report detail view

Templates/                 # HTML generators (return template strings)
  GenericCheckList.js        # Checklist question template
  Header.js                  # Page header
  initialCommon.js           # Common header fields template
  TerminalCommon.js          # Common footer fields template
  reports.js                 # Report card template
  ReportingType.js           # Reporting type card template
  safeUnsafeActs.js          # Safe/Unsafe acts form

Helpers/
  HttpHandler.js             # jQuery AJAX wrapper (adds token/email headers)
  FormDataHandler.js         # Form value collection + validation
  LocalStorage.js            # localStorage get/set helpers

Components/                # Reusable UI
  floatBtn/                  # "+" floating action button → reportingType
  taskBar/                   # Bottom nav: Reports | Tasks | Profile
  reportCount/               # Report count display
  tasks/                     # Task list rendering

Global/URLS.js             # API base URL constant

configuration/             # JSON form configs
  CheckListQuestions.json    # DCA + Planned Inspection questions
  InitialCommonFields.json   # Header fields (Department, Area, Description, Date, Time)
  TerminalCommonFields.json  # Footer fields (Photo, Responsibility)
  ReportingTypes.json        # 7 reporting entry points
  cascadedList.json          # Department → Area dropdown data
  environmentalReporting.json # Environmental reporting subset
```

## Navigation Flow

```
Login → reporting.html (main hub)
  ├── "+" button → reportingType.html → form pages
  ├── Reports tab → reporting.html (list)
  ├── Tasks tab → taskPage.html (list)
  └── Profile tab → myProfile.html
```

## Key Patterns

- **No router** — direct `window.location.href` navigation with query params (`?heading=`, `?entity=`, `?id=`)
- **CheckUser.js** runs on every page load — validates session, redirects to login if expired
- **Cascaded dropdowns** — Department → Area → Responsibility, populated via API calls
- **Checklist wizard** — multi-step: one question at a time, Next/Back/Skip, result accordion, validation before submit
- **HttpHandler.js** — all API calls go through this; auto-attaches `token` and `email` headers; 401 triggers logout
- **FormDataHandler.js** — collects form values, validates required fields, handles file uploads as FormData
- **Session:** 1-day expiry stored in localStorage
