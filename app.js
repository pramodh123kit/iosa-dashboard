const API_URL = "https://script.google.com/macros/s/AKfycbwmdmRW7UvT4pGRGZ87dG3GFzYqUTjIRLu9d7kJACOgjPcSSUFPKy4M8IgGzyGqsK0tMQ/exec";

const el = (id) => document.getElementById(id);

const refreshBtn = el("refreshBtn");
const searchEl = el("search");
const lastUpdatedEl = el("lastUpdated");
const searchToggle = el("searchToggle");

const kpiTooltip = el("kpiTooltip");
const kpiTooltipTitle = el("kpiTooltipTitle");
const kpiTooltipBody = el("kpiTooltipBody");

function positionTooltipNear(element){
  const r = element.getBoundingClientRect();
  const pad = 10;

  // Prefer below card, fallback above if not enough space
  const desiredTop = r.bottom + pad;
  const desiredLeft = Math.min(r.left, window.innerWidth - (kpiTooltip.offsetWidth || 520) - pad);

  kpiTooltip.style.left = `${Math.max(pad, desiredLeft)}px`;

  // If would overflow bottom, show above
  const approxHeight = Math.min(420, kpiTooltip.scrollHeight || 320);
  if (desiredTop + approxHeight > window.innerHeight - pad) {
    kpiTooltip.style.top = `${Math.max(pad, r.top - approxHeight - pad)}px`;
  } else {
    kpiTooltip.style.top = `${desiredTop}px`;
  }
}

function wireKpiHover(){
  // KPI cards are the 5 elements inside ".kpis"
  const kpiCards = document.querySelectorAll(".kpis .card.kpi");
  if (kpiCards.length < 5) return;

  const d = state?.dashboard;
  if (!d) return;

  const items = d.items || [];
  const today = d.today || (new Date().toISOString().slice(0,10));
  const in14 = addDaysISOClient(today, 14);

  const plannedList = items;
  const completedList = items.filter(x => x.status === "completed");
  const dueSoonList = items.filter(x => x.status === "pending" && x.date >= today && x.date <= in14);
  const missedList = d.missedList || [];

  // 0: progress (skip tooltip)
  // 1: total planned
  // 2: completed
  // 3: due soon
  // 4: missed

  const bindings = [
    null,
    { title: `Total Planned Items (${plannedList.length})`, rows: plannedList.map(fmtItemRow).join("") },
    { title: `Completed (${completedList.length})`, rows: completedList.map(fmtItemRow).join("") },
    { title: `Due Soon (14 days) (${dueSoonList.length})`, rows: dueSoonList.map(fmtItemRow).join("") },
    { title: `Missed Deadlines (${missedList.length})`, rows: missedList.map(fmtMissedRow).join("") },
  ];

  kpiCards.forEach((card, idx) => {
    const b = bindings[idx];
    if (!b) return;

    // remove previous listeners (simple way: replace with clone)
    const clone = card.cloneNode(true);
    card.parentNode.replaceChild(clone, card);

    clone.addEventListener("mouseenter", () => showTooltip(b.title, b.rows, clone));
    clone.addEventListener("mousemove", () => positionTooltipNear(clone));
    clone.addEventListener("mouseleave", hideTooltip);
  });

  // close tooltip if user scrolls/resizes
  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.addEventListener("resize", hideTooltip);
}


function showTooltip(title, rowsHtml, anchorEl){
  kpiTooltipTitle.textContent = title;
  kpiTooltipBody.innerHTML = rowsHtml || `<div class="muted">No items.</div>`;
  kpiTooltip.style.display = "block";

  // need a tick so width/height exist
  requestAnimationFrame(() => positionTooltipNear(anchorEl));
}

function hideTooltip(){
  kpiTooltip.style.display = "none";
}

function fmtItemRow(it){
  const deadline = it.deadlineLabel ? it.deadlineLabel : `${it.monthName} W${it.weekOfMonth}`;
  const status = it.status || "";
  return `
    <div class="kpiTooltipRow">
      <div class="kpiTooltipRowTop">
        <div>${escape(it.task)}</div>
        <div class="kpiTooltipPill">${escape(it.date)} • ${escape(status)}</div>
      </div>
      <div class="kpiTooltipMeta">${escape(deadline)}</div>
    </div>
  `;
}

