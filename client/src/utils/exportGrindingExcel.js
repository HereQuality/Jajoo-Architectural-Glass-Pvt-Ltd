// Excel export of the Grinding Data Entry sheet — one row per saved entry
// (a multi-entry batch is flattened so every entry is filterable/sortable),
// with every entered + calculated column the on-screen sheet has, plus each
// Rejection / Downtime & Stoppage Reason's optional remark right after its
// value. Numbers are real numbers (not text) so Excel can sum/filter them.
import { computeBatchCalculations } from "./productionCalculation";
import { parseLocalDate } from "./workingDays";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Column-group header colours (ARGB, light fill + dark text).
const GROUPS = {
  entry:     { label: "Entry",                    fill: "FFE2E8F0", font: "FF1E293B" },
  timing:    { label: "Machine Timing",           fill: "FFE0E7FF", font: "FF3730A3" },
  quantity:  { label: "Quantities",               fill: "FFD1FAE5", font: "FF065F46" },
  rejection: { label: "Rejection Reasons",        fill: "FFFEE2E2", font: "FF991B1B" },
  stoppage:  { label: "Downtime & Stoppage",      fill: "FFFEF3C7", font: "FF92400E" },
  calc:      { label: "Calculated (OEE)",         fill: "FFEDE9FE", font: "FF5B21B6" },
  day:       { label: "Whole-Day Totals",         fill: "FFDBEAFE", font: "FF1E40AF" },
};

const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const machineName = (e) => (typeof e.machine === "object" ? e.machine?.machineName : "") || "";
const machineId = (e) => String(typeof e.machine === "object" ? e.machine?._id : e.machine);
const dayKey = (e) => (typeof e.date === "string" ? e.date.split("T")[0] : new Date(e.date).toISOString().split("T")[0]);

// "10:00–11:00; 12:00–13:00" for an entry's Additional ON/OFF periods.
const additionalPeriodsText = (e) =>
  (e.additionalPeriods || []).map((p) => `${p.startTime}–${p.endTime}`).join("; ");

export function buildGrindingColumns({ rejectionFields, stoppageFields }) {
  const c = (e) => e.calculated || {};
  const shiftOn = (e) => e.shiftOnTime || (typeof e.machine === "object" ? e.machine?.machineOnTime : "") || "";
  const shiftOff = (e) => e.shiftOffTime || (typeof e.machine === "object" ? e.machine?.machineOffTime : "") || "";

  // A reason's value column followed by its remark column.
  const reasonCols = (fields, group, unit) =>
    fields.flatMap((f) => [
      { header: `${f.label}${unit}`, group, width: 16, type: "int", get: (e) => num(e[f.key]) ?? 0 },
      { header: `${f.label} – Remark`, group, width: 28, type: "text", wrap: true, get: (e) => e[f.remarkKey] || "" },
    ]);

  const [planned, ...otherStoppages] = stoppageFields;

  return [
    { header: "Date", group: "entry", width: 12, type: "date", get: (e) => {
      // ExcelJS writes Dates as UTC, so pin the calendar day to UTC midnight —
      // a local-midnight Date would land on the previous day east of UTC.
      const d = parseLocalDate(e.date);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    } },
    { header: "Machine", group: "entry", width: 22, type: "text", get: machineName },
    { header: "Operator", group: "entry", width: 20, type: "text", get: (e) => e.operator?.name || "" },
    { header: "Size (mm)", group: "entry", width: 14, type: "text", get: (e) => `${e.sizeWidthMm}×${e.sizeHeightMm}` },
    { header: "Thickness (mm)", group: "entry", width: 14, type: "text", get: (e) => (e.thicknessMm == null ? "" : String(e.thicknessMm)) },
    { header: "Standard Time (min/pc)", group: "entry", width: 16, type: "dec", get: (e) => num(e.standardTimePerPieceMin) },

    { header: "M/C Start", group: "timing", width: 10, type: "text", get: (e) => e.mcStartTime || "" },
    { header: "M/C Off", group: "timing", width: 12, type: "text", get: (e) => (e.mcOffTime ? `${e.mcOffTime}${e.mcOffNextDay ? " (+1d)" : ""}` : "") },
    { header: "Additional M/C Periods", group: "timing", width: 24, type: "text", get: additionalPeriodsText },
    { header: "Shift On", group: "timing", width: 10, type: "text", get: shiftOn },
    { header: "Shift Off", group: "timing", width: 10, type: "text", get: shiftOff },
    { header: "Overtime (min)", group: "timing", width: 12, type: "int", get: (e) => num(c(e).overtimeMin) ?? 0 },
    { header: "Start Delay (min)", group: "timing", width: 12, type: "int", get: (e) => num(c(e).startDelayMin) ?? 0 },
    { header: "Early Closed (min)", group: "timing", width: 12, type: "int", get: (e) => num(c(e).earlyClosedMin) ?? 0 },

    { header: "Production Qty", group: "quantity", width: 14, type: "int", get: (e) => num(e.processQty) },
    { header: "OK Qty", group: "quantity", width: 10, type: "int", get: (e) => num(e.okQty) },
    { header: "Rejected Qty", group: "quantity", width: 12, type: "int", get: (e) => num(e.rejectedQty) ?? 0 },

    ...reasonCols(rejectionFields, "rejection", " (qty)"),

    { header: "Working Schedule Time (min)", group: "calc", width: 16, type: "dec", get: (e) => num(c(e).workingScheduleMin) },
    ...reasonCols([planned], "stoppage", " (min)"),
    { header: "Lunch (min)", group: "calc", width: 11, type: "dec", get: (e) => num(c(e).lunchMin) ?? 0 },
    { header: "Total Stoppage (min)", group: "calc", width: 14, type: "dec", get: (e) => num(c(e).totalStoppageMin) },
    ...reasonCols(otherStoppages, "stoppage", " (min)"),
    { header: "Available Working Time (min)", group: "calc", width: 16, type: "dec", get: (e) => num(c(e).availableWorkingMin) },
    { header: "Ideal Production (qty)", group: "calc", width: 14, type: "dec", get: (e) => num(c(e).idealProductionQty) },
    { header: "Effective M/C Run Time (min)", group: "calc", width: 16, type: "dec", get: (e) => num(c(e).effectiveMcRunTimeMin) },
    { header: "Unreported Time (min)", group: "calc", width: 14, type: "dec", get: (e) => num(c(e).unreportedTimeMin) },
    { header: "Availability Ratio", group: "calc", width: 12, type: "pct", get: (e) => num(c(e).availabilityRatio) },
    { header: "Performance Ratio", group: "calc", width: 12, type: "pct", get: (e) => num(c(e).performanceRatio) },
    { header: "Quality Ratio", group: "calc", width: 12, type: "pct", get: (e) => num(c(e).qualityRatio) },
    // oeePercent is stored already ×100 (e.g. 63.4), the ratios above are 0–1.
    { header: "OEE %", group: "calc", width: 10, type: "pct", get: (e) => (num(c(e).oeePercent) == null ? null : num(c(e).oeePercent) / 100) },

    // Whole-day totals (every entry of this Machine on this Date) — blank
    // when the day only has one entry, same as the on-screen sheet.
    { header: "Daily Availability", group: "day", width: 12, type: "pct", get: (e, day) => day?.availabilityRatio ?? null },
    { header: "Daily Performance", group: "day", width: 12, type: "pct", get: (e, day) => day?.performanceRatio ?? null },
    { header: "Daily Quality", group: "day", width: 12, type: "pct", get: (e, day) => day?.qualityRatio ?? null },
    { header: "Daily OEE %", group: "day", width: 11, type: "pct", get: (e, day) => (day?.oeePercent == null ? null : day.oeePercent / 100) },
  ];
}

