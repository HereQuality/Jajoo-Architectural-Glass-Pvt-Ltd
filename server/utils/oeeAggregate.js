"use strict";

/**
 * Aggregates a set of ProductionEntry rows into the same summary shape as
 * the Dashboard's "Efficiency Report (OEE)" table (client/src/pages/
 * Dashboard.jsx `reportData`). Single source of truth for that math so the
 * PDF report (per-day rows + totals row) never drifts from what's shown
 * on screen.
 */
function aggregateOee(entries) {
  let sumWork = 0;
  let sumAvail = 0;
  let sumProcess = 0;
  let sumOk = 0;
  let sumIdeal = 0;

  for (const e of entries) {
    sumWork += Number(e.calculated?.workingScheduleMin) || 0;
    sumAvail += Number(e.calculated?.availableWorkingMin) || 0;
    sumProcess += Number(e.processQty) || 0;
    sumOk += Number(e.okQty) || 0;
    sumIdeal += Number(e.calculated?.idealProductionQty) || 0;
  }

  const availRatio = sumWork > 0 ? (sumAvail / sumWork) * 100 : 0;
  const qualRatio = sumProcess > 0 ? (sumOk / sumProcess) * 100 : 0;
  const perfRatio = sumIdeal > 0 ? (sumProcess / sumIdeal) * 100 : 0;
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
