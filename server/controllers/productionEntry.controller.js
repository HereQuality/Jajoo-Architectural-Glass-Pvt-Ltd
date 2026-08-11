const ProductionEntry = require("../models/ProductionEntry");
const Machine = require("../models/Machine");
const { computeCalculations } = require("../services/productionCalculation.service");
const { resolveMachineFilter } = require("../utils/entryQuery");
const { aggregateEfficiencyByGroup } = require("../utils/efficiencyAggregate");

const NUMERIC_FIELDS = [
  "sizeWidthMm", "sizeHeightMm", "thicknessMm",
  "processQty", "okQty",
  "standardTimePerPieceMin",
  "plannedDowntimeMin", "overtimeMin",
  "noManpowerMin", "mechanicalBreakdownMin", "electricalBreakdownMin",
  "rawMaterialNotAvailableMin", "humanErrorStoppageMin", "changeoverMin",
  "rawMaterialProblemMin", "noPowerMin", "othersMin",
];

const OPTIONAL_MIN_FIELDS = [
  "plannedDowntimeMin", "overtimeMin",
  "noManpowerMin", "mechanicalBreakdownMin", "electricalBreakdownMin",
  "rawMaterialNotAvailableMin", "humanErrorStoppageMin", "changeoverMin",
  "rawMaterialProblemMin", "noPowerMin", "othersMin",
];

async function validatePayload(body) {
  const errors = {};

  if (!body.machine) errors.machine = "M/C Name is required";
  else {
    const m = await Machine.findById(body.machine);
    if (!m) errors.machine = "Selected machine does not exist";
    else if (!m.isActive) errors.machine = "Selected machine is inactive";
  }

  if (!body.date) errors.date = "Date is required";

  const timeRx = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!body.mcStartTime) errors.mcStartTime = "M/C Start Time is required";
  else if (!timeRx.test(body.mcStartTime)) errors.mcStartTime = "Must be HH:mm format";

  if (!body.mcOffTime) errors.mcOffTime = "M/C Off Time is required";
  else if (!timeRx.test(body.mcOffTime)) errors.mcOffTime = "Must be HH:mm format";
  else if (!errors.mcStartTime && body.mcStartTime === body.mcOffTime)
    errors.mcOffTime = "Off Time cannot equal Start Time";

  const dims = { sizeWidthMm: "Width", sizeHeightMm: "Height", thicknessMm: "Thickness" };
  for (const [k, label] of Object.entries(dims)) {
    const v = Number(body[k]);
    if (!body[k]) errors[k] = `${label} is required`;
    else if (isNaN(v) || v <= 0) errors[k] = `${label} must be > 0`;
  }

  const qty = { processQty: "Process Qty", okQty: "OK Qty" };
  for (const [k, label] of Object.entries(qty)) {
    const v = Number(body[k]);
    if (body[k] === undefined || body[k] === "") errors[k] = `${label} is required`;
    else if (isNaN(v) || !Number.isInteger(v)) errors[k] = `${label} must be a whole number`;
    else if (k === "processQty" && v < 1) errors[k] = `${label} must be at least 1`;
    else if (v < 0) errors[k] = `${label} cannot be negative`;
  }
  if (!errors.processQty && !errors.okQty) {
    if (Number(body.okQty) > Number(body.processQty))
      errors.okQty = "OK Qty cannot exceed Process Qty";
  }

  const st = Number(body.standardTimePerPieceMin);
  if (!body.standardTimePerPieceMin) errors.standardTimePerPieceMin = "Standard Time is required";
  else if (isNaN(st) || st <= 0) errors.standardTimePerPieceMin = "Standard Time must be > 0";

  for (const k of OPTIONAL_MIN_FIELDS) {
    if (body[k] === undefined || body[k] === "" || body[k] === null) continue;
    const v = Number(body[k]);
    if (isNaN(v) || v < 0 || v > 1440) errors[k] = "Must be 0–1440 minutes";
  }

  const othersRemark = typeof body.othersRemark === "string" ? body.othersRemark.trim() : "";
  if (Number(body.othersMin) > 0 && !othersRemark) {
    errors.othersRemark = "Remark is required when Others (Minutes) is greater than 0";
  } else if (othersRemark.length > 300) {
    errors.othersRemark = "Remark cannot exceed 300 characters";
  }

  return errors;
}

function buildData(body) {
  const data = {
    machine: body.machine,
    operator: body.operator || undefined,
    date: body.date || Date.now(),
    mcStartTime: body.mcStartTime,
    mcOffTime: body.mcOffTime,
    othersRemark: typeof body.othersRemark === "string" ? body.othersRemark.trim().slice(0, 300) : "",
  };
  for (const k of NUMERIC_FIELDS) {
    if (body[k] !== undefined && body[k] !== "") data[k] = Number(body[k]);
  }
  // Rejected Qty is never entered manually — always derived server-side so
  // it can never drift from Process Qty / OK Qty (and is never missing).
  data.rejectedQty = Math.max(0, Number(body.processQty) - Number(body.okQty));
  return data;
}

