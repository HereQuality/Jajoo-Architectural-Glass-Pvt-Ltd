const ProductionEntry = require("../models/ProductionEntry");
const Machine = require("../models/Machine");
const { computeBatchCalculations, computeRowIdealProductionQty } = require("../services/productionCalculation.service");
const { resolveMachineFilter } = require("../utils/entryQuery");
const { aggregateEfficiencyByGroup } = require("../utils/efficiencyAggregate");
const { buildGrindingEfficiencyPdf } = require("../services/report.service");

// Rejected Qty is never accepted directly from the client — it's derived in
// buildData() as the sum of these reason fields (mirrors how Total Stoppage
// sums the Downtime & Stoppage Reason fields client-side).
const REJECTION_QTY_FIELDS = [
  "rejScratchesQty", "rejChippingQty", "rejCornerBreakageQty",
  "rejSizeMismatchQty", "rejHandlingBreakageQty", // includes "Others"
];

const NUMERIC_FIELDS = [
  "sizeWidthMm", "sizeHeightMm",
  "processQty", "okQty",
  ...REJECTION_QTY_FIELDS,
  "standardTimePerPieceMin",
  "plannedDowntimeMin",
  "noManpowerMin", "mechanicalBreakdownMin", "electricalBreakdownMin",
  "rawMaterialNotAvailableMin", "humanErrorStoppageMin", "changeoverMin",
  "rawMaterialProblemMin", "noPowerMin", "othersMin",
];

const OPTIONAL_MIN_FIELDS = [
  "plannedDowntimeMin",
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
  else if (!errors.mcStartTime && body.mcOffTime <= body.mcStartTime)
    errors.mcOffTime = "M/C Off Time cannot be earlier than or equal to M/C Start Time";

  const dims = { sizeWidthMm: "Width", sizeHeightMm: "Height" };
  for (const [k, label] of Object.entries(dims)) {
    const v = Number(body[k]);
    if (!body[k]) errors[k] = `${label} is required`;
    else if (isNaN(v) || v <= 0) errors[k] = `${label} must be > 0`;
  }

  const thickness = typeof body.thicknessMm === "string" ? body.thicknessMm.trim() : body.thicknessMm;
  if (!thickness && thickness !== 0) errors.thicknessMm = "Thickness is required";

  const qty = { processQty: "Production Qty", okQty: "OK Qty" };
  for (const [k, label] of Object.entries(qty)) {
    const v = Number(body[k]);
    if (body[k] === undefined || body[k] === "") errors[k] = `${label} is required`;
    else if (isNaN(v) || !Number.isInteger(v)) errors[k] = `${label} must be a whole number`;
    else if (k === "processQty" && v < 1) errors[k] = `${label} must be at least 1`;
    else if (v < 0) errors[k] = `${label} cannot be negative`;
  }
  if (!errors.processQty && !errors.okQty) {
    if (Number(body.okQty) > Number(body.processQty))
      errors.okQty = "OK Qty cannot exceed Production Qty";
  }

  for (const k of REJECTION_QTY_FIELDS) {
    if (body[k] === undefined || body[k] === "" || body[k] === null) continue;
    const v = Number(body[k]);
    if (isNaN(v) || !Number.isInteger(v) || v < 0) errors[k] = "Must be a whole number ≥ 0";
  }
  const rejectionFieldsClean = REJECTION_QTY_FIELDS.every((k) => !errors[k]);
  if (!errors.processQty && !errors.okQty && rejectionFieldsClean) {
    const rejectedQtyTotal = REJECTION_QTY_FIELDS.reduce((s, k) => s + (Number(body[k]) || 0), 0);
    if (Number(body.okQty) + rejectedQtyTotal > Number(body.processQty))
      errors.rejHandlingBreakageQty = "OK Qty + Rejected Qty (from Rejection Reasons) cannot exceed Production Qty";
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
    shiftOnTime: body.shiftOnTime || undefined,
    shiftOffTime: body.shiftOffTime || undefined,
    batchId: body.batchId || undefined,
    othersRemark: typeof body.othersRemark === "string" ? body.othersRemark.trim().slice(0, 300) : "",
  };
  for (const k of NUMERIC_FIELDS) {
    if (body[k] !== undefined && body[k] !== "") data[k] = Number(body[k]);
  }
  if (body.thicknessMm !== undefined && body.thicknessMm !== "") {
    data.thicknessMm = String(body.thicknessMm).trim();
  }
  data.rejectedQty = REJECTION_QTY_FIELDS.reduce((sum, k) => sum + (Number(body[k]) || 0), 0);
  return data;
}

