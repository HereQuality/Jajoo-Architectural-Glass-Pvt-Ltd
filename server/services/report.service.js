"use strict";

/**
 * OEE PDF report builder — reuses `aggregateOee` (server/utils/oeeAggregate.js)
 * so the numbers here never drift from what the Dashboard's "Efficiency
 * Report (OEE)" table shows on screen.
 */

const PDFDocument = require("pdfkit");
const { aggregateOee } = require("../utils/oeeAggregate");

const ALL_COLUMNS = [
  { key: "availMin", label: "Available Working (min)", width: 78, fmt: (n) => n.toFixed(2) },
  { key: "workMin", label: "Working Schedule (min)", width: 78, fmt: (n) => n.toFixed(2) },
  { key: "availRatio", label: "Availability Ratio", width: 68, fmt: (n) => n.toFixed(2) + "%" },
  { key: "okQty", label: "OK Qty", width: 55, fmt: (n) => String(Math.round(n)) },
  { key: "processQty", label: "Process Qty", width: 68, fmt: (n) => String(Math.round(n)) },
  { key: "qualRatio", label: "Quality Ratio", width: 65, fmt: (n) => n.toFixed(2) + "%" },
  { key: "idealQty", label: "Ideal Qty", width: 62, fmt: (n) => n.toFixed(2) },
  { key: "perfRatio", label: "Performance Ratio", width: 70, fmt: (n) => n.toFixed(2) + "%" },
  { key: "oee", label: "OEE %", width: 58, fmt: (n) => n.toFixed(2) + "%" },
];

function resolveColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) return ALL_COLUMNS;
  const set = new Set(columns);
  const filtered = ALL_COLUMNS.filter((c) => set.has(c.key));
  return filtered.length > 0 ? filtered : ALL_COLUMNS;
}

function dateStrOf(e) {
  const raw = typeof e.date === "string" ? e.date : new Date(e.date).toISOString();
  return raw.split("T")[0];
}

function machineNameOf(e) {
  return e.machine && typeof e.machine === "object" ? e.machine.machineName || "—" : "—";
}

function drawTable(doc, { x, columns, rows }) {
  const rowHeight = 24;
  const headerHeight = 30;
  let curY = doc.y;

  const drawHeader = () => {
    let curX = x;
    doc.font("Helvetica-Bold").fontSize(7.5);
    columns.forEach((col) => {
      doc.rect(curX, curY, col.width, headerHeight).fillAndStroke("#0a1930", "#0a1930");
      doc.fillColor("#ffffff").text(col.label, curX + 2, curY + 8, {
        width: col.width - 4,
        align: "center",
      });
      curX += col.width;
    });
    curY += headerHeight;
  };

  drawHeader();

  rows.forEach((row) => {
    if (curY + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ layout: "landscape", size: "A4", margin: 30 });
      curY = doc.page.margins.top;
      drawHeader();
    }
    let curX = x;
    row.forEach((cell, i) => {
      doc.rect(curX, curY, columns[i].width, rowHeight).fillAndStroke(
        row.__isTotal ? "#f0f4f8" : "#ffffff",
        "#cbd5e1"
      );
      doc.font(row.__isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(8);
      doc.fillColor("#0f172a").text(String(cell), curX + 2, curY + 7, {
        width: columns[i].width - 4,
        align: "center",
      });
      curX += columns[i].width;
    });
    curY += rowHeight;
  });

  doc.y = curY + 10;
}

/**
 * One row per individual production entry in the selected date range (not
 * aggregated by day) — every entry's own Date + Machine + selected metrics,
 * plus a TOTAL row for the whole range.
 * @returns {PDFDocument} a readable PDFKit stream — caller pipes it to the response.
 */