const NUM_FMT = { int: "#,##0", dec: "#,##0.00", pct: "0.00%", date: "dd/mm/yyyy" };
const THIN = { style: "thin", color: { argb: "FFCBD5E1" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/**
 * @param {object[]} entries       populated production entries (all pages)
 * @param {object}   opts.rejectionFields / opts.stoppageFields  field defs from the page
 * @returns {Promise<ArrayBuffer>} the .xlsx file contents
 */
export async function buildGrindingWorkbook(entries, { rejectionFields, stoppageFields }) {
  const ExcelJS = (await import("exceljs")).default;
  const columns = buildGrindingColumns({ rejectionFields, stoppageFields });

  // Chronological: Date ↑, Machine, then the order entered.
  const sorted = [...entries].sort(
    (a, b) =>
      dayKey(a).localeCompare(dayKey(b)) ||
      machineName(a).localeCompare(machineName(b)) ||
      new Date(a.createdAt) - new Date(b.createdAt)
  );

  // Whole-day totals per Machine+Date, recomputed from the raw rows (summing
  // per-row ratios would be meaningless) — same function the sheet uses.
  const dayCache = new Map();
  const dayTotalsFor = (e) => {
    const key = `${machineId(e)}|${dayKey(e)}`;
    if (!dayCache.has(key)) {
      const rows = sorted.filter((x) => machineId(x) === machineId(e) && dayKey(x) === dayKey(e));
      const on = rows[0].shiftOnTime || (typeof rows[0].machine === "object" ? rows[0].machine?.machineOnTime : null);
      const off = rows[0].shiftOffTime || (typeof rows[0].machine === "object" ? rows[0].machine?.machineOffTime : null);
      dayCache.set(key, rows.length > 1 ? computeBatchCalculations(rows, on, off) : null);
    }
    return dayCache.get(key);
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Jajoo Architectural Glass";
  wb.created = new Date();
  const ws = wb.addWorksheet("Grinding Entries", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }], // header rows + Date/Machine stay put
  });

  ws.columns = columns.map((col) => ({ width: col.width }));

  // Row 1 — merged group bands; Row 2 — column headers.
  const groupRow = ws.getRow(1);
  const headerRow = ws.getRow(2);
  let spanStart = 0;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    const g = GROUPS[col.group];
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: g.font } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: g.fill } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER;

    const next = columns[i + 1];
    if (!next || next.group !== col.group) {
      const a = spanStart + 1;
      const b = i + 1;
      if (b > a) ws.mergeCells(1, a, 1, b);
      const gc = groupRow.getCell(a);
      gc.value = g.label;
      gc.font = { bold: true, color: { argb: g.font } };
      gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: g.fill } };
      gc.alignment = { vertical: "middle", horizontal: "center" };
      for (let k = a; k <= b; k++) groupRow.getCell(k).border = BORDER;
      spanStart = i + 1;
    }
  });
  groupRow.height = 20;
  headerRow.height = 44;

  sorted.forEach((e) => {
    const day = dayTotalsFor(e);
    const row = ws.addRow(columns.map((col) => col.get(e, day)));
    row.eachCell({ includeEmpty: true }, (cell, n) => {
      const col = columns[n - 1];
      cell.border = BORDER;
      cell.alignment = { vertical: "top", horizontal: col.type === "text" ? "left" : "right", wrapText: !!col.wrap };
      if (NUM_FMT[col.type]) cell.numFmt = NUM_FMT[col.type];
      if (cell.value === null || cell.value === undefined) cell.value = col.type === "text" ? "" : col.group === "day" ? "—" : "NA";
    });
  });

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } };
  return wb.xlsx.writeBuffer();
}

export { XLSX_MIME };
