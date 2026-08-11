const mongoose = require("mongoose");

/**
 * Production Data Entry — Glass Grinding
 *
 * Required fields:
 *   machine, date, mcStartTime, mcOffTime,
 *   sizeWidthMm, sizeHeightMm, thicknessMm,
 *   processQty, okQty, rejectedQty, standardTimePerPieceMin
 *
 * Optional stoppage / downtime fields (default 0, max 1440 min):
 *   plannedDowntimeMin, overtimeMin,
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
      type: Number,
      required: [true, "Thickness is required"],
      min: [0.1, "Thickness must be > 0"],
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