function buildOeeReportPdf({ entries, filterDescription, from, to, columns }) {
  const doc = new PDFDocument({ margin: 30, layout: "landscape", size: "A4" });

  doc.fontSize(16).font("Helvetica-Bold").fillColor("#0a1930").text("Efficiency Report (OEE)");
  doc.moveDown(0.3);
  doc.fontSize(10).font("Helvetica").fillColor("#334155").text(filterDescription);
  doc.fontSize(9).fillColor("#64748b").text(from === to ? `Date: ${from}` : `Date Range: ${from} to ${to}`);
  doc.moveDown(0.8);

  if (entries.length === 0) {
    doc.fontSize(11).fillColor("#64748b").text("No production entries found for the selected filters.");
    return doc;
  }

  const cols = resolveColumns(columns);
  const tableColumns = [
    { key: "date", label: "Date", width: 70 },
    { key: "machine", label: "Machine", width: 90 },
    ...cols,
  ];

  const sorted = [...entries].sort((a, b) => {
    const d = dateStrOf(a).localeCompare(dateStrOf(b));
    return d !== 0 ? d : machineNameOf(a).localeCompare(machineNameOf(b));
  });

  const rows = sorted.map((e) => {
    const agg = aggregateOee([e]);
    return [dateStrOf(e), machineNameOf(e), ...cols.map((c) => c.fmt(agg[c.key]))];
  });

  const totalAgg = aggregateOee(entries);
  const totalRow = ["TOTAL", "", ...cols.map((c) => c.fmt(totalAgg[c.key]))];
  totalRow.__isTotal = true;
  rows.push(totalRow);

  drawTable(doc, { x: 30, columns: tableColumns, rows });

  return doc;
}

// ── Per-machine "Efficiency Report (OEE)" PDF — mirrors the Dashboard's
// on-screen card (3-column grid, navy headers, big OEE% footer), repeated
// once per machine. This is what the Dashboard's quick "Download PDF"
// button uses — scoped to whichever process(es) the user picks in that
// popup (every machine tagged under them, zero-filled if no entries),
// unlike the more broadly filterable Custom Report (buildOeeReportPdf
// above), which also allows a single specific machine. ─────────────────
const minFmt = (n) => Number(n || 0).toFixed(2);
const qtyFmt = (n) => String(Math.round(Number(n || 0)));
const pctFmt = (n) => Number(n || 0).toFixed(2) + "%";

function drawEfficiencyCard(doc, { x, y, width, machineLabel, agg }) {
  const colW = width / 3;
  const headerH = 26;
  const valueH = 32;
  const spacer = 8;
  let curY = y;

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0a1930").text(machineLabel, x, curY, { width });
  curY += 20;

  const rows = [
    [
      ["Available Working Time (mins)", "Working/ scheduled time (min)", "Availability Ratio"],
      [minFmt(agg.availMin), minFmt(agg.workMin), pctFmt(agg.availRatio)],
    ],
    [
      ["OK Quantity", "Process Quantity (Total Qty)", "Quality Ratio"],
      [qtyFmt(agg.okQty), qtyFmt(agg.processQty), pctFmt(agg.qualRatio)],
    ],
    [
      ["Process Quantity (Total Qty)", "Ideal Quantity", "Performance Ratio"],
      [qtyFmt(agg.processQty), minFmt(agg.idealQty), pctFmt(agg.perfRatio)],
    ],
  ];

  rows.forEach(([headers, values]) => {
    headers.forEach((h, i) => {
      doc.rect(x + i * colW, curY, colW, headerH).fillAndStroke("#0a1930", "#0a1930");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5).text(h, x + i * colW + 3, curY + 8, {
        width: colW - 6,
        align: "center",
      });
    });
    curY += headerH;
    values.forEach((v, i) => {
      const isRatioCol = i === 2;
      doc.rect(x + i * colW, curY, colW, valueH).fillAndStroke(isRatioCol ? "#f8f9fa" : "#ffffff", "#cbd5e1");
      doc.fillColor("#0f172a").font(isRatioCol ? "Helvetica-Bold" : "Helvetica").fontSize(9).text(v, x + i * colW + 3, curY + 11, {
        width: colW - 6,
        align: "center",
      });
    });
    curY += valueH + spacer;
  });

  doc.rect(x, curY, width, headerH).fillAndStroke("#0a1930", "#0a1930");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9).text("OEE %", x, curY + 8, { width, align: "center" });
  curY += headerH;

  const oeeH = 40;
  doc.rect(x, curY, width, oeeH).fillAndStroke("#f0f4f8", "#cbd5e1");
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text(pctFmt(agg.oee), x, curY + 9, { width, align: "center" });
  curY += oeeH;

  return curY;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "YYYY-MM-DD" → weekday name, parsed as a local date so it never shifts a
