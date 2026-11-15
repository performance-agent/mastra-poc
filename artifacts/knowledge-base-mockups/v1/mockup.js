/* Standalone design prototype. No API, OAuth, file reading, or persistence. */
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  building:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1M10 21v-3h4v3"/>',
  palette:
    '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1"/><circle cx="13" cy="7" r="1"/><circle cx="17" cy="11" r="1"/><path d="M12 21c-5-7 8-3 5-7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  folder:
    '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8m-8 4h5"/>',
  book: '<path d="M12 5C7 2 3 4 3 4v15s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1v15"/>',
  plug: '<path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zm6 9v5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v5h18v-5"/>',
  cloud:
    '<path d="M7 18H6a4 4 0 0 1-.6-8A7 7 0 0 1 19 8a5 5 0 0 1 0 10h-2m-5 3V11m-4 4 4-4 4 4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>',
  sync: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
  link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  share: '<path d="M12 4v12m-4-8 4-4 4 4M5 13v8h14v-8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:
    '<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  github:
    '<path d="M9 19c-5 1-5-3-7-3m14 6v-4c0-1-.3-2-1-2 4-.4 6-2 6-6 0-2-.7-3-2-4 .5-1 .5-2 0-3-2 0-3 1-4 2a14 14 0 0 0-6 0C8 4 7 3 5 3c-.5 1-.5 2 0 3-1.3 1-2 2-2 4 0 4 2 5.6 6 6-.7 0-1 1-1 2v4"/>',
};
const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const driveLogo =
  '<svg class="drive-logo" viewBox="0 0 24 24" aria-hidden="true" style="stroke:none"><path fill="#2684fc" d="m8 16-4 7h16l4-7z"/><path fill="#ffcf46" d="m8 2 8 14h8L16 2z"/><path fill="#00ac47" d="M8 2 0 16l4 7L16 2z"/></svg>';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (text, action, kind = "", ico = "") =>
  `<button class="btn ${kind}" data-action="${action}">${ico ? icon(ico) : ""}${text}</button>`;
const badge = (text, kind = "neutral", ico = "") =>
  `<span class="badge ${kind}">${ico ? icon(ico) : ""}${text}</span>`;
const callout = (title, text, kind = "") =>
  `<div class="callout ${kind}">${icon(kind === "warning" ? "warning" : "info")}<p>${title ? `<strong>${title}</strong>` : ""}${text}</p></div>`;
const status = (s) =>
  s === "ready"
    ? badge("Ready", "ready", "check")
    : s === "processing"
      ? badge("Processing", "processing", "sync")
      : badge("Needs attention", "error", "warning");
const fileIcon = (d) =>
  `<span class="file-icon ${d.folder ? "folder" : d.name.endsWith(".pdf") ? "pdf" : "doc"}">${icon(d.folder ? "folder" : "file")}</span>`;
const origin = (source) =>
  `<span class="origin">${source === "Drive" ? driveLogo : icon("upload")}${source === "Drive" ? "Google Drive" : "Uploaded"}</span>`;
const useBadge = (use) =>
  badge(
    use,
    "outline",
    use === "Context" ? "book" : use === "Evidence" ? "file" : "book",
  );
const inherited =
  '<span class="inherited-label">' + icon("share") + "From workspace</span>";

