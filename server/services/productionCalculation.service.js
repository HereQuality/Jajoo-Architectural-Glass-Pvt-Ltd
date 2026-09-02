"use strict";

/**
 * OEE Calculation Service — Glass Grinding
 *
 * Corrected 2026-08-31 per factory OEE review (worked example: M1, 25 Aug
 * 2026, one shift split into 3 size entries). The prior version computed
 * Working Schedule/Total Stoppage/Available Working/Effective Run Time
 * PER ENTRY — fine for a single entry, but when one shift is split into
 * multiple "batch" entries (same Process/Machine/Date/Operator/Shift,
 * several M/C Timing + Downtime rows), each entry independently claimed
 * close to the whole shift's schedule/availability time, so summing across
 * a batch (in the Efficiency Report / Dashboard OEE trend) double- or
 * triple-counted it.
 *
 * Fix: these fields are now computed ONCE PER BATCH (a standalone entry is
 * just a batch of one), from ALL rows sharing the batch's Process/Machine/
 * Date/Operator/Shift combined — and the SAME batch-level numbers are
 * stored on every entry belonging to that batch. Only Ideal Production Qty
 * stays a per-row figure (each row/size has its own Standard Time and its
 * own actual run span, used purely as that row's own capacity check).
 *
 * Batch-level formulas:
 *
 *   Overall M/C On/Off Time = earliest M/C Start Time across every row in
 *                             the batch, to the latest M/C Off Time across
 *                             every row.
 *   Working Schedule Time   = envelope spanning the EARLIER of Shift On/
 *                             Overall M/C Start to the LATER of Shift Off/
 *                             Overall M/C Off (same min/max rule as before,
 *                             just applied to the batch's overall on/off
 *                             instead of one entry's own mcStartTime/
 *                             mcOffTime). Equivalently Shift Time + Overtime
 *                             before/after the shift.
 *   Total Stoppage          = sum of every row's own Downtime & Stoppage
 *                             Reason minutes (EXCLUDING Planned Downtime),
 *                             added across the whole batch.
 *   Available Working Time  = Working Schedule Time − Total Stoppage (NA
 *                             when Total Stoppage ≥ Working Schedule Time)
 *   Effective M/C Run Time  = sum, across every row in the batch, of that
 *                             row's own actual on-time span (M/C Off − M/C
 *                             Start) — the real clock time the machine was
 *                             running, NOT Production Qty × Standard Time.
 *   Unreported Time         = Available Working Time − Effective M/C Run
 *                             Time (NA if AWT is NA) — time neither declared
 *                             as stoppage nor accounted for by a recorded run.
 *   Availability Ratio      = Effective M/C Run Time ÷ Available Working
 *                             Time (NA if AWT is NA) — did the batch run for
 *                             as long as it was actually available to run?
 *   Performance Ratio       = (Σ Production Qty × Standard Time, across the
 *                             batch) ÷ Effective M/C Run Time (NA if AWT is
 *                             NA) — the classic OEE speed-loss ratio: ideal
 *                             time to make what was actually produced vs.
 *                             how long the machine actually ran.
 *   Quality Ratio           = Σ OK Qty ÷ Σ Production Qty, across the batch.
 *   OEE %                   = Availability × Performance × Quality × 100
 *                             (NA if AWT is NA)
 *
 * Per-row formula (not shared across the batch):
 *
 *   Ideal Production (Qty)  = that row's own (M/C Off − M/C Start) ÷ that
 *                             row's own Standard Time per Glass — "given how
 *                             long this size actually ran, how many pieces
 *                             should it have made at standard speed." Used
 *                             only for the entry-time capacity check, not
 *                             part of the ratio chain above.
 *
 * Overtime / Start Delay / Early Closed (batch-level, derived from the
 * shared Shift On/Off vs. the batch's Overall M/C On/Off Time):
 *   Overtime       = max(0, Shift On − Overall M/C Start) + max(0, Overall M/C Off − Shift Off)
 *   Start Delay    = max(0, Overall M/C Start − Shift On)
 *   Early Closed   = max(0, Shift Off − Overall M/C Off)
 *
 * NOTE: `calculated` is computed server-side at save time and stored, so
 * historical rows never change unless explicitly recomputed (see
 * seed/recomputeCalculated.js) — and because these fields are now
 * batch-level, adding/editing/removing ANY row in a batch recomputes and
 * re-saves every sibling row's `calculated`, not just the row being edited
 * (see recomputeBatchAndSave in productionEntry.controller.js).
 */