// day off because of UTC conversion.
function weekdayName(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
}

const CARD_HEIGHT = 20 + 3 * (26 + 32 + 8) + 26 + 40;
const GROUP_HEADER_HEIGHT = 26;

const TOTAL_ACCENT_WIDTH = 5;

// Draws the process's combined-total card with a colored left accent strip
// so it reads as distinct from the individual machine cards below it —
// same table format either way (zero-filled machines look identical to
// ones with real data, just all-0 values).
function drawProcessTotalCard(doc, { x, y, width, processName, agg }) {
  doc.rect(x, y, TOTAL_ACCENT_WIDTH, CARD_HEIGHT).fill("#2563eb");
  return drawEfficiencyCard(doc, {
    x: x + TOTAL_ACCENT_WIDTH + 8,
    y,
    width: width - TOTAL_ACCENT_WIDTH - 8,
    machineLabel: `Process Total — ${processName}`,
    agg,
  });
}

/**
 * @param grouped [{ processName, total, machines: [{ machineName, agg }] }]
 * @returns {PDFDocument} a readable PDFKit stream — caller pipes it to the response.
 */
function buildOeeDashboardPdf({ grouped, from, to }) {
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  const x = 30;
  const width = doc.page.width - 60;
  const cardGap = 24;
  const groupGap = 16;

  doc.fontSize(16).font("Helvetica-Bold").fillColor("#0a1930").text("Efficiency Report (OEE) — By Process");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#64748b").text(
    from === to ? `Date: ${from} (${weekdayName(from)})` : `Date Range: ${from} to ${to}`
  );
  doc.moveDown(0.8);

  if (grouped.length === 0) {
    doc.fontSize(11).fillColor("#64748b").text("No matching process found.");
    return doc;
  }

  let curY = doc.y;
  grouped.forEach(({ processName, total, machines }) => {
    // Keep the process header glued to at least its total card.
    if (curY + GROUP_HEADER_HEIGHT + CARD_HEIGHT > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ size: "A4", margin: 30 });
      curY = doc.page.margins.top;
    }

    doc.rect(x, curY, width, GROUP_HEADER_HEIGHT).fillAndStroke("#1f2937", "#1f2937");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10).text(`Process: ${processName}`, x + 8, curY + 7);
    curY += GROUP_HEADER_HEIGHT + 10;

    if (curY + CARD_HEIGHT > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ size: "A4", margin: 30 });
      curY = doc.page.margins.top;
    }
    curY = drawProcessTotalCard(doc, { x, y: curY, width, processName, agg: total });
    curY += cardGap;

    // Every machine under this process — including ones with no entries
    // today, shown with all-0 values rather than skipped.
    machines.forEach(({ machineName, agg }) => {
      if (curY + CARD_HEIGHT > doc.page.height - doc.page.margins.bottom) {
        doc.addPage({ size: "A4", margin: 30 });
        curY = doc.page.margins.top;
      }
      curY = drawEfficiencyCard(doc, { x, y: curY, width, machineLabel: `Machine: ${machineName}`, agg });
      curY += cardGap;
    });

    curY += groupGap;
  });

  return doc;
}

module.exports = { buildOeeReportPdf, buildOeeDashboardPdf, ALL_COLUMNS };