const docs = [
  {
    id: "brief",
    name: "Project brief.pdf",
    folderId: "documentation",
    source: "Upload",
    scope: "workspace",
    use: "Context",
    status: "ready",
    size: "1.2 MB",
    date: "Nov 2, 2026",
    version: "v3 · Nov 2, 2026",
  },
  {
    id: "architecture",
    name: "Architecture decisions.docx",
    folderId: "technical",
    source: "Upload",
    scope: "workspace",
    use: "Both",
    status: "ready",
    size: "840 KB",
    date: "Nov 2, 2026",
    version: "v2 · Nov 2, 2026",
  },
  {
    id: "rubric",
    name: "Evaluation rubric",
    folderId: "course",
    source: "Drive",
    scope: "workspace",
    use: "Context",
    status: "ready",
    size: "Google Docs",
    date: "Synced 5 min ago",
    version: "Drive revision 12 · Nov 3, 2026",
  },
  {
    id: "slides",
    name: "Workshop slides.pdf",
    folderId: "course",
    source: "Drive",
    scope: "workspace",
    use: "Context",
    status: "processing",
    size: "4.8 MB",
    date: "Synced just now",
    version: "Drive revision 3 · Nov 3, 2026",
  },
  {
    id: "restricted",
    name: "Delivery checklist",
    folderId: "course",
    source: "Drive",
    scope: "workspace",
    use: "Context",
    status: "error",
    size: "Google Docs",
    date: "Access unavailable",
    version: "Unavailable",
  },
  {
    id: "sprint",
    name: "Sprint 04 review.pdf",
    folderId: "deliverables",
    source: "Upload",
    scope: "project",
    use: "Evidence",
    status: "ready",
    size: "2.4 MB",
    date: "Nov 3, 2026",
    version: "v1 · Nov 3, 2026",
  },
  {
    id: "retrospective",
    name: "Retrospective notes.docx",
    folderId: "deliverables",
    source: "Upload",
    scope: "project",
    use: "Both",
    status: "ready",
    size: "320 KB",
    date: "Nov 3, 2026",
    version: "v1 · Nov 3, 2026",
  },
];
const folders = [
  {
    id: "documentation",
    name: "Documentation",
    scope: "workspace",
    source: "Upload",
  },
  {
    id: "technical",
    name: "Technical decisions",
    parentId: "documentation",
    scope: "workspace",
    source: "Upload",
  },
  {
    id: "course",
    name: "Course materials",
    scope: "workspace",
    source: "Drive",
  },
  {
    id: "deliverables",
    name: "Deliverables",
    scope: "project",
    source: "Upload",
  },
];
const screens = [
  ["workspace", "01 · Workspace knowledge base"],
  ["project", "02 · Project knowledge base"],
  ["upload", "03 · Upload files"],
  ["drive", "04 · Connect Google Drive"],
  ["detail", "05 · Document details"],
  ["connections", "06 · Drive connections"],
  ["sources", "07 · Select report sources"],
  ["report", "08 · Saved report sources"],
  ["empty", "09 · Empty knowledge base"],
  ["plugins", "10 · Plugin resources"],
  ["sources-partial", "11 · Partial folder selection"],
  ["sources-none", "12 · No knowledge selected"],
  ["drive-expired", "13 · Reconnect Google Drive"],
  ["upload-done", "14 · Upload result"],
  ["detail-unavailable", "15 · Source access lost"],
];
const state = {
  screen: "workspace",
  scope: "workspace",
  folder: "all",
  query: "",
  sourceFilter: "all",
  selected: new Set(),
  excluded: new Set(),
  docId: "brief",
  driveSelected: new Set(["drive-course", "drive-objectives"]),
  driveAccount: "alex@example.test",
  driveConnected: false,
  uploadUse: "Context",
  uploaded: false,
  uploadQueue: null,
  connectedItems: [],
  snapshot: null,
};
let toastTimer;
let dialogTrigger;
function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = "none"), 3800);
}
function go(screen) {
  if (location.hash === "#" + screen) enterScreen(screen);
  else location.hash = screen;
}
function eligible() {
  return docs.filter((d) => d.status === "ready" && !state.excluded.has(d.id));
}
function selectedDocs() {
  return eligible().filter((d) => state.selected.has(d.id));
}
function insideFolder(folderId, ancestorId) {
  let current = folderId;
  while (current) {
    if (current === ancestorId) return true;
    current = folders.find((f) => f.id === current)?.parentId;
  }
  return false;
}
function folderDocuments(id) {
  return docs.filter((d) => insideFolder(d.folderId, id));
}
function enterScreen(screen) {
  state.screen = screens.some(([id]) => id === screen) ? screen : "workspace";
  if (["workspace", "project", "empty", "plugins"].includes(state.screen)) {
    state.scope = state.screen === "project" ? "project" : "workspace";
    state.folder = "all";
    state.query = "";
    state.sourceFilter = "all";
  }
  if (state.screen.startsWith("sources")) {
    state.scope = "project";
    state.query = "";
    state.selected = new Set(eligible().map((d) => d.id));
    if (state.screen === "sources-partial")
      state.selected.delete("architecture");
    if (state.screen === "sources-none") state.selected.clear();
  }
  if (state.screen === "report") state.scope = "project";
  if (state.screen === "detail-unavailable") state.docId = "restricted";
  if (state.screen === "upload-done") state.uploaded = true;
  if (state.screen === "upload") state.uploaded = false;
  render();
  window.scrollTo(0, 0);
}
function shell(content, reportTab = false) {
  const project = state.scope === "project";
  const tabs = project
    ? ["Overview", "Evaluators", "Reports", "Rules", "Members", "Resources"]
    : ["Overview", "Groups", "People", "Members", "Resources"];
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><span>Organizations</span>${icon("chevron")}<span>Northstar Studio</span>${icon("chevron")}<a href="#workspace">Product &amp; Engineering</a>${project ? icon("chevron") + "<span>Platform team</span>" : ""}</nav>
  <section class="entity-header"><span class="avatar">${project ? "PT" : "P&"}</span><div class="grow"><div class="row"><h1>${project ? "Platform team" : "Product &amp; Engineering"}</h1><span class="star">${icon("star")}</span></div><p>${project ? "A shared view of the project, its people and its progress." : "Shared context for teams building what comes next."}</p></div><span class="badge outline">${project ? "Project" : "Workspace"}</span></section>
  <nav class="tabs" aria-label="Context navigation">${tabs.map((t) => `<button class="tab ${t === (reportTab ? "Reports" : "Resources") ? "active" : ""}" data-action="tab:${t}" ${t === (reportTab ? "Reports" : "Resources") ? 'aria-current="page"' : ""}>${t}${["Groups", "Members"].includes(t) ? `<span class="tab-count">${t === "Groups" ? "3" : "8"}</span>` : ""}</button>`).join("")}</nav>${content}`;
}
function segments(plugins = false) {
  return `<div class="segmented" aria-label="Resource categories"><button class="${plugins ? "" : "active"}" data-action="category:knowledge" aria-pressed="${!plugins}">${icon("book")}Knowledge base <span class="count">${state.screen === "empty" ? 0 : docs.filter((d) => state.scope === "project" || d.scope === "workspace").length}</span></button><button class="${plugins ? "active" : ""}" data-action="category:plugins" aria-pressed="${plugins}">${icon("plug")}Plugin resources <span class="count">2</span></button></div>`;
}
function addMenu() {
  return `<div class="dropdown">${btn("Add sources " + icon("down"), "add-menu", "primary", "plus")}<div class="menu hide" id="add-menu">${[
    "Upload files|upload|upload",
    "Connect Google Drive|drive|link",
    "New folder|new-folder|folder",
  ]
    .map((item) => {
      const [t, a, i] = item.split("|");
      return `<button data-action="${a === "new-folder" ? a : "go:" + a}">${icon(i)}${t}</button>`;
    })
    .join("")}</div></div>`;
}
function sidebar() {
  const visibleFolders =
    state.screen === "empty"
      ? []
      : folders.filter(
          (f) => state.scope === "project" || f.scope === "workspace",
        );
  return `<aside class="folder-sidebar" aria-label="Knowledge folders"><div class="eyebrow">Library</div><button class="folder-link ${state.folder === "all" ? "active" : ""}" data-action="folder:all">${icon("book")}All sources<span class="count">${state.screen === "empty" ? 0 : docs.filter((d) => state.scope === "project" || d.scope === "workspace").length}</span></button>${visibleFolders.map((f) => `<button class="folder-link ${f.parentId ? "indent" : ""} ${state.folder === f.id ? "active" : ""}" data-action="folder:${f.id}">${icon("folder")}${esc(f.name)}${f.source === "Drive" ? icon("link") : ""}</button>`).join("")}<div class="sidebar-bottom"><button class="folder-link" data-action="go:connections">${icon("link")}Connections${badge(state.screen === "empty" ? "0" : "1", "neutral")}</button><button class="folder-link" data-action="new-folder">${icon("plus")}New folder</button></div><div class="sidebar-note">${icon("shield")}<br/>${state.scope === "project" ? "Workspace sources are shared here without making another copy." : "Sources in this workspace are available to its projects automatically."}</div></aside>`;
}
function folderRows() {
  if (state.query || state.sourceFilter !== "all") return "";
  return folders
    .filter(
      (f) =>
        (state.scope === "project" || f.scope === "workspace") &&
        (state.folder === "all" ? !f.parentId : f.parentId === state.folder),
    )
    .map((f) => {
      const count = folderDocuments(f.id).length;
      return `<tr><td><button class="row" data-action="folder:${f.id}">${fileIcon({ folder: true })}<span class="file-name">${esc(f.name)}<span class="file-sub">${count} documents${f.source === "Drive" ? " · Connected folder" : ""}${state.scope === "project" && f.scope === "workspace" ? " · From workspace" : ""}</span></span></button></td><td class="col-origin">${f.source === "Drive" ? origin("Drive") : '<span class="origin">Platform folder</span>'}</td><td class="col-usage"><span class="muted">—</span></td><td class="col-status">${f.source === "Drive" ? badge("Auto-sync on", "ready", "sync") : badge("Folder", "neutral")}</td><td class="col-action">${btn('<span class="sr-only">Open ' + esc(f.name) + "</span>", "folder:" + f.id, "icon ghost", "chevron")}</td></tr>`;
    })
    .join("");
}
function libraryRows() {
  let list = docs.filter(
    (d) => state.scope === "project" || d.scope === "workspace",
  );
  if (state.folder !== "all")
    list = list.filter((d) => d.folderId === state.folder);
  if (state.query)
    list = list.filter((d) =>
      d.name.toLowerCase().includes(state.query.toLowerCase()),
    );
  if (state.sourceFilter !== "all")
    list = list.filter((d) => d.source === state.sourceFilter);
  return (
    folderRows() +
      list
        .map(
          (d) =>
            `<tr class="${state.scope === "project" && state.excluded.has(d.id) ? "excluded" : ""}"><td><button class="row" data-action="detail:${d.id}">${fileIcon(d)}<span class="file-name">${esc(d.name)}<span class="file-sub">${d.size} · ${state.scope === "project" && d.scope === "workspace" ? "From workspace · " : ""}${d.source === "Drive" ? "Google Drive · " : ""}${d.date}</span></span></button></td><td class="col-origin">${origin(d.source)}</td><td class="col-usage">${useBadge(d.use)}</td><td class="col-status">${status(d.status)}</td><td class="col-action">${state.scope === "project" && d.scope === "workspace" ? `<button class="exclude-btn" data-action="exclude:${d.id}" aria-label="${state.excluded.has(d.id) ? "Include" : "Exclude"} ${esc(d.name)}">${state.excluded.has(d.id) ? "Include" : "Exclude"}</button>` : btn('<span class="sr-only">Open ' + esc(d.name) + "</span>", "detail:" + d.id, "icon ghost", "chevron")}</td></tr>`,
        )
        .join("") ||
    '<tr><td colspan="5"><div class="empty"><h3>No sources found</h3><p>Try a different search or origin filter.</p></div></td></tr>'
  );
}
function library(empty = false) {
  const project = state.scope === "project";
  return shell(
    `${segments()}<div class="section-head"><div><h2>Knowledge base</h2><p>${project ? "Project documents and shared workspace knowledge, ready for your next report." : "Give every report the context it needs. Organize documents and keep Drive folders connected."}</p></div>${addMenu()}</div>${project ? callout("Shared knowledge, in the right context", "Workspace sources are included automatically. Exclude any that do not apply to this project. Your report selection stays under your control.") : ""}<div class="knowledge-layout">${sidebar()}<section><div class="toolbar"><label class="search">${icon("search")}<input aria-label="Search knowledge sources" placeholder="Search files and folders…" id="library-search" value="${esc(state.query)}"/></label><select class="filter" id="source-filter" aria-label="Filter by origin"><option value="all">All origins</option><option value="Upload">Uploaded files</option><option value="Drive">Google Drive</option></select><span class="spacer"></span>${project ? btn("Report sources", "go:sources", "", "book") : btn("Connections", "go:connections", "", "link")}</div><div class="panel"><div class="table-top"><div class="path">${icon(state.folder === "all" ? "book" : "folder")}<button data-action="folder:all">All sources</button>${state.folder !== "all" ? icon("chevron") + "<strong>" + esc(folders.find((f) => f.id === state.folder)?.name || "Folder") + "</strong>" : ""}</div><div class="mini-stats"><span>${icon("checkcircle")}${docs.filter((d) => d.status === "ready" && (project || d.scope === "workspace")).length} ready</span><span>${icon("sync")}Auto-sync enabled</span></div></div>${empty ? `<div class="empty"><span class="empty-icon">${icon("book")}</span><h3>A little context goes a long way</h3><p>Add project briefs, reference material or deliverables. Your teams can use them as context and evidence in their reports.</p><div class="row">${btn("Upload files", "go:upload", "primary", "upload")}${btn("Connect Google Drive", "go:drive", "", "link")}</div><button class="text-link" style="margin-top:17px" data-action="new-folder">Or start with a folder</button></div>` : `<table class="resource-table"><thead><tr><th>Name</th><th class="col-origin">Origin</th><th class="col-usage">Report use</th><th class="col-status">Status</th><th class="col-action"><span class="sr-only">Actions</span></th></tr></thead><tbody id="library-rows">${libraryRows()}</tbody></table>`}<div class="panel-foot">${icon("info")}${project ? "Review and adjust selected sources before generating each report." : "Workspace knowledge is automatically available to all projects in this workspace."}</div></div></section></div>`,
  );
}
function workflowTop(title) {
  return `<div class="workflow-top"><a href="#${state.scope === "project" ? "project" : "workspace"}">${icon("back")}Knowledge base</a>${icon("chevron")}<span>${title}</span></div>`;
}
function usageAside() {
  return `<aside class="panel aside-note"><h3>How will this be used?</h3><div class="usage-item">${icon("book")}<div><strong>Context</strong><span>Goals, requirements and reference material that help interpret the project.</span></div></div><div class="usage-item">${icon("file")}<div><strong>Evidence</strong><span>Deliverables and records that can support report findings.</span></div></div><div class="usage-item">${icon("book")}<div><strong>Both</strong><span>Documents that provide background and demonstrate work.</span></div></div><div class="side-summary">Sources are selected by default when starting a report. You can deselect any file or folder.</div></aside>`;
}
function upload() {
  const done = state.uploaded;
  const queue = state.uploadQueue || [
    {
      name: "Project brief.pdf",
      size: "1.2 MB",
      status: done ? "ready" : "queued",
    },
    {
      name: "Architecture decisions.docx",
      size: "840 KB",
      status: done ? "processing" : "uploading",
    },
    { name: "Interview notes.pdf", size: "620 KB", status: "failed" },
  ];
  return shell(
    `${workflowTop("Upload files")}<div class="workflow-layout"><section class="panel workflow-card"><div class="step-label">Add knowledge</div><h2>Upload files</h2><p>Bring your references and deliverables into one place.</p><div class="fields"><label class="field"><span>Destination folder</span><select id="upload-destination"><option>Documentation</option><option>Course materials</option>${state.scope === "project" ? "<option>Deliverables</option>" : ""}</select></label><label class="field"><span>Use in reports</span><select id="upload-use">${["Context", "Evidence", "Both"].map((v) => `<option ${state.uploadUse === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><label class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Choose demo files"><span class="upload-icon">${icon("upload")}</span><strong>Drop files here, or <span>browse files</span></strong><small>Multiple files supported · Demo: names only, no content is read</small><input id="file-input" type="file" multiple hidden /></label><div style="margin-top:20px" class="row between"><span class="eyebrow">${queue.length} files in this upload</span><span class="caption">${done ? "Upload complete · 1 needs attention" : "Each file can be retried separately"}</span></div>${queue.map((d, i) => `<div class="upload-file">${fileIcon(d)}<div class="grow"><div class="row between"><span class="file-name">${esc(d.name)}</span>${d.status === "failed" ? badge("Upload failed", "error") : d.status === "queued" ? badge("Ready to upload", "neutral") : d.status === "uploading" ? badge("Uploading · 68%", "processing") : status(d.status)}</div><span class="file-sub">${d.size} · ${esc(state.uploadUse)}</span>${d.status === "uploading" ? '<div class="progress"><span style="width:68%"></span></div><small>Uploading to Documentation…</small>' : ""}${d.status === "failed" ? `<div class="row between" style="margin-top:9px"><small class="danger">Connection interrupted. Your other files are safe.</small><button class="text-link" data-action="retry-upload:${i}">Retry</button></div>` : ""}${d.status === "processing" ? '<span class="file-sub">Preparing this document for reports…</span>' : ""}</div></div>`).join("")}<div class="actions"><span class="muted spacer caption">${done ? "Ready files are available in your knowledge base." : "Files become available after processing."}</span>${btn("Cancel", "go:" + state.scope, "ghost")}${btn(done ? "Back to knowledge base" : "Upload files", done ? "go:" + state.scope : "simulate-upload", "primary", done ? "check" : "upload")}</div></section>${usageAside()}</div>`,
  );
}
function drive() {
  const expired = state.screen === "drive-expired";
  const entries = [
    [
      "drive-course",
      "Course materials",
      "folder",
      "3 documents · Folder and subfolders",
    ],
    ["drive-admin", "Administration", "folder", "8 documents"],
    ["drive-objectives", "Project objectives", "file", "Google Docs"],
    ["drive-notes", "Research notes", "file", "Google Docs"],
  ];
  return shell(
    `${workflowTop("Google Drive")}<div class="workflow-layout"><section class="panel workflow-card"><div class="step-label">Connected knowledge</div><h2>Connect Google Drive</h2><p>Choose the files and folders you want to use in reports.</p><div class="drive-account">${driveLogo}<div class="grow"><strong>${esc(state.driveAccount)}</strong><small>${expired ? "Authorization expired" : "Google Drive account · Demo connection"}</small></div>${btn(expired ? "Reconnect" : "Change account", expired ? "reconnect" : "change-account", expired ? "primary" : "ghost")}</div>${expired ? callout("Reconnect to continue", "Your authorization has expired. Reconnect this account to browse and synchronize its sources.", "warning") : ""}<label class="search" style="max-width:none;margin-bottom:15px">${icon("search")}<input id="drive-search" placeholder="Search in Google Drive…" aria-label="Search in Google Drive" ${expired ? "disabled" : ""}/></label><div class="picker-list"><div class="picker-path">${driveLogo}My Drive${icon("chevron")}<span>Northstar Studio</span></div>${entries.map(([id, name, type, sub]) => `<label class="picker-row" data-drive-name="${name.toLowerCase()}"><input class="check" type="checkbox" data-drive-id="${id}" ${state.driveSelected.has(id) ? "checked" : ""} ${expired ? "disabled" : ""} aria-label="Connect ${name}"/>${fileIcon({ name, folder: type === "folder" })}<span class="grow"><strong>${name}</strong><small>${sub}</small></span>${type === "folder" ? badge("Auto-sync", "ready", "sync") : ""}</label>`).join("")}</div><div class="sync-notice">${icon("sync")}<span>Automatic sync keeps connected files up to date. New documents and subfolders inside connected folders are included too.</span></div><div class="fields"><label class="field"><span>Add to folder</span><select id="drive-destination"><option>Course materials</option><option>Documentation</option></select></label><label class="field"><span>Use in reports</span><select id="drive-use"><option>Context</option><option>Evidence</option><option>Both</option></select></label></div><div class="actions"><span class="caption spacer" id="drive-count">${state.driveSelected.size} items selected</span>${btn("Cancel", "go:" + state.scope, "ghost")}<button class="btn primary" data-action="connect-drive" ${expired || !state.driveSelected.size ? "disabled" : ""}>${icon("link")}Connect selected</button></div></section><aside class="panel aside-note"><h3>A connection that stays current</h3><div class="usage-item">${icon("folder")}<div><strong>Keep your structure</strong><span>Connected folders keep their Drive hierarchy and are labeled with their origin.</span></div></div><div class="usage-item">${icon("sync")}<div><strong>Stay up to date</strong><span>See the last synchronization and update on demand.</span></div></div><div class="usage-item">${icon("shield")}<div><strong>Review before generating</strong><span>Only ready sources can be selected. Existing reports keep their original source references.</span></div></div><div class="side-summary">This preview uses a fictional account and picker. It does not request access to Google Drive.</div></aside></div>`,
  );
}
function detail() {
  const d = docs.find((d) => d.id === state.docId) || docs[0];
  const shared = state.scope === "project" && d.scope === "workspace";
  return shell(
    `${workflowTop(d.name)}<div class="section-head"><div class="row">${fileIcon(d)}<div><h2>${esc(d.name)}</h2><p>${d.source === "Drive" ? "Google Drive" : "Uploaded file"} · ${d.size}${shared ? " · Shared from workspace" : ""}</p></div></div>${status(d.status)}</div><div class="detail-layout"><section class="document-preview"><article class="paper"><div class="eyebrow">${d.source === "Drive" ? "Connected document" : "Document preview"} · Fictional content</div><h2>${esc(d.name.replace(/\.(pdf|docx)$/, ""))}</h2><p>Platform team · Product &amp; Engineering</p><h3>01 / Purpose and expected outcomes</h3><p>The platform brings project context and team activity together to support a clear, traceable review of progress.</p><h3>02 / What a successful delivery looks like</h3><ul><li>Document the decisions behind each milestone.</li><li>Connect findings to the work that supports them.</li><li>Make limitations and missing information visible.</li></ul><h3>03 / Review approach</h3><p>Read deliverables alongside the project requirements. Reference material explains the goals; evidence supports conclusions about the work.</p><div class="paper-footer"><span>NORTHSTAR STUDIO · DEMONSTRATION DOCUMENT</span><span>1 / 3</span></div></article></section><aside class="panel panel-pad detail-aside"><h3>Source details</h3><dl>${[
      ["Origin", d.source === "Drive" ? "Google Drive" : "Direct upload"],
      [
        "Location",
        folders.find((f) => f.id === d.folderId)?.name || "Documentation",
      ],
      ["Scope", d.scope === "workspace" ? "Workspace" : "Project"],
      ["Version", d.version],
      ["Status", status(d.status)],
    ]
      .map(([k, v]) => `<div class="metadata"><dt>${k}</dt><dd>${v}</dd></div>`)
      .join(
        "",
      )}</dl><label class="field"><span>Use in reports</span><select id="detail-use" ${shared ? "disabled" : ""}>${["Context", "Evidence", "Both"].map((v) => `<option ${d.use === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><p>Context helps interpret the project. Evidence can support findings. Choose Both when the document serves both purposes.</p>${shared ? `<div class="source-note">${inherited}<p>Changes to this source are managed in its workspace.</p><button class="text-link" data-action="edit-workspace:${d.id}">Edit in workspace ${icon("arrow")}</button></div>` : btn("Save source settings", "save-detail", "primary", "check")}${d.source === "Drive" ? `<div class="source-note"><strong class="row">${icon("sync")}Automatic sync</strong><p>${d.status === "error" ? "Drive access is no longer available. Reconnect the account to restore this source." : "Last synchronized Nov 3, 2026 at 10:35. Connected changes will be reflected in future reports."}</p><button class="text-link" data-action="go:connections">Manage connection</button></div>` : ""}${d.status !== "ready" ? callout("Source not ready", d.status === "processing" ? "Processing is still in progress. This file cannot be selected for a report yet." : "This source cannot be selected until its access is restored.", "warning") : ""}<div class="source-note">${icon("book")} Included by default in new report selections. You can deselect it before generating.</div></aside></div>`,
  );
}
function connections() {
  return shell(
    `${segments()}<div class="section-head"><div><h2>Connections</h2><p>Manage the Drive accounts and folders that keep your knowledge current.</p></div>${btn("Connect Drive", "go:drive", "primary", "plus")}</div><div class="connection-grid"><section class="panel connection"><div class="connection-title">${driveLogo}<div class="grow"><h3>Course materials</h3><p>${esc(state.driveAccount)} · Product &amp; Engineering</p></div>${badge("Connected", "ready", "check")}</div>${state.driveConnected ? callout("Connection added", "Your selected items are connected. Processing and synchronization shown here are simulated.") : ""}<div class="connection-meta"><div>Connected items<strong>${state.connectedItems.length ? state.connectedItems.map(esc).join(", ") : "Course materials · Project objectives"}</strong></div><div>Synchronization<strong>Automatic · Includes subfolders</strong></div><div>Last sync<strong id="last-sync">Nov 3, 2026 · 10:35</strong></div></div><div class="connection-actions">${btn("Sync now", "sync-now", "", "sync")}${btn("Manage sources", "go:drive", "", "folder")}${btn("View documents", "connection-documents", "ghost", "arrow")}</div></section><section class="panel connection"><div class="connection-title">${driveLogo}<div class="grow"><h3>Research references</h3><p>research@example.test</p></div>${badge("Reconnect", "warning", "warning")}</div>${callout("Authorization expired", "Reconnect the account to resume automatic synchronization.", "warning")}<div class="connection-meta"><div>Sources<strong>2 connected documents</strong></div><div>Last sync<strong>Nov 1, 2026 · 15:20</strong></div></div>${btn("Reconnect account", "go:drive-expired", "", "link")}</section><section class="panel connection"><div class="connection-title">${driveLogo}<div class="grow"><h3>Delivery checklist</h3><p>Shared file · Course materials</p></div>${badge("Access lost", "error", "warning")}</div>${callout("This file is no longer accessible", "It cannot be selected for new reports. Existing reports retain their saved references.", "warning")}<div class="connection-meta"><div>Account<strong>${esc(state.driveAccount)}</strong></div><div>Action needed<strong>Restore file permission</strong></div></div>${btn("Review source", "detail:restricted", "", "file")}</section></div>`,
  );
}
function sourceGroup(f) {
  const matches = (d) =>
    !state.excluded.has(d.id) &&
    (!state.query || d.name.toLowerCase().includes(state.query.toLowerCase()));
  const descendants = folderDocuments(f.id).filter(matches);
  if (!descendants.length) return "";
  const list = descendants.filter((d) => d.folderId === f.id);
  const available = descendants.filter((d) => d.status === "ready");
  const children = folders
    .filter((child) => child.parentId === f.id)
    .map(sourceGroup)
    .join("");
  return `<section class="source-group ${f.parentId ? "nested-group" : ""}"><div class="source-group-head"><input type="checkbox" class="check" data-folder-check="${f.id}" aria-label="Select ${f.name}" ${!available.length ? "disabled" : ""}/>${icon("folder")}<span>${esc(f.name)}</span>${f.source === "Drive" ? icon("link") : ""}<span class="spacer"></span><small>${f.parentId ? "Subfolder" : f.scope === "workspace" ? "From workspace" : "Project"}</small></div>${list.map((d) => `<label class="source-row ${d.status !== "ready" ? "unavailable" : ""}"><input class="check" type="checkbox" data-source-id="${d.id}" aria-label="Use ${esc(d.name)}" ${state.selected.has(d.id) && d.status === "ready" ? "checked" : ""} ${d.status !== "ready" ? "disabled" : ""}/>${fileIcon(d)}<span class="grow"><span class="file-name">${esc(d.name)}</span><span class="file-sub">${d.status === "processing" ? "Processing · Available when ready" : d.status === "error" ? "Access lost · Reconnect to use this source" : `${d.source === "Drive" ? "Google Drive" : "Uploaded"} · ${d.scope === "workspace" ? "From workspace" : "Project source"}`}</span></span><span class="source-usage">${useBadge(d.use)}</span>${d.status !== "ready" ? status(d.status) : ""}</label>`).join("")}${children}</section>`;
}
function sourceGroups() {
  return (
    folders
      .filter((f) => !f.parentId)
      .map(sourceGroup)
      .join("") ||
    '<div class="empty"><h3>No matching sources</h3><p>Try a different search. Your selection has been kept.</p></div>'
  );
}
function sourceSummary() {
  const selected = selectedDocs();
  const contexts = selected.filter((d) => d.use !== "Evidence").length;
  const evidences = selected.filter((d) => d.use !== "Context").length;
  return `<h3>Report sources</h3><div class="summary-number">${selected.length}<span>documents selected</span></div><div class="summary-line"><span>Workspace sources</span><strong>${selected.filter((d) => d.scope === "workspace").length}</strong></div><div class="summary-line"><span>Project sources</span><strong>${selected.filter((d) => d.scope === "project").length}</strong></div><div class="divider"></div><div class="summary-line"><span>Provide context</span><strong>${contexts}</strong></div><div class="summary-line"><span>Can support evidence</span><strong>${evidences}</strong></div><p class="caption" style="margin-top:10px">Documents marked Both count in each use, but are included only once.</p><label class="field"><span>Evaluator</span><select aria-label="Report evaluator"><option>Balanced</option></select></label><label class="field"><span>Report period</span><select aria-label="Report period"><option>Oct 1 – Oct 31, 2026</option><option>All available activity</option></select></label>${!selected.length ? callout("No knowledge selected", "This report will use the available GitHub and Jira resources only.", "warning") : `<div class="side-summary">Sources are selected by default. Uncheck anything you do not want this report to use.</div>`}${btn("Generate demo report", "generate-report", "primary", "arrow")}<p class="caption" style="text-align:center;margin-top:9px">Preview only · No AI call is made</p>`;
}
function sources() {
  return shell(
    `${workflowTop("Report sources")}<div class="section-head"><div><h2>Choose what informs this report</h2><p>All ready sources are selected. Deselect any file or folder you do not want to include.</p></div>${badge("Platform team", "outline")}</div><div class="selection-steps"><span class="done"><b class="step-circle">✓</b>Evaluator &amp; period</span>${icon("chevron")}<span class="current"><b class="step-circle">2</b>Knowledge sources</span>${icon("chevron")}<span><b class="step-circle">3</b>Generate report</span></div><div class="selection-layout"><section><div class="usage-key"><span>${icon("book")}Context · Reference and goals</span><span>${icon("file")}Evidence · Material to analyze</span></div><label class="search" style="max-width:none;margin-bottom:14px">${icon("search")}<input id="sources-search" placeholder="Find a source…" aria-label="Find report source" value="${esc(state.query)}"/></label><div class="panel selection-panel"><div class="select-controls"><label><input class="check" type="checkbox" id="select-all" aria-label="Select all ready sources"/>All ready sources</label><span class="spacer"></span><button class="text-link" data-action="select-all">Select all</button><button class="text-link" data-action="select-none">Deselect all</button></div><div id="source-groups">${sourceGroups()}</div><div class="panel-foot">${icon("info")}2 sources unavailable: one is processing and one has lost Drive access.</div></div><div class="plugins-hint">${icon("plug")}<span><strong>Plugin resources stay connected.</strong> GitHub · platform-api and Jira · PLAT follow your existing project configuration.</span></div></section><aside class="panel source-summary" id="source-summary">${sourceSummary()}</aside></div>`,
    true,
  );
}
function savedReport() {
  const snapshot = state.snapshot || {
    docs: docs.filter((d) => d.status === "ready").map((d) => ({ ...d })),
    created: "Nov 3, 2026 · 10:42",
    evaluator: "Balanced",
    period: "Oct 1 – Oct 31, 2026",
  };
  const selected = snapshot.docs;
  const context = selected.find((d) => d.use !== "Evidence");
  const evidence = selected.find((d) => d.use !== "Context");
  const number = (d) => selected.findIndex((s) => s.id === d?.id) + 1;
  return shell(
    `<div class="section-head"><div><div class="eyebrow" style="margin-bottom:8px">Saved report · Demonstration</div><h2>Platform team · October review</h2><p>${snapshot.evaluator} evaluator · ${snapshot.period}</p></div>${btn("New report", "go:sources", "", "plus")}</div><div class="report-layout"><article class="panel report-body"><div class="row between"><h2>A clearer path from decisions to delivery</h2>${badge("Demo report", "neutral")}</div><div class="report-meta">Saved ${snapshot.created} · Source references captured at generation</div>${callout("Fictional report content", "This sample illustrates source attribution and layout. It is not an evaluation of real work.", "neutral")}<h3>Project context</h3><p>${context ? `The project brief emphasizes traceable decisions and explicit delivery goals. This context helps frame the review; it does not by itself prove that the goals were met. <button class="citation" data-action="citation:${context.id}">[${number(context)}]</button>` : "No knowledge documents were selected. Project context in this sample comes from the configured plugin resources."}</p><div class="report-metrics"><div class="report-metric"><small>PRs merged · GitHub</small><strong>18</strong></div><div class="report-metric"><small>Reviews · GitHub</small><strong>24</strong></div><div class="report-metric"><small>Issues completed · Jira</small><strong>12</strong></div></div><h3>Delivery and learning</h3><p>${evidence ? `The selected deliverable records the team's implementation decisions and remaining work. It can support specific findings when read alongside the underlying project activity. <button class="citation" data-action="citation:${evidence.id}">[${number(evidence)}]</button>` : "This example relies on GitHub and Jira activity. No document evidence was selected for this report."}</p><h3>Limitations</h3><p>Unavailable sources were not used. Document content is distinct from provider activity, and reference documents do not automatically count as evidence of completed work.</p></article><aside class="panel panel-pad sources-aside"><div class="row between"><h3>Knowledge used</h3>${badge(selected.length + " documents", "neutral")}</div><p class="caption" style="margin:10px 0 7px">The sources and revisions used for this report.</p>${selected.length ? selected.map((d, i) => `<div class="saved-source"><button class="citation" data-action="citation:${d.id}" aria-label="Open source ${i + 1}">[${i + 1}]</button><div class="grow"><button class="file-name" data-action="citation:${d.id}">${esc(d.name)}</button><small>${esc(d.version)}<br/>${d.scope === "workspace" ? "Workspace" : "Project"} · ${d.source === "Drive" ? "Google Drive" : "Uploaded"}</small><div style="margin-top:6px">${useBadge(d.use)}</div></div></div>`).join("") : '<p class="caption">No knowledge documents were used.</p>'}<div class="source-divider"><h4>Plugin evidence</h4><p class="caption">${icon("github")} GitHub · platform-api<br/>Jira · PLAT</p></div>${callout("Saved references", "Later Drive updates or changes to source selection do not change this report.", "neutral")}</aside></div>`,
    true,
  );
}
function plugins() {
  return shell(
    `${segments(true)}<div class="section-head"><div><h2>Plugin resources</h2><p>Activity sources provided by installed plugins. Manage documents and Drive separately in Knowledge base.</p></div>${btn("Knowledge base", "category:knowledge", "", "book")}</div><div class="plugin-grid"><section class="panel plugin-card"><div class="row">${icon("github")}<h3>platform-api</h3><span class="spacer"></span>${badge("Assigned", "ready")}</div><p>GitHub repository · northstar/platform-api</p><div class="divider"></div><div class="mini-stats"><span>Commits</span><span>Pull requests</span><span>Reviews</span></div></section><section class="panel plugin-card"><div class="row">${icon("plug")}<h3>PLAT</h3><span class="spacer"></span>${badge("Assigned", "ready")}</div><p>Jira project · Platform team</p><div class="divider"></div><div class="mini-stats"><span>Issues</span><span>Sprints</span><span>Project activity</span></div></section></div><div style="margin-top:22px">${callout("Connections belong to their resource type", "Google Drive accounts are managed inside Knowledge base → Connections. GitHub and Jira installations remain in the organization’s Plugins area.", "neutral")}</div>`,
  );
}
function render() {
  document.getElementById("screen-picker").value = state.screen;
  document.getElementById("app").dataset.screen = state.screen;
  const s = state.screen;
  document.getElementById("app").innerHTML =
    s === "workspace" || s === "project" || s === "empty"
      ? library(s === "empty")
      : s.startsWith("upload")
        ? upload()
        : s === "drive" || s === "drive-expired"
          ? drive()
          : s.startsWith("detail")
            ? detail()
            : s === "connections"
              ? connections()
              : s.startsWith("sources")
                ? sources()
                : s === "report"
                  ? savedReport()
                  : plugins();
  if (
    s.startsWith("detail") &&
    docs.find((d) => d.id === state.docId)?.status !== "ready"
  ) {
    document.querySelector(
      ".detail-aside > .source-note:last-child",
    ).innerHTML =
      icon("info") +
      " This source can be selected for new reports once it is ready.";
  }
  if (document.getElementById("source-filter"))
    document.getElementById("source-filter").value = state.sourceFilter;
  if (s.startsWith("sources")) syncChecks();
}
function syncChecks() {
  for (const input of document.querySelectorAll("[data-folder-check]")) {
    const items = folderDocuments(input.dataset.folderCheck).filter(
      (d) =>
        d.status === "ready" &&
        !state.excluded.has(d.id) &&
        (!state.query ||
          d.name.toLowerCase().includes(state.query.toLowerCase())),
    );
    const n = items.filter((d) => state.selected.has(d.id)).length;
    input.checked = items.length > 0 && n === items.length;
    input.indeterminate = n > 0 && n < items.length;
  }
  const all = document.getElementById("select-all");
  if (all) {
    const n = selectedDocs().length;
    all.checked = eligible().length > 0 && n === eligible().length;
    all.indeterminate = n > 0 && n < eligible().length;
  }
}
function updateSelection() {
  const period = document.querySelector('[aria-label="Report period"]').value;
  document.getElementById("source-summary").innerHTML = sourceSummary();
  document.querySelector('[aria-label="Report period"]').value = period;
  for (const c of document.querySelectorAll("[data-source-id]"))
    c.checked = state.selected.has(c.dataset.sourceId) && !c.disabled;
  syncChecks();
}
function openDialog(html) {
  dialogTrigger = document.activeElement;
  document.getElementById("overlay-root").innerHTML =
    `<div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${html}</section></div>`;
  document.querySelector(".dialog input, .dialog button")?.focus();
}
function closeDialog() {
  document.getElementById("overlay-root").innerHTML = "";
  dialogTrigger?.focus();
}
function folderDialog() {
  openDialog(
    `<h2 id="dialog-title">New folder</h2><p>Keep related references and deliverables together.</p><label class="field"><span>Folder name</span><input id="folder-name" placeholder="e.g. Research references" maxlength="80"/></label><div class="actions">${btn("Cancel", "close-dialog", "ghost")}${btn("Create folder", "create-folder", "primary", "folder")}</div>`,
  );
}
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const [action, ...rest] = target.dataset.action.split(":");
  const value = rest.join(":");
  if (action === "go") {
    go(value);
    return;
  }
  if (action === "tab") {
    if (value === "Resources")
      go(state.scope === "project" ? "project" : "workspace");
    else if (value === "Reports") go("sources");
    else toast("This preview focuses on Resources and report sources.");
    return;
  }
  if (action === "category") {
    if (value === "plugins") go("plugins");
    else go(state.scope === "project" ? "project" : "workspace");
    return;
  }
  if (action === "add-menu") {
    document.getElementById("add-menu").classList.toggle("hide");
    return;
  }
  if (action === "folder") {
    state.folder = value;
    state.query = "";
    state.sourceFilter = "all";
    render();
    return;
  }
  if (action === "new-folder") {
    folderDialog();
    return;
  }
  if (action === "close-dialog") {
    closeDialog();
    return;
  }
  if (action === "create-folder") {
    const input = document.getElementById("folder-name");
    const name = input.value.trim();
    if (!name) {
      input.setCustomValidity("Enter a folder name.");
      input.reportValidity();
      return;
    }
    folders.push({
      id: "new-" + folders.length,
      name,
      parentId: state.folder === "all" ? undefined : state.folder,
      scope: state.scope,
      source: "Upload",
    });
    closeDialog();
    go(state.scope === "project" ? "project" : "workspace");
    toast("Demo folder created. Changes last until you reload this preview.");
    return;
  }
  if (action === "detail") {
    state.docId = value;
    go("detail");
    return;
  }
  if (action === "exclude") {
    if (state.excluded.has(value)) state.excluded.delete(value);
    else state.excluded.add(value);
    render();
    toast(
      state.excluded.has(value)
        ? "Excluded for this project. The workspace source is unchanged."
        : "Source included in this project again.",
    );
    return;
  }
  if (action === "edit-workspace") {
    state.scope = "workspace";
    state.docId = value;
    render();
    return;
  }
  if (action === "save-detail") {
    const doc = docs.find((d) => d.id === state.docId);
    doc.use = document.getElementById("detail-use").value;
    toast("Source settings updated in this demo.");
    return;
  }
  if (action === "simulate-upload") {
    state.uploaded = true;
    if (state.uploadQueue)
      state.uploadQueue = state.uploadQueue.map((d, i) => ({
        ...d,
        status: i === 0 ? "ready" : "processing",
      }));
    render();
    toast("Demo upload complete. No file content was sent.");
    return;
  }
  if (action === "retry-upload") {
    const q = state.uploadQueue || [
      {
        name: "Project brief.pdf",
        size: "1.2 MB",
        status: state.uploaded ? "ready" : "queued",
      },
      {
        name: "Architecture decisions.docx",
        size: "840 KB",
        status: state.uploaded ? "processing" : "uploading",
      },
      { name: "Interview notes.pdf", size: "620 KB", status: "failed" },
    ];
    q[Number(value)].status = "ready";
    state.uploadQueue = q;
    render();
    toast("Retry succeeded in this preview.");
    return;
  }
  if (action === "change-account") {
    openDialog(
      `<h2 id="dialog-title">Choose a demo account</h2><p>This changes the preview only. No Google sign-in is performed.</p>${btn("alex@example.test", "set-account:alex@example.test", "", "building")}<div style="height:10px"></div>${btn("research@example.test", "set-account:research@example.test", "", "building")}<div class="actions">${btn("Cancel", "close-dialog", "ghost")}</div>`,
    );
    return;
  }
  if (action === "set-account") {
    state.driveAccount = value;
    closeDialog();
    render();
    toast("Demo account changed.");
    return;
  }
  if (action === "reconnect") {
    state.driveAccount = "research@example.test";
    go("drive");
    toast("Demo authorization restored. No OAuth request was made.");
    return;
  }
  if (action === "connect-drive") {
    if (!state.driveSelected.size) return;
    state.driveConnected = true;
    state.connectedItems = [...state.driveSelected].map(
      (id) =>
        ({
          "drive-course": "Course materials",
          "drive-objectives": "Project objectives",
          "drive-admin": "Administration",
          "drive-notes": "Research notes",
        })[id],
    );
    go("connections");
    toast("Selected items connected in this demo.");
    return;
  }
  if (action === "sync-now") {
    document.getElementById("last-sync").textContent = "Just now · Demo sync";
    toast(
      "Demo sync complete. New files will appear in future report selections.",
    );
    return;
  }
  if (action === "connection-documents") {
    state.scope = "workspace";
    state.screen = "workspace";
    state.folder = "course";
    render();
    return;
  }
  if (action === "select-all") {
    state.selected = new Set(eligible().map((d) => d.id));
    updateSelection();
    return;
  }
  if (action === "select-none") {
    state.selected.clear();
    updateSelection();
    return;
  }
  if (action === "generate-report") {
    state.snapshot = {
      docs: selectedDocs().map((d) => ({ ...d })),
      created: "Nov 3, 2026 · 10:42",
      evaluator: "Balanced",
      period: document.querySelector('[aria-label="Report period"]').value,
    };
    go("report");
    toast(
      "Demo report opened with your selected sources. No AI call was made.",
    );
    return;
  }
  if (action === "citation") {
    const snapshot = state.snapshot?.docs || docs;
    const d =
      snapshot.find((d) => d.id === value) || docs.find((d) => d.id === value);
    openDialog(
      `<h2 id="dialog-title">${esc(d.name)}</h2><p>Reference captured for this saved report.</p><dl><div class="metadata"><dt>Version used</dt><dd>${esc(d.version)}</dd></div><div class="metadata"><dt>Use</dt><dd>${esc(d.use)}</dd></div><div class="metadata"><dt>Origin</dt><dd>${d.source === "Drive" ? "Google Drive" : "Direct upload"}</dd></div></dl><div class="source-note">Later source changes do not alter this report’s saved references.</div><div class="actions">${btn("Close", "close-dialog", "primary")}</div>`,
    );
    return;
  }
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "library-search") {
    state.query = el.value;
    document.getElementById("library-rows").innerHTML = libraryRows();
  }
  if (el.id === "sources-search") {
    state.query = el.value;
    document.getElementById("source-groups").innerHTML = sourceGroups();
    syncChecks();
  }
  if (el.id === "drive-search") {
    for (const row of document.querySelectorAll("[data-drive-name]"))
      row.classList.toggle(
        "hide",
        !row.dataset.driveName.includes(el.value.toLowerCase()),
      );
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "source-filter") {
    state.sourceFilter = el.value;
    document.getElementById("library-rows").innerHTML = libraryRows();
  }
  if (el.id === "upload-use") {
    state.uploadUse = el.value;
    render();
  }
  if (el.dataset.sourceId) {
    if (el.checked) state.selected.add(el.dataset.sourceId);
    else state.selected.delete(el.dataset.sourceId);
    updateSelection();
  }
  if (el.dataset.folderCheck) {
    for (const d of folderDocuments(el.dataset.folderCheck).filter(
      (d) =>
        d.status === "ready" &&
        !state.excluded.has(d.id) &&
        (!state.query ||
          d.name.toLowerCase().includes(state.query.toLowerCase())),
    )) {
      if (el.checked) state.selected.add(d.id);
      else state.selected.delete(d.id);
    }
    updateSelection();
  }
  if (el.id === "select-all") {
    state.selected = el.checked
      ? new Set(eligible().map((d) => d.id))
      : new Set();
    updateSelection();
  }
  if (el.dataset.driveId) {
    if (el.checked) state.driveSelected.add(el.dataset.driveId);
    else state.driveSelected.delete(el.dataset.driveId);
    document.getElementById("drive-count").textContent =
      state.driveSelected.size + " items selected";
    document.querySelector('[data-action="connect-drive"]').disabled =
      !state.driveSelected.size;
  }
  if (el.id === "file-input") queueFiles(el.files);
});
function queueFiles(files) {
  if (!files?.length) return;
  state.uploaded = false;
  state.uploadQueue = Array.from(files).map((f) => ({
    name: f.name,
    size:
      f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + " MB"
        : Math.max(1, Math.round(f.size / 1024)) + " KB",
    status: "queued",
  }));
  render();
  toast("File names added to preview. File content is not read or uploaded.");
}
document.addEventListener("dragover", (e) => {
  if (e.target.closest("#dropzone")) {
    e.preventDefault();
    document.getElementById("dropzone").classList.add("drag");
  }
});
document.addEventListener("dragleave", (e) =>
  e.target.closest("#dropzone")?.classList.remove("drag"),
);
document.addEventListener("drop", (e) => {
  if (e.target.closest("#dropzone")) {
    e.preventDefault();
    queueFiles(e.dataTransfer.files);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDialog();
  if (e.target.id === "dropzone" && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    document.getElementById("file-input").click();
  }
  const dialog = document.querySelector(".dialog");
  if (e.key === "Tab" && dialog) {
    const controls = [
      ...dialog.querySelectorAll("button,input,select,a[href]"),
    ].filter((el) => !el.disabled);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
document.getElementById("top-icons").innerHTML =
  icon("home") + icon("building") + icon("palette");
document.getElementById("screen-picker").innerHTML = screens
  .map(([id, name]) => `<option value="${id}">${name}</option>`)
  .join("");
document
  .getElementById("screen-picker")
  .addEventListener("change", (e) => go(e.target.value));
window.addEventListener("hashchange", () =>
  enterScreen(location.hash.slice(1)),
);
enterScreen(location.hash.slice(1) || "workspace");
