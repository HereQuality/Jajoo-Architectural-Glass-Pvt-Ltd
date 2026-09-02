"use strict";

/**
 * Groups a set of ProductionEntry rows (e.g. by operator or by machine) and
 * reduces each group to the "Operator/Machine Efficiency" shape used by the
 * spreadsheet report this mirrors: Actual Total Qty produced, Total OK Qty,
 * Availability Ratio, Performance Ratio, Quality Ratio, OEE %.
 *
 * All ratios are computed from the group's summed quantities/minutes (not
 * averaged from per-entry ratios) — e.g. Quality Ratio = totalOkQty ÷
 * totalProcessQty, not the average of each entry's own quality ratio. This
 * keeps high-volume days weighted proportionally instead of letting a single
 * low-volume entry skew the group average, and it's NA (null) when the
 * denominator is zero.
 *
 * Working Schedule Time / Available Working Time / Effective M/C Run Time
 * are BATCH-level (see productionCalculation.service.js's
 * computeBatchCalculations) — identical across every entry saved together
 * from one "Add Entry" submission, so they're only added once per batchId
 * here (a standalone entry, with no batchId, is its own one-entry batch and
 * always counts). Production Qty / OK Qty / Standard Minutes for Output are
 * genuinely per-row and always summed across every entry.
 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function aggregateEfficiencyByGroup(entries, keyFn, nameFn) {
  const groups = new Map();

  for (const e of entries) {
    const key = keyFn(e);
    if (key == null) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        name: nameFn(e),
        processQty: 0,
        okQty: 0,
        stdMinutesForOutput: 0,
        workingScheduleMin: 0,
        availableWorkingMin: 0,
        effectiveMcRunTimeMin: 0,
        seenBatchKeys: new Set(),
      });
    }
    const g = groups.get(key);
    g.processQty += Number(e.processQty) || 0;
    g.okQty += Number(e.okQty) || 0;
    g.stdMinutesForOutput += (Number(e.processQty) || 0) * (Number(e.standardTimePerPieceMin) || 0);

    const batchKey = e.batchId ? String(e.batchId) : `_solo:${e._id}`;
    if (!g.seenBatchKeys.has(batchKey)) {
      g.seenBatchKeys.add(batchKey);
      g.workingScheduleMin += Number(e.calculated?.workingScheduleMin) || 0;
      const avail = e.calculated?.availableWorkingMin;
      if (avail != null) g.availableWorkingMin += Number(avail) || 0;
      g.effectiveMcRunTimeMin += Number(e.calculated?.effectiveMcRunTimeMin) || 0;
    }
  }

  return [...groups.values()]
    .map((g) => {
      // Availability = Effective Run Time ÷ Available Working Time.
      // Performance = Standard Minutes for Output ÷ Effective Run Time.
      // Mirrors productionCalculation.service.js's computeBatchCalculations.
      const availabilityRatio = g.availableWorkingMin > 0 ? round2((g.effectiveMcRunTimeMin / g.availableWorkingMin) * 100) : null;
      const performanceRatio = g.effectiveMcRunTimeMin > 0 ? round2((g.stdMinutesForOutput / g.effectiveMcRunTimeMin) * 100) : null;
      const qualityRatio = g.processQty > 0 ? round2((g.okQty / g.processQty) * 100) : null;
      const oeePercent =
        performanceRatio != null && qualityRatio != null && availabilityRatio != null
          ? round2((availabilityRatio * performanceRatio * qualityRatio) / 10000)
          : null;
      return {
        name: g.name,
        processQty: g.processQty,
        okQty: g.okQty,
        availabilityRatio,
        performanceRatio,
        qualityRatio,
        oeePercent,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { aggregateEfficiencyByGroup };