function fmtMissedRow(m){
  return `
    <div class="kpiTooltipRow">
      <div class="kpiTooltipRowTop">
        <div>${escape(m.task)}</div>
        <div class="kpiTooltipPill">${escape(m.date)} • ${escape(String(m.daysOverdue))}d</div>
      </div>
      <div class="kpiTooltipMeta">${escape(m.deadline)}</div>
    </div>
  `;
}

function parseISO(s){
  // safe parse yyyy-mm-dd
  const [y,m,d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, (m||1)-1, d||1));
}

function addDaysISOClient(iso, days){
  const dt = parseISO(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0,10);
}


searchToggle.addEventListener("click", () => {
  document.body.classList.toggle("search-open");
  // focus input when opened
  if (document.body.classList.contains("search-open")) {
    searchEl.focus();
  }
});

// close search on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.body.classList.remove("search-open");
});

// close search when input loses focus (mobile-friendly)
searchEl.addEventListener("blur", () => {
  // only close on small screens
  if (window.matchMedia("(max-width: 640px)").matches) {
    document.body.classList.remove("search-open");
  }
});

refreshBtn.addEventListener("click", () => load());
searchEl.addEventListener("input", () => render());

let state = null;

async function load(){
  lastUpdatedEl.textContent = "Loading latest upload…";
  state = null;
  render(); // clear UI quickly

  const res = await fetch(API_URL, { cache: "no-store" });
  const data = await res.json();

  if (!data.ok){
    lastUpdatedEl.textContent = `Error: ${data.error || "Unknown"}`;
    return;
  }

  state = data;
  lastUpdatedEl.textContent = `Loaded: ${data.sourceFile.name} • Updated: ${fmtDateTime(data.sourceFile.updatedIso)}`;
  render();
}

function render(){
  const d = state?.dashboard;
  if (!d){
    setText("kpiScore","—");
    setText("kpiTotal","—");
    setText("kpiCompleted","—");
    setText("kpiDueSoon","—");
    setText("kpiMissed","—");
    renderMissed([]);
    renderUpcoming([]);
    renderAudit(null, "CAAL");
    renderAudit(null, "IOSA");
    renderPanel("trainingPanel", null, "Training & SOP");
    renderPanel("staffingPanel", null, "Staffing & Leadership");
    renderPanel("inspectionsPanel", null, "Inspections");
    renderHeatmap([]);
    return;
  }

  // KPI cards
  setText("kpiScore", `${d.kpis.complianceScore}%`);
  setText("kpiTotal", `${d.kpis.totalPlanned}`);
  setText("kpiCompleted", `${d.kpis.completed}`);
  setText("kpiDueSoon", `${d.kpis.dueSoon}`);
  setText("kpiMissed", `${d.kpis.missed}`);

  // Search filters
  const q = (searchEl.value || "").trim().toLowerCase();

  const missedFiltered = (d.missedList || []).filter(x =>
    !q || x.task.toLowerCase().includes(q) || x.deadline.toLowerCase().includes(q)
  );

  const upcomingFiltered = (d.upcoming30 || []).filter(x =>
    !q || x.task.toLowerCase().includes(q) || `${x.monthName}`.toLowerCase().includes(q)
  );

  renderMissed(missedFiltered);
  renderUpcoming(upcomingFiltered);

  renderAudit(d.audits?.CAAL, "CAAL");
  renderAudit(d.audits?.IOSA, "IOSA");

  renderPanel("trainingPanel", d.panels?.training, "Training & SOP");
  renderPanel("staffingPanel", d.panels?.staffing, "Staffing & Leadership");
  renderPanel("inspectionsPanel", d.panels?.inspections, "Inspections");

  renderHeatmap(d.weekly || []);
  wireKpiHover();
}

