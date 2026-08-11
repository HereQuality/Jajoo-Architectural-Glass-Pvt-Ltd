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
 * denominator is zero — e.g. no entries in range, or every entry in the
 * group had an NA Available Working Time (see productionCalculation.service
 * .js) so nothing contributed to idealQty/availableWorkingMin. This mirrors
 * spreadsheet #N/A on a divide-by-zero formula.
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
      groups.set(key, { name: nameFn(e), processQty: 0, okQty: 0, idealQty: 0, workingScheduleMin: 0, availableWorkingMin: 0 });
    }
    const g = groups.get(key);
    g.processQty += Number(e.processQty) || 0;
    g.okQty += Number(e.okQty) || 0;
    const ideal = e.calculated?.idealProductionQty;
    if (ideal != null) g.idealQty += Number(ideal) || 0;
    g.workingScheduleMin += Number(e.calculated?.workingScheduleMin) || 0;
    const avail = e.calculated?.availableWorkingMin;
    if (avail != null) g.availableWorkingMin += Number(avail) || 0;
  }

  return [...groups.values()]
    .map((g) => {
      const performanceRatio = g.idealQty > 0 ? round2((g.processQty / g.idealQty) * 100) : null;
      const qualityRatio = g.processQty > 0 ? round2((g.okQty / g.processQty) * 100) : null;
      const availabilityRatio = g.workingScheduleMin > 0 ? round2((g.availableWorkingMin / g.workingScheduleMin) * 100) : null;
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