// Server-side backstop for the same check the client already runs before
// submitting: Production Qty can't exceed what this row's own actual M/C
// run time (M/C Off − M/C Start) allows at this Standard Time (Ideal
// Production). Re-derived from `data.calculated` — the same number that
// gets stored — so it can never disagree with what the client saw.
function capacityError(data) {
  const ideal = data.calculated.idealProductionQty;
  if (ideal < data.processQty) {
    return `Not achievable: this row's own M/C run time ÷ Standard Time = ${ideal.toFixed(2)} pcs, ` +
      `which is less than Production Qty (${data.processQty}). Reduce Production Qty or check the M/C Start/Off Time.`;
  }
  return null;
}

// True if two [start, off) M/C time windows overlap — a window crossing
// midnight (off <= start) is treated as extending into the next day.
// Mirrors client/src/pages/GrindingEntry.jsx's timeWindowsOverlap exactly.
function timeWindowsOverlap(aStart, aOff, bStart, bOff) {
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const norm = (start, off) => {
    let s = toMin(start), e = toMin(off);
    if (e <= s) e += 1440;
    return [s, e];
  };
  const [aS, aE] = norm(aStart, aOff);
  const [bS, bE] = norm(bStart, bOff);
  return aS < bE && bS < aE;
}

// Server-side backstop for the same overlap rule the client enforces across
// rows within one Add Entry submission — but the client can only see rows
// it has open in the form right now, not entries already saved elsewhere
// (a prior session, another operator, or siblings from an earlier partial
// batch save that aren't loaded into this edit). Queries every entry already
// saved for this Machine on this Date and rejects a genuine time conflict,
// regardless of how the conflicting entry got there.
async function checkMachineTimeOverlap(body, excludeId) {
  if (!body.machine || !body.date || !body.mcStartTime || !body.mcOffTime) return null;
  const day = new Date(body.date);
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const query = { machine: body.machine, date: { $gte: startOfDay, $lt: endOfDay } };
  if (excludeId) query._id = { $ne: excludeId };
  const candidates = await ProductionEntry.find(query).select("mcStartTime mcOffTime").lean();
  for (const c of candidates) {
    if (timeWindowsOverlap(body.mcStartTime, body.mcOffTime, c.mcStartTime, c.mcOffTime)) {
      return `This M/C time (${body.mcStartTime}–${body.mcOffTime}) overlaps with another entry already saved for ` +
        `this machine on this date (${c.mcStartTime}–${c.mcOffTime}) — the same machine can't run two jobs at once.`;
    }
  }
  return null;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Resolves Shift On/Off Time: prefer the entry's own snapshot (taken from
// the Machine when the entry was saved — see the ProductionEntry model
// comment for why this is a snapshot, not a live re-fetch), only falling
// back to the Machine's CURRENT Shift Time when the snapshot is missing
// entirely (legacy/defensive path, not the normal one).
async function resolveShiftTimes(data) {
  let shiftOnTime = data.shiftOnTime;
  let shiftOffTime = data.shiftOffTime;
  if (!shiftOnTime || !shiftOffTime) {
    const machine = await Machine.findById(data.machine);
    shiftOnTime = shiftOnTime || machine?.machineOnTime;
    shiftOffTime = shiftOffTime || machine?.machineOffTime;
  }
  return { shiftOnTime, shiftOffTime };
}

// Working Schedule Time / Total Stoppage / Available Working Time /
// Effective M/C Run Time / Availability / Performance / Quality / OEE % are
// BATCH-level — shared identically across every entry saved together from
// one "Add Entry" submission (see computeBatchCalculations). So saving,
// editing, or deleting ANY row in a batch changes the numbers for every
// OTHER row in it too — this recomputes the batch from `rows` and writes
// the refreshed numbers onto every row in `rows` that already exists in the
// DB (i.e. has an `_id`); a row without one yet (the entry currently being
// created) just gets `calculated`/`overtimeMin` set on the object in memory
// for the caller to save itself.
async function recomputeBatchAndSave(rows, shiftOnTime, shiftOffTime) {
  const batchCalc = computeBatchCalculations(rows, shiftOnTime, shiftOffTime);
  for (const row of rows) {
    const idealProductionQty = round2(computeRowIdealProductionQty(row));
    const calculated = { ...batchCalc, idealProductionQty };
    if (row._id) {
      await ProductionEntry.updateOne({ _id: row._id }, { calculated, overtimeMin: batchCalc.overtimeMin });
    }
    row.calculated = calculated;
    row.overtimeMin = batchCalc.overtimeMin;
  }
  return batchCalc;
}

// Recomputes and saves every entry still in the DB for `batchId` (used
// after removing a row from a batch, or moving one out of it — the
// remaining siblings' batch-level numbers must drop that row's
// contribution). No-op when nobody's left in that batch.
async function recomputeExistingBatch(batchId, excludeEntryId) {
  if (!batchId) return;
  const query = { batchId };
  if (excludeEntryId) query._id = { $ne: excludeEntryId };
  const siblings = await ProductionEntry.find(query).lean();
  if (siblings.length === 0) return;
  const { shiftOnTime, shiftOffTime } = await resolveShiftTimes(siblings[0]);
  await recomputeBatchAndSave(siblings, shiftOnTime, shiftOffTime);
}

// Computes and applies batch-level `calculated`/`overtimeMin` for `data`
// (the entry currently being created/updated), together with every OTHER
// entry already saved under the same batchId — those siblings get their
// stored `calculated` refreshed too, since adding/editing this row changes
// the batch's totals for all of them.
async function applyShiftCalculations(data, excludeEntryId) {
  const { shiftOnTime, shiftOffTime } = await resolveShiftTimes(data);
  const query = data.batchId ? { batchId: data.batchId } : null;
  if (query && excludeEntryId) query._id = { $ne: excludeEntryId };
  const siblings = query ? await ProductionEntry.find(query).lean() : [];
  await recomputeBatchAndSave([...siblings, data], shiftOnTime, shiftOffTime);
}

exports.createProductionEntry = async (req, res) => {
  try {
    const errors = await validatePayload(req.body);
    if (Object.keys(errors).length > 0)
      return res.status(400).json({ isOk: false, errors, message: "Please fix the highlighted fields" });

    const overlapMsg = await checkMachineTimeOverlap(req.body, null);
    if (overlapMsg) {
      return res.status(400).json({ isOk: false, errors: { mcOffTime: overlapMsg }, message: overlapMsg });
    }

    const data = buildData(req.body);
    await applyShiftCalculations(data);
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
      { path: "machine", select: "machineName machineCode machineOnTime machineOffTime" },
      { path: "operator", select: "name" },
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

    // Only re-check overlap when the Machine/Date/M-C time actually changed —
    // otherwise editing an unrelated field (e.g. OK Qty) on an entry that
    // happens to have a pre-existing overlap from before this check existed
    // would permanently block that edit for a conflict the user isn't
    // touching.
    const existingEntry = await ProductionEntry.findById(entryId).select("mcStartTime mcOffTime machine date batchId").lean();
    if (!existingEntry) return res.status(404).json({ isOk: false, message: "Entry not found" });
    const timeRelevantFieldsChanged =
      existingEntry.mcStartTime !== req.body.mcStartTime ||
      existingEntry.mcOffTime !== req.body.mcOffTime ||
      String(existingEntry.machine) !== String(req.body.machine) ||
      new Date(existingEntry.date).toDateString() !== new Date(req.body.date).toDateString();
    if (timeRelevantFieldsChanged) {
      const overlapMsg = await checkMachineTimeOverlap(req.body, entryId);
      if (overlapMsg) {
        return res.status(400).json({ isOk: false, errors: { mcOffTime: overlapMsg }, message: overlapMsg });
      }
    }

    const data = buildData(req.body);
    await applyShiftCalculations(data, entryId);
    const capacityMsg = capacityError(data);
    if (capacityMsg) {
      return res.status(400).json({ isOk: false, errors: { processQty: capacityMsg }, message: capacityMsg });
    }

    const entry = await ProductionEntry.findOneAndUpdate({ _id: entryId }, data, {
      new: true, runValidators: true,
    }).populate("machine", "machineName machineCode machineOnTime machineOffTime").populate("operator", "name");

    if (!entry) return res.status(404).json({ isOk: false, message: "Entry not found" });

    // If this row moved out of (or into a different) batch, its OLD
    // batch's remaining siblings still need their batch-level numbers
    // recomputed without this row's contribution.
    if (existingEntry.batchId && String(existingEntry.batchId) !== String(data.batchId || "")) {
      await recomputeExistingBatch(existingEntry.batchId, entryId);
    }

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

    // Removing this row changes the batch's totals for whoever's left in it.
    if (entry.batchId) {
      await recomputeExistingBatch(entry.batchId, entry._id);
    }

    res.status(200).json({ isOk: true, message: "Entry deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};

exports.getProductionEntryById = async (req, res) => {
  try {
    const entry = await ProductionEntry.findById(req.params.entryId)
      .populate("machine", "machineName machineCode machineOnTime machineOffTime").populate("operator", "name");
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

// Server-generated PDF of the Grinding Efficiency Report — mirrors
// getProductionEfficiency's aggregation exactly, then applies the same
// operator (exact match) / machine (substring match) filter the on-screen
// EfficiencyModal applies, so the PDF always matches what's currently shown.
exports.downloadGrindingEfficiencyPdf = async (req, res) => {
  try {
    const { from, to, tab = "machines", operator, match } = req.query;
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

    let rows = tab === "operators"
      ? aggregateEfficiencyByGroup(
          entries,
          (e) => (e.operator?._id ? String(e.operator._id) : null),
          (e) => e.operator?.name || "Unknown Operator",
        )
      : aggregateEfficiencyByGroup(
          entries,
          (e) => (e.machine?._id ? String(e.machine._id) : null),
          (e) => e.machine?.machineName || "Unknown Machine",
        );

    let filterDescription;
    if (tab === "operators" && operator) {
      const wanted = new Set(String(operator).split(",").map((s) => s.trim()).filter(Boolean));
      rows = rows.filter((r) => wanted.has(r.name));
      filterDescription = `Operator(s): ${[...wanted].join(", ")}`;
    } else if (tab !== "operators" && match) {
      const q = String(match).toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
      filterDescription = `Machine search: "${match}"`;
    }

    const today = new Date().toISOString().split("T")[0];
    const fromDate = from || today;
    const toDate = to || fromDate;

    const doc = buildGrindingEfficiencyPdf({ tab, rows, from: fromDate, to: toDate, filterDescription });

    const filename = `grinding-${tab === "operators" ? "operator" : "machine"}-efficiency_${fromDate}${
      toDate !== fromDate ? `_to_${toDate}` : ""
    }.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error("Error generating grinding efficiency PDF:", err);
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
        .populate("machine", "machineName machineCode machineOnTime machineOffTime").populate("operator", "name")
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

// Shift Time Report — one row per entry: Machine, Shift Start/End, M/C
// On/Off, Overtime, Start Delay / Early Closed (all already stored on the
// entry — Overtime/Start Delay/Early Closed are computed once at save time
// by applyShiftCalculations, so this is a straight read, no recomputation).
exports.getShiftTimeReport = async (req, res) => {
  try {
    const { from, to, machine } = req.query;
    const query = {};
    if (machine) query.machine = machine;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const entries = await ProductionEntry.find(query)
      .populate("machine", "machineName machineCode machineOnTime machineOffTime")
      .sort({ date: -1, mcStartTime: -1 })
      .lean();

    // Effective Shift Start/End — the same min/max envelope rule used
    // everywhere else (Machine Master's Shift Time column, Working Schedule
    // Time): earlier of Shift On/M-C Start, later of Shift Off/M-C Off.
    // "HH:mm" strings compare correctly with plain string min/max since
    // they're always zero-padded to the same width. Prefers the entry's own
    // shiftOnTime/shiftOffTime SNAPSHOT (what it actually ran under —
    // doesn't drift if the machine's Shift Time is edited later); falls
    // back to the machine's current config only for entries saved before
    // snapshotting existed.
    const rows = entries.map((e) => {
      const shiftOnTime = e.shiftOnTime || e.machine?.machineOnTime || null;
      const shiftOffTime = e.shiftOffTime || e.machine?.machineOffTime || null;
      const effectiveStartTime = shiftOnTime
        ? (e.mcStartTime < shiftOnTime ? e.mcStartTime : shiftOnTime)
        : e.mcStartTime;
      const effectiveEndTime = shiftOffTime
        ? (e.mcOffTime > shiftOffTime ? e.mcOffTime : shiftOffTime)
        : e.mcOffTime;

      return {
        _id: e._id,
        date: e.date,
        machineName: e.machine?.machineName || "Unknown Machine",
        shiftOnTime,
        shiftOffTime,
        mcStartTime: e.mcStartTime,
        mcOffTime: e.mcOffTime,
        effectiveStartTime,
        effectiveEndTime,
        // Pulled straight from the stored calculation (same source of truth
        // as the sheet/Dashboard/PDFs) — never recomputed here, so it can
        // never drift from what's shown elsewhere.
        totalShiftTimeMin: e.calculated?.workingScheduleMin ?? 0,
        overtimeMin: e.calculated?.overtimeMin ?? e.overtimeMin ?? 0,
        startDelayMin: e.calculated?.startDelayMin ?? 0,
        earlyClosedMin: e.calculated?.earlyClosedMin ?? 0,
      };
    });

    res.status(200).json({ isOk: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ isOk: false, message: err.message });
  }
};
