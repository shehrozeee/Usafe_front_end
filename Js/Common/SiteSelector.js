/**
 * Agency (site) picker for multi-site users.
 *
 * A user assigned to more than one site picks which agency they are reporting
 * for. The choice lives in localStorage (siteId + siteName) and every form
 * reads it at submit time, so switching here changes what the next report is
 * filed against.
 *
 * Users with a single site see nothing new — every render function below is a
 * no-op for them.
 */

const getAssignedSites = () => {
  try {
    const sites = JSON.parse(localStorage.getItem("sites") || "[]");
    return Array.isArray(sites) ? sites.filter(s => s && s.siteName) : [];
  } catch (e) {
    return [];
  }
};

const isMultiSiteUser = () => getAssignedSites().length > 1;

const getActiveSiteName = () => {
  const siteName = localStorage.getItem("siteName");
  if (siteName) return siteName;
  const sites = getAssignedSites();
  return sites.length > 0 ? sites[0].siteName : "";
};

const setActiveSite = (siteId, siteName) => {
  localStorage.setItem("siteId", String(siteId));
  localStorage.setItem("siteName", siteName);
};

/**
 * Option value is the site NAME, not the id — the server stores Department as
 * the agency name, and FormDataHandler submits whatever the element holds.
 * The id rides along in data-site-id for the localStorage update.
 */
const buildSiteOptions = () => {
  const activeId = String(localStorage.getItem("siteId") || "");
  return getAssignedSites()
    .map(s => {
      const selected = String(s.siteId) === activeId ? " selected" : "";
      return `<option value="${s.siteName}" data-site-id="${s.siteId}"${selected}>${s.siteName}</option>`;
    })
    .join("");
};

const onSiteSelectChange = (event) => {
  const option = event.target.options[event.target.selectedIndex];
  if (!option) return;
  setActiveSite(option.dataset.siteId, option.value);
};

/**
 * Swaps a readonly Department input for an agency dropdown, keeping the same
 * id/class so existing form collection and styling keep working.
 * Returns false (and changes nothing) for single-site users.
 */
const renderSiteSelect = (input) => {
  if (!input || !isMultiSiteUser()) return false;

  const select = document.createElement("select");
  select.className = input.className;
  select.id = input.id;
  select.name = input.name || input.id;
  select.innerHTML = buildSiteOptions();
  select.addEventListener("change", onSiteSelectChange);
  input.parentNode.replaceChild(select, input);

  // Keep localStorage and the visible selection in step when the stored
  // siteId is not one of the assigned sites (e.g. access was revoked).
  if (select.selectedIndex < 0) select.selectedIndex = 0;
  onSiteSelectChange({ target: select });

  return true;
};

/**
 * Standalone "Reporting for" bar, for screens with no Department field of
 * their own (the reporting hub, which the checklist wizard and SAM inherit
 * their active site from). Renders nothing for single-site users.
 */
const renderSiteBar = (containerId) => {
  const container = document.getElementById(containerId);
  if (!container || !isMultiSiteUser()) return false;

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;margin-bottom:12px;background:var(--surface,#fff);border:1px solid rgba(0,0,0,0.08);border-radius:14px;">
      <i class="fas fa-building" style="color:#888;"></i>
      <label for="activeSiteSelect" style="margin:0;font-size:13px;color:#888;white-space:nowrap;">Reporting for</label>
      <select id="activeSiteSelect" style="flex:1;border:none;background:transparent;font-size:15px;font-weight:600;color:inherit;outline:none;">
        ${buildSiteOptions()}
      </select>
    </div>`;

  container.querySelector("#activeSiteSelect").addEventListener("change", onSiteSelectChange);
  return true;
};
