const mongoose = require("mongoose");

/**
 * Production Data Entry — Glass Grinding
 *
 * Required fields:
 *   machine, date, mcStartTime, mcOffTime,
 *   sizeWidthMm, sizeHeightMm, thicknessMm,
 *   processQty, okQty, rejectedQty, standardTimePerPieceMin
 *
 * Overtime is not entered manually — it (along with Start Delay / Early
 * Closed) is derived server-side from `shiftOnTime`/`shiftOffTime` vs.
 * mcStartTime/mcOffTime. See productionCalculation.service.js.
 * `shiftOnTime`/`shiftOffTime` are a SNAPSHOT of the entry's Machine's own
 * Shift Time Start/End (machineOnTime/machineOffTime, set in Machine
 * Master) taken when the Machine was selected on this entry's form — not
 * re-derived from the machine's current config on every save. This is
 * deliberate: if the machine's Shift Time is later changed in Machine
 * Master (e.g. switched from Day to Night shift), already-saved entries
 * must keep calculating against the window they actually ran under, even
 * when later edited for an unrelated field (e.g. fixing OK Qty) — each
 * entry works off its own snapshot, independently of the others.
 * `shift` is a legacy field — no longer set by the entry form, kept only
 * so entries saved before this change retain their original Shift link.
 *
 * Optional stoppage / downtime fields (default 0, max 1440 min):
 *   plannedDowntimeMin, overtimeMin (auto-derived, see above),
 *   noManpowerMin, mechanicalBreakdownMin, electricalBreakdownMin,
 *   rawMaterialNotAvailableMin, humanErrorStoppageMin, changeoverMin,
 *   rawMaterialProblemMin, noPowerMin, othersMin
 *
 * `calculated` is computed server-side at save time and stored, so
 * historical rows never change if formulas are tweaked later.
 */
const ProductionEntrySchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: [true, "M/C Name is required"],
    },
    operator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Operator",
    },
    // No longer collected on the entry form — Shift On/Off Time for the
    // Overtime/Working Schedule Time calculation now comes from the
    // entry's own Machine (see applyShiftCalculations in
    // productionEntry.controller.js). Kept optional, not removed, so
    // historical entries saved before this change keep their Shift link.
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    mcStartTime: {
      type: String, // "HH:mm"
      required: [true, "M/C Start Time is required"],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "M/C Start Time must be HH:mm"],
    },
    mcOffTime: {
      type: String, // "HH:mm"
      required: [true, "M/C Off Time is required"],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "M/C Off Time must be HH:mm"],
    },
    // Snapshot of the Machine's Shift Time Start/End at save time — see the
    // file-level comment above for why this isn't re-derived on every save.
    shiftOnTime: {
      type: String, // "HH:mm"
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Shift On Time must be HH:mm"],
    },
    shiftOffTime: {
      type: String, // "HH:mm"
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Shift Off Time must be HH:mm"],
    },

    // ── Size & thickness (from StandardTime master) ──────────────────────
    sizeWidthMm: {
      type: Number,
      required: [true, "Size width is required"],
      min: [0.1, "Width must be > 0"],
    },
    sizeHeightMm: {
      type: Number,
      required: [true, "Size height is required"],
      min: [0.1, "Height must be > 0"],
    },
    thicknessMm: {
      type: String,
      required: [true, "Thickness is required"],
      trim: true,
    },

    // ── Output quantities ─────────────────────
    processQty: {
      type: Number,
      required: [true, "Number of Process Qty is required"],
      min: [1, "Process Qty must be at least 1"],
    },
    okQty: {
      type: Number,
      required: [true, "Number of OK Qty is required"],
      min: [0, "OK Qty cannot be negative"],
    },
    rejectedQty: {
      type: Number,
      required: [true, "Number of Rejected Qty is required"],
      min: [0, "Rejected Qty cannot be negative"],
    },

    // ── Standard time (auto-fetched from StandardTime master) ────────────
    standardTimePerPieceMin: {
      type: Number,
      required: [true, "Standard Time per piece is required"],
      min: [0.01, "Standard Time must be > 0"],
    },

    // ── Optional downtime / stoppage fields (minutes) ────────────────────
    plannedDowntimeMin:         { type: Number, default: 0, min: 0, max: 1440 },
    overtimeMin:                { type: Number, default: 0, min: 0, max: 1440 },
    noManpowerMin:              { type: Number, default: 0, min: 0, max: 1440 },
    mechanicalBreakdownMin:     { type: Number, default: 0, min: 0, max: 1440 },
    electricalBreakdownMin:     { type: Number, default: 0, min: 0, max: 1440 },
    rawMaterialNotAvailableMin: { type: Number, default: 0, min: 0, max: 1440 },
    humanErrorStoppageMin:      { type: Number, default: 0, min: 0, max: 1440 },
    changeoverMin:              { type: Number, default: 0, min: 0, max: 1440 },
    rawMaterialProblemMin:      { type: Number, default: 0, min: 0, max: 1440 },
    noPowerMin:                 { type: Number, default: 0, min: 0, max: 1440 },
    othersMin:                  { type: Number, default: 0, min: 0, max: 1440 },
    othersRemark: {
      type: String,
      trim: true,
      maxlength: [300, "Remark cannot exceed 300 characters"],
      default: "",
    },

    // ── Server-calculated OEE fields (never set from client) ─────────────
    calculated: {
      shiftDurationMin:      { type: Number, default: 0 },
      totalStoppageMin:      { type: Number, default: 0 },
      workingScheduleMin:    { type: Number, default: 0 },
      availableWorkingMin:   { type: Number, default: 0 },
      idealProductionQty:    { type: Number, default: 0 },
      effectiveMcRunTimeMin: { type: Number, default: 0 },
      unreportedTimeMin:     { type: Number, default: 0 },
      availabilityRatio:     { type: Number, default: 0 },
      performanceRatio:      { type: Number, default: 0 },
      qualityRatio:          { type: Number, default: 0 },
      oeePercent:            { type: Number, default: 0 },
      overtimeMin:           { type: Number, default: 0 },
      startDelayMin:         { type: Number, default: 0 },
      earlyClosedMin:        { type: Number, default: 0 },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "createdByModel",
    },
    createdByModel: {
      type: String,
      enum: ["User", "Employee"],
    },
  },
  { timestamps: true },
);

// Cross-field validation
ProductionEntrySchema.pre("validate", function (next) {
  if (this.okQty != null && this.rejectedQty != null && this.processQty != null) {
    if (this.okQty + this.rejectedQty > this.processQty) {
      return next(new Error("OK Qty + Rejected Qty cannot exceed Process Qty"));
    }
  }
  next();
});

module.exports = mongoose.model("ProductionEntry", ProductionEntrySchema);
