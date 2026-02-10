// 1) Put your Apps Script Web App URL here:
const API_URL = "https://script.google.com/macros/s/AKfycbwmdmRW7UvT4pGRGZ87dG3GFzYqUTjIRLu9d7kJACOgjPcSSUFPKy4M8IgGzyGqsK0tMQ/exec";

// 2) Define what “red” and “green” mean in HEX.
// Google Sheets backgrounds usually look like "#ff0000", "#00ff00", etc.
// Adjust once you confirm the actual colors used in your sheet.
const COLOR_RULES = {
  green: ["#00ff00", "#00b050", "#92d050"], // common greens
  red: ["#ff0000", "#c00000", "#ff5050"],   // common reds
};

// If a cell is “red” and date < today => show purple
const PURPLE = "#7c3aed";

const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const gridEl = document.getElementById("grid");
const missedEl = document.getElementById("missed");
const refreshBtn = document.getElementById("refreshBtn");
const searchEl = document.getElementById("search");

refreshBtn.addEventListener("click", () => load());
searchEl.addEventListener("input", () => renderLast());

let lastData = null;

function normHex(h) {
  if (!h) return "";
  return String(h).trim().toLowerCase();
}

function isColorIn(hex, list) {
  const h = normHex(hex);
  return list.some(x => normHex(x) === h);
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
  // lexicographic works for YYYY-MM-DD
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

async function load() {
  statusEl.textContent = "Loading latest upload…";
  metaEl.textContent = "";
  missedEl.innerHTML = "";
  gridEl.innerHTML = "";

  const res = await fetch(API_URL, { cache: "no-store" });
  const data = await res.json();

  if (!data.ok) {
    statusEl.textContent = "Error: " + (data.error || "Unknown");
    return;
  }

  lastData = data;

  statusEl.textContent = `Loaded: ${data.sourceFile.name} (updated ${data.sourceFile.updatedIso})`;
  metaEl.textContent = `Sheet: ${data.meta.sheetName} • Extracted: ${data.meta.extractedAtIso}`;

  renderLast();
}

function renderLast() {
  if (!lastData) return;

  const q = (searchEl.value || "").trim().toLowerCase();
  const { weekCols, tasks } = lastData;
  const tISO = todayISO();

  // Filter tasks by search
  const filtered = tasks.filter(t => !q || t.label.toLowerCase().includes(q));

  // Build missed deadlines list
  const missed = [];

  for (const task of filtered) {
    for (const cell of task.cells) {
      const cls = classify(cell.bg);
      if (cls !== "red") continue;

      // If the cell’s week date is before today => missed
      if (compareISO(cell.date, tISO) === -1) {
        missed.push({
          task: task.label,
          when: `${cell.monthName} W${cell.weekOfMonth} (${cell.date})`,
          original: cell.bg,
        });
      }
    }
  }

  missedEl.innerHTML = missed.length
    ? missed.map(m => `
        <div class="missedItem">
          <div><b>${escapeHtml(m.task)}</b></div>
          <div style="color:#a9b4d0;margin-top:4px;">
            Missed: ${escapeHtml(m.when)}
          </div>
          <div style="color:#a9b4d0;margin-top:2px;font-size:12px;">
            (red → purple on timeline)
          </div>
        </div>
      `).join("")
    : `<div style="color:#a9b4d0;">No missed deadlines found in the current view.</div>`;

  // Build table
  const monthHeaders = weekCols.map(
    w => `${w.monthName.trim()} W${w.weekOfMonth}`
  );

  gridEl.innerHTML = `
    <thead>
      <tr>
        <th class="label">Task</th>
        ${monthHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${filtered.map(task => {
        const row = task.cells.map(cell => {
          const cls = classify(cell.bg);
          const overdue = cls === "red" && compareISO(cell.date, tISO) === -1;
          const bg = overdue ? PURPLE : (cell.bg || "#ffffff");

          return `
            <td>
              <span
                class="cellBox"
                title="${escapeHtml(cell.date)} • ${escapeHtml(cell.bg)}"
                style="background:${bg}">
              </span>
            </td>
          `;
        }).join("");

        return `
          <tr>
            <td class="label">${escapeHtml(task.label)}</td>
            ${row}
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// Auto-load on open
load();
