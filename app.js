const API_URL =
  "https://script.google.com/macros/s/AKfycbwmdmRW7UvT4pGRGZ87dG3GFzYqUTjIRLu9d7kJACOgjPcSSUFPKy4M8IgGzyGqsK0tMQ/exec";

const el = (id) => document.getElementById(id);

const refreshBtn = el("refreshBtn");
const searchEl = el("search");
const lastUpdatedEl = el("lastUpdated");
const searchToggle = el("searchToggle");

searchToggle.addEventListener("click", () => {
  document.body.classList.toggle("search-open");
  if (document.body.classList.contains("search-open")) {
    searchEl.focus();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.body.classList.remove("search-open");
});

searchEl.addEventListener("blur", () => {
  if (window.matchMedia("(max-width: 640px)").matches) {
    document.body.classList.remove("search-open");
  }
});

refreshBtn.addEventListener("click", () => load());
searchEl.addEventListener("input", () => render());

let state = null;

let activeDeadlineTab = "completed"; // ✅ default selected


async function load() {
  lastUpdatedEl.textContent = "Loading latest upload…";
  state = null;
  render();

  const res = await fetch(API_URL, { cache: "no-store" });
  const data = await res.json();

  if (!data.ok) {
    lastUpdatedEl.textContent = `Error: ${data.error || "Unknown"}`;
    return;
  }

  state = data;

  console.log("Lord control metric:", data.lordControl);

  if (data.lordControl) {
    console.log(
      `Lord control % green (nomination before ${data.lordControl.cutoff}): ${data.lordControl.percent}% (${data.lordControl.green}/${data.lordControl.eligible})`
    );
  }
  
  lastUpdatedEl.textContent = `Loaded: ${data.sourceFile.name} • Updated: ${fmtDateTime(
    data.sourceFile.updatedIso
  )}`;

  render();
  wireDeadlineTabs();

}

function render() {
  const d = state?.dashboard;

  if (!d) {
    setText("kpiScore", "—");
    setText("kpiTotal", "—");
    setText("kpiCompleted", "—");
    setText("kpiDueSoon", "—");
    setText("kpiMissed", "—");
    renderDeadlinesTable("completed", []);
    renderUpcoming([]);
    renderAudit(null, "CAAL");
    renderAudit(null, "IOSA");
    renderPanel("trainingPanel", null);
    renderPanel("staffingPanel", null);
    renderPanel("inspectionsPanel", null);
    renderHeatmap([]);
    return;
  }

  setText("kpiScore", `${Math.round((d.kpis.completed / d.kpis.totalPlanned) * 100)}%`);
  setText("kpiTotal", `${d.kpis.totalPlanned}`);
  setText("kpiCompleted", `${d.kpis.completed}`);
  setText("kpiDueSoon", `${d.kpis.dueSoon}`);
  setText("kpiMissed", `${d.kpis.missed}`);

  const q = (searchEl.value || "").trim().toLowerCase();

  const missedFiltered = (d.missedList || []).filter(
    (x) =>
      !q ||
      x.task.toLowerCase().includes(q) ||
      x.deadline.toLowerCase().includes(q)
  );

  const upcomingFiltered = (d.upcoming30 || []).filter(
    (x) =>
      !q ||
      x.task.toLowerCase().includes(q) ||
      x.monthName.toLowerCase().includes(q)
  );

    const completedFiltered = (d.completedList || []).filter(
    (x) =>
      !q ||
      x.task.toLowerCase().includes(q) ||
      x.deadline.toLowerCase().includes(q)
  );

  if (activeDeadlineTab === "missed"){
    renderDeadlinesTable("missed", missedFiltered);
  } else {
    renderDeadlinesTable("completed", completedFiltered);
  }

  renderUpcoming(upcomingFiltered);
  renderAudit(d.audits?.CAAL, "CAAL");
  renderAudit(d.audits?.IOSA, "IOSA");
  renderPanel("trainingPanel", d.panels?.training);
  renderPanel("staffingPanel", d.panels?.staffing);
  renderPanel("inspectionsPanel", d.panels?.inspections);
  renderHeatmap(d.weekly || []);
}

function renderMissed(rows) {
  const table = el("missedTable");
  const body = table.querySelector("tbody");
  const empty = el("missedEmpty");
  if (!table || !thead || !empty) return; // ✅ safety
  

  body.innerHTML = "";

  if (!rows.length) {
    empty.style.display = "block";
    table.style.display = "none";
    return;
  }

  empty.style.display = "none";
  table.style.display = "table";

  for (const r of rows.slice(0, 50)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escape(r.task)}</td>
      <td>${escape(r.deadline)}</td>
      <td>${escape(r.date)}</td>
      <td class="right">${escape(String(r.daysOverdue))}</td>
    `;
    body.appendChild(tr);
  }
}

function renderDeadlinesTable(mode, rows){
  const table = el("deadlinesTable");
  const thead = el("deadlinesThead");
  const body = table.querySelector("tbody");
  const empty = el("deadlinesEmpty");

  body.innerHTML = "";

  // Header depends on tab
  if (mode === "missed"){
    thead.innerHTML = `
      <tr>
        <th>Task</th>
        <th>Deadline</th>
        <th>Date</th>
        <th class="right">Days Overdue</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th>Task</th>
        <th>Deadline</th>
        <th>Date</th>
      </tr>
    `;
  }

  if (!rows.length){
    empty.style.display = "block";
    table.style.display = "none";
    return;
  }

  empty.style.display = "none";
  table.style.display = "table";

  for (const r of rows.slice(0, 80)){
    const tr = document.createElement("tr");

    if (mode === "missed"){
      tr.innerHTML = `
        <td>${escape(r.task)}</td>
        <td>${escape(r.deadline)}</td>
        <td>${escape(r.date)}</td>
        <td class="right">${escape(String(r.daysOverdue ?? ""))}</td>
      `;
    } else {
      tr.innerHTML = `
        <td>${escape(r.task)}</td>
        <td>${escape(r.deadline)}</td>
        <td>${escape(r.date)}</td>
      `;
    }

    body.appendChild(tr);
  }
}

function wireDeadlineTabs(){
  const btnCompleted = el("tabCompleted");
  const btnMissed = el("tabMissed");

  if (!btnCompleted || !btnMissed) return;

  btnCompleted.onclick = () => {
    activeDeadlineTab = "completed";
    btnCompleted.classList.add("active");
    btnMissed.classList.remove("active");
    render(); // re-render table with same search query
  };

  btnMissed.onclick = () => {
    activeDeadlineTab = "missed";
    btnMissed.classList.add("active");
    btnCompleted.classList.remove("active");
    render();
  };
}


function renderUpcoming(items) {
  const list = el("upcomingList");
  const empty = el("upcomingEmpty");

  list.innerHTML = "";

  if (!items.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  for (const it of items.slice(0, 12)) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${escape(it.task)}</div>
      </div>
      <div class="itemMeta">
        ${escape(it.monthName)} • Week ${escape(String(it.weekOfMonth))}
      </div>
    `;
    list.appendChild(div);
  }
}

