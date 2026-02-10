const API_URL = "https://script.google.com/macros/s/AKfycbwmdmRW7UvT4pGRGZ87dG3GFzYqUTjIRLu9d7kJACOgjPcSSUFPKy4M8IgGzyGqsK0tMQ/exec";

const COLOR_RULES = {
  green: ["#00ff00", "#00b050", "#92d050"],
  red:   ["#ff0000", "#c00000", "#ff5050"],
};
const PURPLE = "#7c3aed";

const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const refreshBtn = document.getElementById("refreshBtn");
const searchEl = document.getElementById("search");

const missedEl = document.getElementById("missed");
const upcomingEl = document.getElementById("upcoming");

const kpiTasks = document.getElementById("kpiTasks");
const kpiMarked = document.getElementById("kpiMarked");
const kpiGreen = document.getElementById("kpiGreen");
const kpiRed = document.getElementById("kpiRed");
const kpiPurple = document.getElementById("kpiPurple");

const compactGridEl = document.getElementById("compactGrid");

let lastData = null;
let chartMonthly = null;
let chartDonut = null;

refreshBtn.addEventListener("click", () => load());
searchEl.addEventListener("input", () => render());

function normHex(h){ return String(h || "").trim().toLowerCase(); }
function isColorIn(hex, list){
  const h = normHex(hex);
  return list.some(x => normHex(x) === h);
}
function classify(hex){
  if (isColorIn(hex, COLOR_RULES.green)) return "green";
  if (isColorIn(hex, COLOR_RULES.red)) return "red";
  return "other";
}

function todayISO(){
  const d = new Date();
  const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return iso.toISOString().slice(0,10);
}
function compareISO(a,b){ return a < b ? -1 : a > b ? 1 : 0; }

function isMarkedCell(cell){
  const bg = normHex(cell.bg);
  const txt = String(cell.text || "").trim();
  const isWhite = !bg || bg === "#ffffff" || bg === "white" || bg === "#fff";
  return !!txt || !isWhite;
}

async function load(){
  statusEl.textContent = "Loading latest upload…";
  metaEl.textContent = "";
  missedEl.innerHTML = "";
  upcomingEl.innerHTML = "";
  compactGridEl.innerHTML = "";

  const res = await fetch(API_URL, { cache: "no-store" });
  const data = await res.json();

  if (!data.ok){
    statusEl.textContent = "Error: " + (data.error || "Unknown");
    return;
  }

  lastData = data;
  statusEl.textContent = `Loaded: ${data.sourceFile.name} (updated ${data.sourceFile.updatedIso})`;
  metaEl.textContent = `Extracted: ${data.meta.extractedAtIso} • Sheet: ${data.meta.sheetName}`;

  render();
}

function render(){
  if (!lastData) return;

  const q = (searchEl.value || "").trim().toLowerCase();
  const tISO = todayISO();

  const tasks = lastData.tasks.filter(t => !q || t.label.toLowerCase().includes(q));
  const weekCols = lastData.weekCols;

  // --- Build stats ---
  let totalMarked = 0, green = 0, red = 0, purple = 0;

  // monthBuckets: { "March": {green, red, purple}, ... }
  const monthBuckets = {};
  const ensureMonth = (m) => monthBuckets[m] ||= { green:0, red:0, purple:0 };

  const missed = [];
  const upcoming = [];

  // 30-day window
  const today = new Date(tISO + "T00:00:00Z");
  const in30 = new Date(today.getTime() + 30*24*60*60*1000);
  const in30ISO = in30.toISOString().slice(0,10);

  for (const task of tasks){
    for (const cell of task.cells){
      if (!isMarkedCell(cell)) continue;

      totalMarked += 1;

      const cls = classify(cell.bg);
      const overdue = (cls === "red" && compareISO(cell.date, tISO) === -1);
      const month = (cell.monthName || "").trim() || "Unknown";
      ensureMonth(month);

      if (cls === "green"){
        green += 1;
        monthBuckets[month].green += 1;
      } else if (overdue){
        purple += 1;
        monthBuckets[month].purple += 1;
        missed.push({
          task: task.label,
          when: `${cell.monthName} W${cell.weekOfMonth} (${cell.date})`,
          date: cell.date
        });
      } else if (cls === "red"){
        red += 1;
        monthBuckets[month].red += 1;

        // upcoming in next 30 days
        if (compareISO(cell.date, tISO) >= 0 && compareISO(cell.date, in30ISO) <= 0){
          upcoming.push({
            task: task.label,
            when: `${cell.monthName} W${cell.weekOfMonth} (${cell.date})`,
            date: cell.date
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

  // lists
  missed.sort((a,b)=> a.date.localeCompare(b.date));
  upcoming.sort((a,b)=> a.date.localeCompare(b.date));

  missedEl.innerHTML = missed.length ? missed.map(x => itemHtml(x, "purple", "Missed")).join("") :
    `<div class="muted">No missed deadlines in this view.</div>`;

  upcomingEl.innerHTML = upcoming.length ? upcoming.map(x => itemHtml(x, "red", "Upcoming")).join("") :
    `<div class="muted">No upcoming red items in next 30 days.</div>`;

  // Charts
  renderCharts(monthBuckets, {green, red, purple});

  // Compact table: show only 1 cell per week, colored squares, but keep it compact
  renderCompactTable(tasks, weekCols, tISO);
}

function itemHtml(x, badgeClass, badgeText){
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

function renderCharts(monthBuckets, totals){
  const monthOrder = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const labels = monthOrder.filter(m => monthBuckets[m]);
  const greens = labels.map(m => monthBuckets[m].green);
  const reds   = labels.map(m => monthBuckets[m].red);
  const purps  = labels.map(m => monthBuckets[m].purple);

  const ctxMonthly = document.getElementById("chartMonthly");
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(ctxMonthly, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Green", data: greens },
        { label: "Red", data: reds },
        { label: "Purple (Missed)", data: purps },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
    }
  });

  const ctxDonut = document.getElementById("chartDonut");
  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(ctxDonut, {
    type: "doughnut",
    data: {
      labels: ["Green", "Red", "Purple (Missed)"],
      datasets: [{ data: [totals.green, totals.red, totals.purple] }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

function renderCompactTable(tasks, weekCols, tISO){
  const monthHeaders = weekCols.map(w => `${w.monthName.trim()} W${w.weekOfMonth}`);
  compactGridEl.innerHTML = `
    <thead>
      <tr>
        <th class="label">Task</th>
        ${monthHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${tasks.map(task => {
        const row = task.cells.map(cell => {
          if (!isMarkedCell(cell)) return `<td></td>`;
          const cls = classify(cell.bg);
          const overdue = (cls === "red" && compareISO(cell.date, tISO) === -1);
          const bg = overdue ? PURPLE : (cell.bg || "#ffffff");
          return `<td><span class="cellBox" title="${escapeHtml(cell.date)}" style="background:${bg}"></span></td>`;
        }).join("");
        return `<tr>
          <td class="label">${escapeHtml(task.label)}</td>
          ${row}
        </tr>`;
      }).join("")}
    </tbody>
  `;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

load();
