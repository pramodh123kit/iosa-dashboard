// ===================== CONFIG =====================
const API_URL =
  "https://script.google.com/macros/s/AKfycbwmdmRW7UvT4pGRGZ87dG3GFzYqUTjIRLu9d7kJACOgjPcSSUFPKy4M8IgGzyGqsK0tMQ/exec";

const COLOR_RULES = {
  green: ["#00ff00", "#00b050", "#92d050"],
  red: ["#ff0000", "#c00000", "#ff5050"],
};

const PURPLE = "#7c3aed";

// ===================== DOM HELPERS =====================
function $(id) {
  return document.getElementById(id);
}

const statusEl = $("status");
const metaEl = $("meta");
const refreshBtn = $("refreshBtn");
const searchEl = $("search");

const missedEl = $("missed");
const upcomingEl = $("upcoming");

const kpiTasks = $("kpiTasks");
const kpiMarked = $("kpiMarked");
const kpiGreen = $("kpiGreen");
const kpiRed = $("kpiRed");
const kpiPurple = $("kpiPurple");

const compactGridEl = $("compactGrid");

// Charts (optional)
const chartMonthlyCanvas = $("chartMonthly");
const chartDonutCanvas = $("chartDonut");

let lastData = null;
let chartMonthly = null;
let chartDonut = null;

// ===================== UTIL =====================
function normHex(h) {
  return String(h || "").trim().toLowerCase();
}

function isColorIn(hex, list) {
  const h = normHex(hex);
  return list.some((x) => normHex(x) === h);
}

function classify(hex) {
  if (isColorIn(hex, COLOR_RULES.green)) return "green";
  if (isColorIn(hex, COLOR_RULES.red)) return "red";
  return "other";
}

function todayISO() {
  const d = new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return iso.toISOString().slice(0, 10);
}

