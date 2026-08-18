"use strict";

/**
 * OEE Calculation Service — Glass Grinding
 *
 * Formulas (as defined by the factory / business owner):
 *
 *   Shift Duration          = Shift Off Time − Shift On Time (the entry's Machine's own
 *                             scheduled window — Shift Time Start/End, set in Machine
 *                             Master — NOT M/C Start/Off Time; falls back to M/C Off −
 *                             M/C Start only when the machine has no Shift Time of its own
 *                             configured). Handles midnight crossover.
 *   Total Stoppage          = Sum of Downtime & Stoppage Reason minutes, EXCLUDING Planned
 *                             Downtime (No Manpower + Mechanical Breakdown + Electrical
 *                             Breakdown + Raw Material Not Available + Stoppage (Human Error)
 *                             + Changeover + Raw Material Problem + No Power + Others).
 *                             Planned Downtime is still entered and stored on the entry, it
 *                             just doesn't feed into this particular total.
 *   Working Schedule Time   = duration of the envelope spanning the EARLIER of Shift On/M-C
 *                             Start Time to the LATER of Shift Off/M-C Off Time — computed
 *                             directly via that min/max condition (the same rule Machine
 *                             Master's Shift Time column uses), NOT by adding a separately
 *                             tracked Overtime value. Overtime/Start Delay/Early Closed are
 *                             still computed and stored as their own informational metrics
 *                             (see below) — they just don't feed into this formula anymore.
 *   Available Working Time  = Working Schedule Time − Total Stoppage
 *                             (NA when Total Stoppage ≥ Working Schedule Time — i.e. the
 *                              whole shift was consumed by downtime/stoppage, so there is
 *                              no time left to produce anything)
 *   Ideal Production (Qty)  = Available Working Time ÷ Standard Time per Glass (NA if AWT is NA)
 *   Effective M/C Run Time  = Production Qty × Standard Time per Glass
 *   Unreported Time         = Available Working Time − Effective M/C Run Time (NA if AWT is NA)
 *   Availability Ratio      = Available Working Time ÷ Working Schedule Time (NA if AWT is NA)
 *   Performance Ratio       = Effective M/C Run Time ÷ Available Working Time (NA if AWT is NA)
 *   Quality Ratio           = OK Qty ÷ Production Qty
 *   OEE %                   = Availability Ratio × Performance Ratio × Quality Ratio × 100 (NA if AWT is NA)
 *
 * Overtime / Start Delay / Early Closed (derived from the entry's Machine's own Shift
 * Time Start/End vs. its actual M/C Start/Off Time — not entered manually):
 *   Overtime       = max(0, Shift On − M/C Start) + max(0, M/C Off − Shift Off)
 *                    (minutes the machine ran outside its scheduled shift window)
 *   Start Delay    = max(0, M/C Start − Shift On)  (machine started after shift began)
 *   Early Closed   = max(0, Shift Off − M/C Off)   (machine stopped before shift ended)
 * `entry.shiftOnTime`/`entry.shiftOffTime` (passed in by the caller after
 * resolving the entry's Machine's own machineOnTime/machineOffTime) drive
 * these; if absent, Overtime/Start Delay/Early Closed all default to 0.
 *
 * NOTE: `calculated` is computed server-side at save time and stored, so
 * historical rows never change if formulas are tweaked later.
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

// Overtime / Start Delay / Early Closed, derived from Shift On/Off vs.
// actual M/C Start/Off Time. Returns zeros when shift times are absent.
// Purely informational (Grinding Data Entry sheet + Shift Time Report) —
// NOT used to compute Working Schedule Time (see workingScheduleEnvelopeMin).
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
// Shift On/M-C Start Time to the LATER of Shift Off/M-C Off Time — a direct
// min/max condition, computed independently of deriveShiftDelta's Overtime
// value (Overtime is a separate, purely informational metric now).
function workingScheduleEnvelopeMin(shiftOnTime, shiftOffTime, mcStartTime, mcOffTime) {
  if (!shiftOnTime || !shiftOffTime) return shiftDuration(mcStartTime, mcOffTime);
  const shiftOwnDurationMin = shiftDuration(shiftOnTime, shiftOffTime);
  const startDeltaMin = signedDiffMin(shiftOnTime, mcStartTime); // + M-C started after Shift On, - before
  const offDeltaMin = signedDiffMin(shiftOffTime, mcOffTime); // + M-C ended after Shift Off, - before
  const effectiveStartOffsetMin = Math.min(0, startDeltaMin); // <=0: how much earlier than Shift On the envelope starts
  const effectiveEndOffsetMin = Math.max(0, offDeltaMin); // >=0: how much later than Shift Off the envelope ends
  return Math.max(shiftOwnDurationMin - effectiveStartOffsetMin + effectiveEndOffsetMin, 0);
}

function computeCalculations(entry) {
  const num = (v) => Number(v) || 0;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Ratio fields (0–1) are displayed as a percentage with 2 decimal places
  // (e.g. 93.79%) — round2 on the raw 0–1 ratio only keeps whole-percent
  // precision (0.94 → always "94.00%"), so these need 4 decimal places on
  // the ratio itself to preserve 2 decimal places once ×100.
  const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

  // 1. Shift Duration = Shift Off Time − Shift On Time (the shift's own
  // scheduled window). Falls back to M/C Off − M/C Start only when the
  // entry has no shift at all (legacy/no-shift data) — never use M/C
  // Start/Off Time as the base when a shift IS present, or the
  // early-start/late-finish minutes get double-counted once Overtime is
  // added on top (see Working Schedule Time below).
  const shiftDurationMin = (entry.shiftOnTime && entry.shiftOffTime)
    ? shiftDuration(entry.shiftOnTime, entry.shiftOffTime)
    : shiftDuration(entry.mcStartTime, entry.mcOffTime);

  // Overtime / Start Delay / Early Closed — auto-derived from the entry's
  // Shift On/Off vs. its actual M/C Start/Off Time (never entered manually).
  // Informational only — does NOT feed into Working Schedule Time below.
  const { overtimeMin, startDelayMin, earlyClosedMin } = deriveShiftDelta(
    entry.shiftOnTime, entry.shiftOffTime, entry.mcStartTime, entry.mcOffTime,
  );

  // 2. Total Stoppage = sum of Downtime & Stoppage Reason minutes, EXCLUDING
  // Planned Downtime.
  const totalStoppageMin = STOPPAGE_KEYS.reduce((s, k) => s + num(entry[k]), 0);

  // 3. Working Schedule Time = envelope span (earlier of Shift On/M-C Start
  // to later of Shift Off/M-C Off), computed directly — see
  // workingScheduleEnvelopeMin above.
  const workingScheduleMin = workingScheduleEnvelopeMin(
    entry.shiftOnTime, entry.shiftOffTime, entry.mcStartTime, entry.mcOffTime,
  );

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

  // 6. Effective M/C Run Time = Production Qty × Standard Time per Glass
  const effectiveMcRunTimeMin = num(entry.processQty) * standardTimePerPieceMin;

  // 7. Unreported Time = Available Working Time − Effective M/C Run Time
  const unreportedTimeMin = isAwtNa ? null : availableWorkingMin - effectiveMcRunTimeMin;

  // 8. Availability Ratio = Available Working Time ÷ Working Schedule Time
  const availabilityRatio = isAwtNa ? null : (workingScheduleMin > 0 ? availableWorkingMin / workingScheduleMin : 0);

  // 9. Performance Ratio = Production Qty ÷ Ideal Production
  const performanceRatio = isAwtNa ? null : (idealProductionQty > 0 ? num(entry.processQty) / idealProductionQty : 0);

  // 10. Quality Ratio = OK Qty ÷ Production Qty
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
    availabilityRatio:    availabilityRatio === null ? null : round4(availabilityRatio),
    performanceRatio:     performanceRatio === null ? null : round4(performanceRatio),
    qualityRatio:         round4(qualityRatio),
    oeePercent:           oeePercent === null ? null : round2(oeePercent),
    overtimeMin:          round2(overtimeMin),
    startDelayMin:        round2(startDelayMin),
    earlyClosedMin:       round2(earlyClosedMin),
  };
}

module.exports = { computeCalculations, shiftDuration, signedDiffMin, STOPPAGE_KEYS };