function renderMissed(rows){
  const table = el("missedTable");
  const body = table.querySelector("tbody");
  const empty = el("missedEmpty");

  body.innerHTML = "";

  if (!rows.length){
    empty.style.display = "block";
    table.style.display = "none";
    return;
  }

  empty.style.display = "none";
  table.style.display = "table";

  for (const r of rows.slice(0, 50)){
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

function renderUpcoming(items){
  const list = el("upcomingList");
  const empty = el("upcomingEmpty");
  list.innerHTML = "";

  if (!items.length){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const it of items.slice(0, 12)){
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${escape(it.task)}</div>
        <div class="badge">${escape(it.date)}</div>
      </div>
      <div class="itemMeta">${escape(it.monthName)} • Week ${escape(String(it.weekOfMonth))}</div>
    `;
    list.appendChild(div);
  }
}

function renderAudit(audit, name){
  const setBadge = (badgeEl, percent) => {
    badgeEl.classList.remove("risk-low","risk-med","risk-high");
    if (percent >= 85) badgeEl.classList.add("risk-low");
    else if (percent >= 65) badgeEl.classList.add("risk-med");
    else badgeEl.classList.add("risk-high");
    badgeEl.textContent = badgeText(percent);
  };

  if (name === "CAAL"){
    setText("caaWindow", audit ? `${audit.start} → ${audit.end}` : "—");
    setText("caaCountdown", audit ? countdown(audit.daysToStart) : "—");
    // setText("caaReady", audit ? `${audit.readinessPercent}%` : "—");
    // el("caaBar").style.width = audit ? `${audit.readinessPercent}%` : "0%";

   

  } else {
    setText("iosaWindow", audit ? `${audit.start} → ${audit.end}` : "—");
    setText("iosaCountdown", audit ? countdown(audit.daysToStart) : "—");
    // setText("iosaReady", audit ? `${audit.readinessPercent}%` : "—");
    // el("iosaBar").style.width = audit ? `${audit.readinessPercent}%` : "0%";

    // const b = el("iosaBadge");
    // if (audit) setBadge(b, audit.readinessPercent);
    // else { b.textContent = "—"; b.classList.remove("risk-low","risk-med","risk-high"); }
  }
}


function renderPanel(containerId, panel){
  const c = el(containerId);
  if (!panel){
    c.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  const next = panel.next ? `Next: ${escape(panel.next.task)} (${escape(panel.next.date)})` : "No upcoming scheduled items.";
  c.innerHTML = `
    <div class="miniRow">
      <div class="miniLeft">
        <div class="miniTitle">Progress</div>
        <div class="miniSub">${escape(next)}</div>
      </div>
      <div class="miniRight pct">${panel.percent}%</div>
    </div>
    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Planned</div><div class="miniSub">All scheduled blocks</div></div>
      <div class="miniRight">${panel.planned}</div>
    </div>
    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Completed</div><div class="miniSub">Green blocks</div></div>
      <div class="miniRight">${panel.completed}</div>
    </div>
    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Due Soon</div><div class="miniSub">Next 14 days</div></div>
      <div class="miniRight">${panel.dueSoon}</div>
    </div>
    <div class="miniRow">
      <div class="miniLeft"><div class="miniTitle">Missed</div><div class="miniSub">Overdue red blocks</div></div>
      <div class="miniRight">${panel.missed}</div>
    </div>
  `;
}

function renderHeatmap(weeks){
  const hm = el("heatmap");
  hm.innerHTML = "";

  for (const w of weeks){
    const cell = document.createElement("div");
    cell.className = "weekCell";

    const total = w.total || 0;
    const done = total ? Math.round((w.completed/total)*100) : 0;
    const pend = total ? Math.round((w.pending/total)*100) : 0;
    const miss = total ? Math.round((w.missed/total)*100) : 0;

    cell.innerHTML = `
      <div class="weekTop">
        <span>${escape(w.weekStart)}</span>
        <span>${total} items</span>
      </div>
      <div class="bars">
        <div class="bar done" title="Completed ${done}%"><i style="width:${done}%"></i></div>
        <div class="bar pend" title="Pending ${pend}%"><i style="width:${pend}%"></i></div>
        <div class="bar miss" title="Missed ${miss}%"><i style="width:${miss}%"></i></div>
      </div>
    `;
    hm.appendChild(cell);
  }
}

function countdown(days){
  if (days < 0) return `${Math.abs(days)} days since start`;
  if (days === 0) return "Starts today";
  return `${days} days remaining`;
}

function badgeText(p){
  if (p >= 85) return "LOW RISK";
  if (p >= 65) return "MODERATE RISK";
  return "HIGH RISK";
}

function setText(id, txt){
  const node = el(id);
  if (node) node.textContent = txt;
}

function fmtDateTime(iso){
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function escape(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

load();