// Downtime & Stoppage Reason fields summed for Total Stoppage — EXCLUDES
// plannedDowntimeMin (entered/stored on the entry, but not part of this
// total) and overtime (added separately, never subtracted here).
const STOPPAGE_KEYS = [
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

// Shortest signed distance (in minutes) from `from` (HH:mm) to `to` (HH:mm)
// within a 24h cycle: positive when `to` comes after `from`, negative when
// `to` comes before `from`. Caps the wrap-forward distance at half a day so
// "5 min before" isn't mistaken for "1435 min after".
function signedDiffMin(from, to) {
  let diff = (timeToMinutes(to) - timeToMinutes(from) + 1440) % 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

// Overtime / Start Delay / Early Closed, derived from Shift On/Off vs. the
// batch's Overall M/C On/Off Time. Returns zeros when shift times are absent.
function deriveShiftDelta(shiftOnTime, shiftOffTime, mcStartTime, mcOffTime) {
  if (!shiftOnTime || !shiftOffTime) {
    return { overtimeMin: 0, startDelayMin: 0, earlyClosedMin: 0 };
  }
  const startDeltaMin = signedDiffMin(shiftOnTime, mcStartTime); // + late start, - early start
  const offDeltaMin = signedDiffMin(shiftOffTime, mcOffTime); // + late finish, - early finish
  const startDelayMin = Math.max(0, startDeltaMin);
  const earlyStartMin = Math.max(0, -startDeltaMin);
  const lateFinishMin = Math.max(0, offDeltaMin);
  const earlyClosedMin = Math.max(0, -offDeltaMin);
  return { overtimeMin: earlyStartMin + lateFinishMin, startDelayMin, earlyClosedMin };
}

// Working Schedule Time = duration of the envelope spanning the EARLIER of
// Shift On/Overall M/C Start to the LATER of Shift Off/Overall M/C Off — a
// direct min/max condition, computed independently of deriveShiftDelta's
// Overtime value (Overtime is a separate, purely informational metric).
function workingScheduleEnvelopeMin(shiftOnTime, shiftOffTime, mcStartTime, mcOffTime) {
  if (!shiftOnTime || !shiftOffTime) return shiftDuration(mcStartTime, mcOffTime);
  const shiftOwnDurationMin = shiftDuration(shiftOnTime, shiftOffTime);
  const startDeltaMin = signedDiffMin(shiftOnTime, mcStartTime); // + M-C started after Shift On, - before
  const offDeltaMin = signedDiffMin(shiftOffTime, mcOffTime); // + M-C ended after Shift Off, - before
  const effectiveStartOffsetMin = Math.min(0, startDeltaMin); // <=0: how much earlier than Shift On the envelope starts
  const effectiveEndOffsetMin = Math.max(0, offDeltaMin); // >=0: how much later than Shift Off the envelope ends
  return Math.max(shiftOwnDurationMin - effectiveStartOffsetMin + effectiveEndOffsetMin, 0);
}

// Per-row Ideal Production Qty — that row's own actual run span (M/C Off −
// M/C Start) ÷ its own Standard Time per Glass. Independent of the batch
// (no Available Working Time involved) — purely "how many pieces should
// THIS row have made in the time it actually ran, at standard speed."
function computeRowIdealProductionQty(row) {
  const std = Number(row.standardTimePerPieceMin) || 0;
  if (std <= 0) return 0;
  const runMin = shiftDuration(row.mcStartTime, row.mcOffTime);
  return runMin / std;
}

// Batch-level calculated fields, shared identically across every row in the
// batch — `rows` is every entry sharing this batch's Process/Machine/Date/
// Operator/Shift (a standalone entry is simply a batch of one).
function computeBatchCalculations(rows, shiftOnTime, shiftOffTime) {
  const num = (v) => Number(v) || 0;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Ratio fields (0–1) are displayed as a percentage with 2 decimal places
  // (e.g. 93.79%) — round2 on the raw 0–1 ratio only keeps whole-percent
  // precision (0.94 → always "94.00%"), so these need 4 decimal places on
  // the ratio itself to preserve 2 decimal places once ×100.
  const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

  // 1. Overall M/C On/Off Time = earliest M/C Start across the batch to the
  // latest M/C Off across the batch.
  const overallMcStart = rows.reduce((min, r) => (min === null || timeToMinutes(r.mcStartTime) < timeToMinutes(min) ? r.mcStartTime : min), null);
  const overallMcOff = rows.reduce((max, r) => (max === null || timeToMinutes(r.mcOffTime) > timeToMinutes(max) ? r.mcOffTime : max), null);

  // Shift Duration — the shift's own scheduled window, falling back to the
  // batch's overall M/C span only when there's no shift at all.
  const shiftDurationMin = (shiftOnTime && shiftOffTime)
    ? shiftDuration(shiftOnTime, shiftOffTime)
    : shiftDuration(overallMcStart, overallMcOff);

  // Overtime / Start Delay / Early Closed — derived from the shared Shift
  // On/Off vs. the batch's Overall M/C On/Off Time. Informational only.
  const { overtimeMin, startDelayMin, earlyClosedMin } = deriveShiftDelta(
    shiftOnTime, shiftOffTime, overallMcStart, overallMcOff,
  );

  // 2. Total Stoppage = sum of every row's own Downtime & Stoppage Reason
  // minutes, EXCLUDING Planned Downtime.
  const totalStoppageMin = rows.reduce((sum, r) => sum + STOPPAGE_KEYS.reduce((s, k) => s + num(r[k]), 0), 0);

  // 3. Working Schedule Time = envelope span (earlier of Shift On/Overall
  // M/C Start to later of Shift Off/Overall M/C Off).
  const workingScheduleMin = workingScheduleEnvelopeMin(shiftOnTime, shiftOffTime, overallMcStart, overallMcOff);

  // 4. Available Working Time = Working Schedule Time − Total Stoppage. NA
  // (null) when stoppage consumes the entire working schedule.
  const isAwtNa = totalStoppageMin >= workingScheduleMin;
  const availableWorkingMin = isAwtNa ? null : round2(workingScheduleMin - totalStoppageMin);

  // 5. Effective M/C Run Time = sum of every row's own actual on-time span
  // (M/C Off − M/C Start) — the real clock time the machine ran.
  const effectiveMcRunTimeMin = rows.reduce((sum, r) => sum + shiftDuration(r.mcStartTime, r.mcOffTime), 0);

  // 6. Unreported Time = Available Working Time − Effective M/C Run Time.
  const unreportedTimeMin = isAwtNa ? null : availableWorkingMin - effectiveMcRunTimeMin;

  // 7. Availability Ratio = Effective M/C Run Time ÷ Available Working Time
  const availabilityRatio = isAwtNa ? null : (availableWorkingMin > 0 ? effectiveMcRunTimeMin / availableWorkingMin : 0);

  // 8. Performance Ratio = (Σ Production Qty × Standard Time) ÷ Effective
  // M/C Run Time — ideal time to make what was actually produced vs. how
  // long the machine actually ran.
  const stdMinutesForOutput = rows.reduce((sum, r) => sum + num(r.processQty) * num(r.standardTimePerPieceMin), 0);
  const performanceRatio = isAwtNa ? null : (effectiveMcRunTimeMin > 0 ? stdMinutesForOutput / effectiveMcRunTimeMin : 0);

  // 9. Quality Ratio = Σ OK Qty ÷ Σ Production Qty, across the batch.
  const totalProcessQty = rows.reduce((s, r) => s + num(r.processQty), 0);
  const totalOkQty = rows.reduce((s, r) => s + num(r.okQty), 0);
  const qualityRatio = totalProcessQty > 0 ? totalOkQty / totalProcessQty : 0;

  // 10. OEE % = Availability × Performance × Quality × 100
  const oeePercent = isAwtNa ? null : availabilityRatio * performanceRatio * qualityRatio * 100;

  return {
    shiftDurationMin:     round2(shiftDurationMin),
    totalStoppageMin:     round2(totalStoppageMin),
    workingScheduleMin:   round2(workingScheduleMin),
    availableWorkingMin:  availableWorkingMin === null ? null : round2(availableWorkingMin),
    effectiveMcRunTimeMin:round2(effectiveMcRunTimeMin),
    unreportedTimeMin:    unreportedTimeMin === null ? null : round2(unreportedTimeMin),
    availabilityRatio:    availabilityRatio === null ? null : round4(availabilityRatio),
    performanceRatio:     performanceRatio === null ? null : round4(performanceRatio),
    qualityRatio:         round4(qualityRatio),
    oeePercent:           oeePercent === null ? null : round2(oeePercent),
    overtimeMin:          round2(overtimeMin),
    startDelayMin:        round2(startDelayMin),
    earlyClosedMin:       round2(earlyClosedMin),
  };
}

module.exports = {
  computeBatchCalculations,
  computeRowIdealProductionQty,
  shiftDuration,
  signedDiffMin,
  STOPPAGE_KEYS,
};
