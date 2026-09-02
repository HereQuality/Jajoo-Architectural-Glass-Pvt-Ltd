"use strict";

/**
 * Aggregates a set of ProductionEntry rows into the same summary shape as
 * the Dashboard's "Efficiency Report (OEE)" table (client/src/pages/
 * Dashboard.jsx `reportData`). Single source of truth for that math so the
 * PDF report (per-day rows + totals row) never drifts from what's shown
 * on screen.
 *
 * Working Schedule Time / Available Working Time / Effective M/C Run Time
 * are BATCH-level (see productionCalculation.service.js's
 * computeBatchCalculations) — identical across every entry saved together
 * from one "Add Entry" submission, so they're only added once per batchId
 * (a standalone entry, with no batchId, is its own one-entry batch and
 * always counts). Production Qty / OK Qty / Ideal Qty / Standard Minutes
 * for Output are per-row and always summed across every entry.
 */
function aggregateOee(entries) {
  let sumWork = 0;
  let sumAvail = 0;
  let sumProcess = 0;
  let sumOk = 0;
  let sumIdeal = 0;
  let sumEffectiveRun = 0;
  let sumStdMinutes = 0;
  const seenBatchKeys = new Set();

  for (const e of entries) {
    sumProcess += Number(e.processQty) || 0;
    sumOk += Number(e.okQty) || 0;
    sumIdeal += Number(e.calculated?.idealProductionQty) || 0;
    sumStdMinutes += (Number(e.processQty) || 0) * (Number(e.standardTimePerPieceMin) || 0);

    const batchKey = e.batchId ? String(e.batchId) : `_solo:${e._id}`;
    if (!seenBatchKeys.has(batchKey)) {
      seenBatchKeys.add(batchKey);
      sumWork += Number(e.calculated?.workingScheduleMin) || 0;
      sumAvail += Number(e.calculated?.availableWorkingMin) || 0;
      sumEffectiveRun += Number(e.calculated?.effectiveMcRunTimeMin) || 0;
    }
  }

  // Availability = Effective Run Time ÷ Available Working Time. Performance
  // = Standard Minutes for Output ÷ Effective Run Time. Mirrors
  // productionCalculation.service.js's computeBatchCalculations.
  const availRatio = sumAvail > 0 ? (sumEffectiveRun / sumAvail) * 100 : 0;
  const qualRatio = sumProcess > 0 ? (sumOk / sumProcess) * 100 : 0;
  const perfRatio = sumEffectiveRun > 0 ? (sumStdMinutes / sumEffectiveRun) * 100 : 0;
  const oee = (availRatio / 100) * (perfRatio / 100) * (qualRatio / 100) * 100;

  return {
    workMin: sumWork,
    availMin: sumAvail,
    availRatio,
    processQty: sumProcess,
    okQty: sumOk,
    qualRatio,
    idealQty: sumIdeal,
    perfRatio,
    oee,
  };
}

module.exports = { aggregateOee };
