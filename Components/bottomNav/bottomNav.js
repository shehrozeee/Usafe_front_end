// USafe Bottom Navigation — shared across all pages
// Auto-detects active tab from current URL

const renderBottomNav = () => {
  const path = window.location.pathname.toLowerCase();

  const tabs = [
    { label: 'Home', icon: 'fas fa-home', href: '/Pages/reporting/reporting.html', match: ['reporting/reporting', 'reportingtype'] },
    { label: 'Checklists', icon: 'fas fa-clipboard-check', href: '/Pages/checklistType.html', match: ['checklisttype', 'checklist/generic'], onclick: "localStorage.setItem('sectionFor','UPL Safety Checklists');" },
    { label: 'Tasks', icon: 'fas fa-tasks', href: '/Pages/taskPage/taskPage.html', match: ['taskpage'] },
    { label: 'Profile', icon: 'fas fa-user-circle', href: '/Pages/myProfile/myProfile.html', match: ['myprofile'] },
  ];

  const html = tabs.map(tab => {
    const isActive = tab.match.some(m => path.includes(m));
    const onclick = tab.onclick ? `onclick="${tab.onclick}"` : '';
    return `<a href="${tab.href}" ${onclick} class="usafe-bnav-tab ${isActive ? 'active' : ''}">
      <i class="${tab.icon}"></i>
      <span>${tab.label}</span>
    </a>`;
  }).join('');

  // Inject nav and styles
  document.body.insertAdjacentHTML('beforeend', `
    <nav class="usafe-bnav">${html}</nav>
    <style>
      body { padding-bottom: 72px !important; }
      .usafe-bnav {
        position: fixed; bottom: 0; left: 0; right: 0;
        background: #ffffff;
        display: flex; justify-content: space-around; align-items: center;
        padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
        box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
        z-index: 500;
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      .usafe-bnav-tab {
        display: flex; flex-direction: column; align-items: center;
        text-decoration: none;
        color: #aaa;
        font-size: 11px; font-weight: 600;
        gap: 3px;
        padding: 6px 14px;
        border-radius: 12px;
        transition: color 0.2s, background 0.2s;
      }
      .usafe-bnav-tab i { font-size: 20px; }
      .usafe-bnav-tab:hover { text-decoration: none; color: #e5a100; }
      .usafe-bnav-tab.active {
        color: #f5b700;
        background: rgba(245, 183, 0, 0.08);
      }
    </style>
  `);
};

// Auto-render on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBottomNav);
} else {
  renderBottomNav();
}