// Server-side backstop for the same check the client already runs before
// submitting: Process Qty can't exceed what Available Working Time actually
// allows at this Standard Time (Ideal Production). Re-derived from `data.
// calculated` — the same numbers that get stored — so it can never disagree
// with what the client saw.
function capacityError(data) {
  const ideal = data.calculated.idealProductionQty;
  if (ideal === null) {
    return `Not achievable: Available Working Time is NA — Planned Downtime + total Stoppage consumes the entire ` +
      `Working Schedule Time, so there is no time left to grind any glass. Reduce downtime/stoppage minutes.`;
  }
  if (ideal < data.processQty) {
    return `Not achievable: Available Working Time ÷ Standard Time = ${ideal.toFixed(2)} pcs, ` +
      `which is less than Process Qty (${data.processQty}). Reduce Process Qty or free up more Available Working Time.`;
  }
  return null;
}

exports.createProductionEntry = async (req, res) => {
  try {
    const errors = await validatePayload(req.body);
    if (Object.keys(errors).length > 0)
      return res.status(400).json({ isOk: false, errors, message: "Please fix the highlighted fields" });

    const data = buildData(req.body);
    data.calculated = computeCalculations(data);
    const capacityMsg = capacityError(data);
    if (capacityMsg) {
      return res.status(400).json({ isOk: false, errors: { processQty: capacityMsg }, message: capacityMsg });
    }
    if (req.user) {
      data.createdBy = req.user._id;
      data.createdByModel = req.user.roleType === "SuperAdmin" ? "User" : "Employee";
    }
    const entry = await ProductionEntry.create(data);
    const populated = await entry.populate([
      { path: "machine", select: "machineName machineCode" },
      { path: "operator", select: "name" }
    ]);
    res.status(201).json({ isOk: true, data: populated, message: "Entry saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

exports.updateProductionEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const errors = await validatePayload(req.body);
    if (Object.keys(errors).length > 0)
      return res.status(400).json({ isOk: false, errors, message: "Please fix the highlighted fields" });

    const data = buildData(req.body);
    data.calculated = computeCalculations(data);
    const capacityMsg = capacityError(data);
    if (capacityMsg) {
      return res.status(400).json({ isOk: false, errors: { processQty: capacityMsg }, message: capacityMsg });
    }

    const entry = await ProductionEntry.findOneAndUpdate({ _id: entryId }, data, {
      new: true, runValidators: true,
    }).populate("machine", "machineName machineCode").populate("operator", "name");

    if (!entry) return res.status(404).json({ isOk: false, message: "Entry not found" });
    res.status(200).json({ isOk: true, data: entry, message: "Entry updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

exports.deleteProductionEntry = async (req, res) => {
  try {
    const entry = await ProductionEntry.findByIdAndDelete(req.params.entryId);
    if (!entry) return res.status(404).json({ isOk: false, message: "Entry not found" });
    res.status(200).json({ isOk: true, message: "Entry deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

exports.getProductionEntryById = async (req, res) => {
  try {
    const entry = await ProductionEntry.findById(req.params.entryId)
      .populate("machine", "machineName machineCode").populate("operator", "name");
    if (!entry) return res.status(404).json({ isOk: false, message: "Entry not found" });
    res.status(200).json({ isOk: true, data: entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

// Operator Efficiency + Machine Efficiency tables, date-range filtered —
// grouped/reduced from the same rows as the sheet, using the same
// idealProductionQty (NA-aware) the sheet already computes and stores.
exports.getProductionEfficiency = async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const entries = await ProductionEntry.find(query)
      .populate("machine", "machineName")
      .populate("operator", "name")
      .lean();

    const operators = aggregateEfficiencyByGroup(
      entries,
      (e) => (e.operator?._id ? String(e.operator._id) : null),
      (e) => e.operator?.name || "Unknown Operator",
    );
    const machines = aggregateEfficiencyByGroup(
      entries,
      (e) => (e.machine?._id ? String(e.machine._id) : null),
      (e) => e.machine?.machineName || "Unknown Machine",
    );

    res.status(200).json({ isOk: true, data: { operators, machines } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

exports.listProductionEntries = async (req, res) => {
  try {
    const { machine, process, from, to, skip = 0, per_page = 50 } = req.query;
    const query = {};
    const machineFilter = await resolveMachineFilter({ machine, process });
    if (machineFilter !== undefined) query.machine = machineFilter;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const [count, entries] = await Promise.all([
      ProductionEntry.countDocuments(query),
      ProductionEntry.find(query)
        .populate("machine", "machineName machineCode").populate("operator", "name")
        .sort({ date: -1, createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(per_page))
        .lean(),
    ]);
    res.status(200).json({ isOk: true, data: entries, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};