function compareISO(a, b) {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

function isMarkedCell(cell) {
  if (!cell) return false;
  const bg = normHex(cell.bg);
  const txt = String(cell.text || "").trim();
  const isWhite = !bg || bg === "#ffffff" || bg === "white" || bg === "#fff";
  return !!txt || !isWhite;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeSetText(el, text) {
  if (el) el.textContent = text;
}

function safeSetHTML(el, html) {
  if (el) el.innerHTML = html;
}

// ===================== UI BUILDERS =====================
function itemHtml(x, badgeClass, badgeText) {
  return `
    <div class="item">
      <div class="itemTop">
        <div><b>${escapeHtml(x.task)}</b></div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="mutedSmall" style="margin-top:6px;">${escapeHtml(x.when)}</div>
    </div>
  `;
}

function renderCharts(monthBuckets, totals) {
  // Chart.js or canvases may not exist (don’t crash)
  if (typeof Chart === "undefined") return;
  if (!chartMonthlyCanvas || !chartDonutCanvas) return;

  const monthOrder = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  const labels = monthOrder.filter((m) => monthBuckets[m]);
  const greens = labels.map((m) => monthBuckets[m].green || 0);
  const reds = labels.map((m) => monthBuckets[m].red || 0);
  const purps = labels.map((m) => monthBuckets[m].purple || 0);

  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(chartMonthlyCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Green", data: greens },
        { label: "Red", data: reds },
        { label: "Purple (Missed)", data: purps },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
    },
  });

  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(chartDonutCanvas, {
    type: "doughnut",
    data: {
      labels: ["Green", "Red", "Purple (Missed)"],
      datasets: [{ data: [totals.green, totals.red, totals.purple] }],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
}

function renderCompactTable(tasks, weekCols, tISO) {
  if (!compactGridEl) return;

  const monthHeaders = (weekCols || []).map(
    (w) => `${String(w.monthName || "").trim()} W${w.weekOfMonth}`
  );

  compactGridEl.innerHTML = `
    <thead>
      <tr>
        <th class="label">Task</th>
        ${monthHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${(tasks || []).map((task) => {
        const row = (task.cells || []).map((cell) => {
          if (!isMarkedCell(cell)) return `<td></td>`;
          const cls = classify(cell.bg);
          const date = cell.date || "";
          const overdue = (cls === "red" && compareISO(date, tISO) === -1);
          const bg = overdue ? PURPLE : (cell.bg || "#ffffff");
          return `<td><span class="cellBox" title="${escapeHtml(date)}" style="background:${bg}"></span></td>`;
        }).join("");

        return `<tr>
          <td class="label">${escapeHtml(task.label)}</td>
          ${row}
        </tr>`;
      }).join("")}
    </tbody>
  `;
}

// ===================== MAIN =====================
async function load() {
  // Basic DOM presence check (helps you instantly know what’s missing in HTML)
  const missing = [];
  if (!statusEl) missing.push("#status");
  if (!metaEl) missing.push("#meta");
  if (!refreshBtn) missing.push("#refreshBtn");
  if (!searchEl) missing.push("#search");
  if (!missedEl) missing.push("#missed");
  if (!upcomingEl) missing.push("#upcoming");
  if (!kpiTasks) missing.push("#kpiTasks");
  if (!kpiMarked) missing.push("#kpiMarked");
  if (!kpiGreen) missing.push("#kpiGreen");
  if (!kpiRed) missing.push("#kpiRed");
  if (!kpiPurple) missing.push("#kpiPurple");
  if (!compactGridEl) missing.push("#compactGrid");

  if (missing.length) {
    // Don’t crash—show helpful message
    safeSetText(statusEl, "HTML is missing required elements.");
    safeSetText(metaEl, "Missing: " + missing.join(", "));
    return;
  }

  safeSetText(statusEl, "Loading latest upload…");
  safeSetText(metaEl, "");
  safeSetHTML(missedEl, "");
  safeSetHTML(upcomingEl, "");
  safeSetHTML(compactGridEl, "");

  let data;
  try {
    const res = await fetch(API_URL, { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    safeSetText(statusEl, "Network/JSON error: " + String(e));
    return;
  }

  if (!data || !data.ok) {
    safeSetText(statusEl, "Error: " + (data?.error || "Unknown"));
    return;
  }

  lastData = data;
  safeSetText(
    statusEl,
    `Loaded: ${data.sourceFile?.name || "latest file"} (updated ${data.sourceFile?.updatedIso || "?"})`
  );
  safeSetText(
    metaEl,
    `Extracted: ${data.meta?.extractedAtIso || "?"} • Sheet: ${data.meta?.sheetName || "?"}`
  );

  render();
}

function render() {
  if (!lastData) return;

  const q = (searchEl.value || "").trim().toLowerCase();
  const tISO = todayISO();

  const allTasks = Array.isArray(lastData.tasks) ? lastData.tasks : [];
  const tasks = allTasks.filter((t) => !q || String(t.label || "").toLowerCase().includes(q));
  const weekCols = Array.isArray(lastData.weekCols) ? lastData.weekCols : [];

  let totalMarked = 0, green = 0, red = 0, purple = 0;

  const monthBuckets = {}; // { March: {green,red,purple}, ... }
  function ensureMonth(m) {
    if (!monthBuckets[m]) monthBuckets[m] = { green: 0, red: 0, purple: 0 };
  }

  const missed = [];
  const upcoming = [];

  // next 30 days
  const today = new Date(tISO + "T00:00:00Z");
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in30ISO = in30.toISOString().slice(0, 10);

  for (const task of tasks) {
    const cells = Array.isArray(task.cells) ? task.cells : [];
    for (const cell of cells) {
      if (!isMarkedCell(cell)) continue;

      totalMarked += 1;

      const cls = classify(cell.bg);
      const date = cell.date || "";
      const month = String(cell.monthName || "").trim() || "Unknown";
      ensureMonth(month);

      const overdue = (cls === "red" && date && compareISO(date, tISO) === -1);

      if (cls === "green") {
        green += 1;
        monthBuckets[month].green += 1;
      } else if (overdue) {
        purple += 1;
        monthBuckets[month].purple += 1;
        missed.push({
          task: task.label || "",
          when: `${month} W${cell.weekOfMonth} (${date || "?"})`,
          date: date || "9999-12-31",
        });
      } else if (cls === "red") {
        red += 1;
        monthBuckets[month].red += 1;

        // upcoming in next 30 days
        if (date && compareISO(date, tISO) >= 0 && compareISO(date, in30ISO) <= 0) {
          upcoming.push({
            task: task.label || "",
            when: `${month} W${cell.weekOfMonth} (${date})`,
            date,
          });
        }
      }
    }
  }

  // KPIs
  kpiTasks.textContent = String(tasks.length);
  kpiMarked.textContent = String(totalMarked);
  kpiGreen.textContent = String(green);
  kpiRed.textContent = String(red);
  kpiPurple.textContent = String(purple);

  missed.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  upcoming.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  missedEl.innerHTML = missed.length
    ? missed.map((x) => itemHtml(x, "purple", "Missed")).join("")
    : `<div class="muted">No missed deadlines in this view.</div>`;

  upcomingEl.innerHTML = upcoming.length
    ? upcoming.map((x) => itemHtml(x, "red", "Upcoming")).join("")
    : `<div class="muted">No upcoming red items in next 30 days.</div>`;

  renderCharts(monthBuckets, { green, red, purple });
  renderCompactTable(tasks, weekCols, tISO);
}

// ===================== EVENTS =====================
if (refreshBtn) refreshBtn.addEventListener("click", () => load());
if (searchEl) searchEl.addEventListener("input", () => render());

// Auto-load
load();
