"use strict";

/**
 * OEE Calculation Service — Glass Grinding
 *
 * Formulas (as defined by the factory / business owner):
 *
 *   Shift Duration          = M/C Off Time − M/C Start Time (handles midnight crossover)
 *   Total Stoppage          = Sum of ALL Downtime & Stoppage Reason minutes, INCLUDING
 *                             Planned Downtime (Planned Downtime + No Manpower + Mechanical
 *                              Breakdown + Electrical Breakdown + Raw Material Not
 *                              Available + Stoppage(Human Error) + Changeover +
 *                              Raw Material Problem + No Power + Others)
 *   Working Schedule Time   = Shift Duration + Overtime
 *   Available Working Time  = Working Schedule Time − Total Stoppage
 *                             (NA when Total Stoppage ≥ Working Schedule Time — i.e. the
 *                              whole shift was consumed by downtime/stoppage, so there is
 *                              no time left to produce anything)
 *   Ideal Production (Qty)  = Available Working Time ÷ Standard Time per Glass (NA if AWT is NA)
 *   Effective M/C Run Time  = Process Qty × Standard Time per Glass
 *   Unreported Time         = Available Working Time − Effective M/C Run Time (NA if AWT is NA)
 *   Availability Ratio      = Available Working Time ÷ Working Schedule Time (NA if AWT is NA)
 *   Performance Ratio       = Effective M/C Run Time ÷ Available Working Time (NA if AWT is NA)
 *   Quality Ratio           = OK Qty ÷ Process Qty
 *   OEE %                   = Availability Ratio × Performance Ratio × Quality Ratio × 100 (NA if AWT is NA)
 *
 * Planned Downtime is subtracted from Working Schedule Time exactly ONCE — as a
 * member of Total Stoppage. It must never also be subtracted separately when
 * computing Working Schedule Time, or it gets double-counted.
 *
 * NOTE: `calculated` is computed server-side at save time and stored, so
 * historical rows never change if formulas are tweaked later.
 */

// All Downtime & Stoppage Reason fields (EXCLUDING overtime) — summed for Total Stoppage
const STOPPAGE_KEYS = [
  "plannedDowntimeMin",
  "noManpowerMin",
  "mechanicalBreakdownMin",
  "electricalBreakdownMin",
  "rawMaterialNotAvailableMin",
  "humanErrorStoppageMin",
  "changeoverMin",
  "rawMaterialProblemMin",
  "noPowerMin",
  "othersMin",
];

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function shiftDuration(startTime, offTime) {
  let diff = timeToMinutes(offTime) - timeToMinutes(startTime);
  if (diff <= 0) diff += 24 * 60; // crosses midnight
  return diff;
}

function computeCalculations(entry) {
  const num = (v) => Number(v) || 0;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // 1. Shift Duration = M/C Off Time − M/C Start Time
  const shiftDurationMin = shiftDuration(entry.mcStartTime, entry.mcOffTime);

  // 2. Total Stoppage = sum of all Downtime & Stoppage Reason minutes,
  // INCLUDING Planned Downtime (excludes overtime, which is added instead of
  // subtracted — see Working Schedule Time below)
  const totalStoppageMin = STOPPAGE_KEYS.reduce((s, k) => s + num(entry[k]), 0);

  // 3. Working Schedule Time = (M/C Off − M/C Start) + Overtime. Planned
  // Downtime is NOT subtracted here — it's already inside totalStoppageMin
  // (STOPPAGE_KEYS[0]), and subtracting it again here would double-count it.
  const workingScheduleMin = Math.max(shiftDurationMin + num(entry.overtimeMin), 0);

  // 4. Available Working Time = Working Schedule Time − Total Stoppage.
  // NA (null) when stoppage consumes the entire working schedule — there is
  // no time left to produce anything, so this isn't "0 minutes available",
  // it's an undefined/inapplicable quantity, and nothing downstream that
  // divides by it should render as a normal number either.
  const isAwtNa = totalStoppageMin >= workingScheduleMin;
  const availableWorkingMin = isAwtNa ? null : round2(workingScheduleMin - totalStoppageMin);

  const standardTimePerPieceMin = num(entry.standardTimePerPieceMin);

  // 5. Ideal Production = Available Working Time ÷ Standard Time per Glass
  const idealProductionQty = isAwtNa ? null : (standardTimePerPieceMin > 0 ? availableWorkingMin / standardTimePerPieceMin : 0);

  // 6. Effective M/C Run Time = Process Qty × Standard Time per Glass
  const effectiveMcRunTimeMin = num(entry.processQty) * standardTimePerPieceMin;

  // 7. Unreported Time = Available Working Time − Effective M/C Run Time
  const unreportedTimeMin = isAwtNa ? null : availableWorkingMin - effectiveMcRunTimeMin;

  // 8. Availability Ratio = Available Working Time ÷ Working Schedule Time
  const availabilityRatio = isAwtNa ? null : (workingScheduleMin > 0 ? availableWorkingMin / workingScheduleMin : 0);

  // 9. Performance Ratio = Process Qty ÷ Ideal Production
  const performanceRatio = isAwtNa ? null : (idealProductionQty > 0 ? num(entry.processQty) / idealProductionQty : 0);

  // 10. Quality Ratio = OK Qty ÷ Process Qty
  const qualityRatio = num(entry.processQty) > 0 ? num(entry.okQty) / num(entry.processQty) : 0;

  // 11. OEE % = Availability × Performance × Quality × 100
  const oeePercent = isAwtNa ? null : availabilityRatio * performanceRatio * qualityRatio * 100;

  return {
    shiftDurationMin:     round2(shiftDurationMin),
    totalStoppageMin:     round2(totalStoppageMin),
    workingScheduleMin:   round2(workingScheduleMin),
    availableWorkingMin:  availableWorkingMin === null ? null : round2(availableWorkingMin),
    idealProductionQty:   idealProductionQty === null ? null : round2(idealProductionQty),
    effectiveMcRunTimeMin:round2(effectiveMcRunTimeMin),
    unreportedTimeMin:    unreportedTimeMin === null ? null : round2(unreportedTimeMin),
    availabilityRatio:    availabilityRatio === null ? null : round2(availabilityRatio),
    performanceRatio:     performanceRatio === null ? null : round2(performanceRatio),
    qualityRatio:         round2(qualityRatio),
    oeePercent:           oeePercent === null ? null : round2(oeePercent),
  };
}

module.exports = { computeCalculations, shiftDuration, STOPPAGE_KEYS };