function renderAudit(audit, name) {
  if (name === "CAAL") {
    setText("caaWindow", audit ? `${audit.start} → ${audit.end}` : "—");
    setText(
      "caaCountdown",
      audit ? countdown(audit.daysToStart) : "—"
    );
  } else {
    setText("iosaWindow", audit ? `${audit.start} → ${audit.end}` : "—");
    setText(
      "iosaCountdown",
      audit ? countdown(audit.daysToStart) : "—"
    );
  }
}

function renderPanel(containerId, panel) {
  const c = el(containerId);

  if (!panel) {
    c.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  const next = panel.next
    ? `Next: ${escape(panel.next.task)} (${escape(panel.next.date)})`
    : "No upcoming scheduled items.";

  // ✅ build breakdown lines (if any)
  let completedSub = "";
  if (panel.completedByTask) {
    const lines = Object.entries(panel.completedByTask)
      .map(([k, v]) => `${escape(k)} = ${escape(String(v))}`)
      .join("<br/>");
    completedSub = `<div class="miniSub">${lines}</div>`;
  }

  c.innerHTML = `
    <div class="miniRow">
      <div class="miniLeft">
        <div class="miniTitle">Progress</div>
        <div class="miniSub">${next}</div>
      </div>
      <div class="miniRight pct">${panel.percent}%</div>
    </div>

    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Planned</div></div>
      <div class="miniRight">${panel.planned}</div>
    </div>

    <div class="miniRow">
      <div class="miniLeft">
        <div class="miniTitle">Completed</div>
        ${completedSub}
      </div>
      <div class="miniRight">${panel.completed}</div>
    </div>

    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Due Soon</div></div>
      <div class="miniRight">${panel.dueSoon}</div>
    </div>

    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Missed</div></div>
      <div class="miniRight">${panel.missed}</div>
    </div>
  `;
}


function renderHeatmap(weeks) {
  const hm = el("heatmap");
  hm.innerHTML = "";

  for (const w of weeks) {
    const cell = document.createElement("div");
    cell.className = "weekCell";

    const total = w.total || 0;
    const done = total ? Math.round((w.completed / total) * 100) : 0;
    const pend = total ? Math.round((w.pending / total) * 100) : 0;
    const miss = total ? Math.round((w.missed / total) * 100) : 0;

    cell.innerHTML = `
      <div class="weekTop">
        <span>${escape(w.weekStart)}</span>
        <span>${total} items</span>
      </div>
      <div class="bars">
        <div class="bar done"><i style="width:${done}%"></i></div>
        <div class="bar pend"><i style="width:${pend}%"></i></div>
        <div class="bar miss"><i style="width:${miss}%"></i></div>
      </div>
    `;

    hm.appendChild(cell);
  }
}

function countdown(days) {
  if (days < 0) return `${Math.abs(days)} days since start`;
  if (days === 0) return "Starts today";
  return `${days} days remaining`;
}

function setText(id, txt) {
  const node = el(id);
  if (node) node.textContent = txt;
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

load();
