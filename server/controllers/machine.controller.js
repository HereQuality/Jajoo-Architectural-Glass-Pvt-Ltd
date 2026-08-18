const Machine = require("../models/Machine");

const timeRx = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Nested populate: processes -> each process's own default Shift (Process
// Master). Machine Master needs the Shift's on/off time to compute the
// Shift Time column below, without a second round-trip per machine.
const PROCESSES_WITH_SHIFT_POPULATE = {
  path: "processes",
  select: "processName shift",
  populate: { path: "shift", select: "shiftOnTime shiftOffTime" },
};

// Attaches a computed `shiftTime` ({ onTime, offTime } | null) to each
// machine, combining the machine's own manually-entered
// machineOnTime/machineOffTime with its (first) process's Shift:
//   onTime  = min(Shift On Time,  Machine On Time)
//   offTime = max(Shift Off Time, Machine Off Time)
// Falls back to just the manual machine times if no process/shift is
// configured, or to just the shift if no manual machine times are set yet.
// `null` when neither is available. This value itself is NEVER directly
// editable — only machineOnTime/machineOffTime (the raw inputs) are.
function attachShiftTime(machines) {
  return machines.map((m) => {
    const machineObj = typeof m.toObject === "function" ? m.toObject() : { ...m };
    const shift = (machineObj.processes || [])
      .map((p) => (typeof p === "object" ? p.shift : null))
      .find((s) => s && s.shiftOnTime && s.shiftOffTime) || null;

    const mOn = machineObj.machineOnTime;
    const mOff = machineObj.machineOffTime;

    if (shift && mOn && mOff) {
      machineObj.shiftTime = {
        onTime: mOn < shift.shiftOnTime ? mOn : shift.shiftOnTime,
        offTime: mOff > shift.shiftOffTime ? mOff : shift.shiftOffTime,
      };
    } else if (mOn && mOff) {
      machineObj.shiftTime = { onTime: mOn, offTime: mOff };
    } else if (shift) {
      machineObj.shiftTime = { onTime: shift.shiftOnTime, offTime: shift.shiftOffTime };
    } else {
      machineObj.shiftTime = null;
    }
    return machineObj;
  });
}

function validateMachineTimes(body) {
  const errors = {};
  if (body.machineOnTime && !timeRx.test(body.machineOnTime)) errors.machineOnTime = "Machine Start Time must be HH:mm";
  if (body.machineOffTime && !timeRx.test(body.machineOffTime)) errors.machineOffTime = "Machine End Time must be HH:mm";
  return errors;
}

// Create Machine
exports.createMachine = async (req, res) => {
  try {
    const { machineName, machineCode, description, processes, machineOnTime, machineOffTime, isActive } = req.body;

    if (!machineName || !machineName.trim()) {
      return res.status(400).json({ isOk: false, message: "Machine name is required" });
    }

    const timeErrors = validateMachineTimes(req.body);
    if (Object.keys(timeErrors).length > 0) {
      return res.status(400).json({ isOk: false, errors: timeErrors, message: "Please fix the highlighted fields" });
    }

    const newMachine = await Machine.create({
      machineName: machineName.trim(),
      machineCode: machineCode ? machineCode.trim() : "",
      description: description ? description.trim() : undefined,
      processes: Array.isArray(processes) ? processes : [],
      machineOnTime: machineOnTime || undefined,
      machineOffTime: machineOffTime || undefined,
      isActive,
    });

    res.status(201).json({
      isOk: true,
      data: newMachine,
      message: "Machine created successfully",
    });
  } catch (error) {
    console.error("Error creating machine:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Update Machine
exports.updateMachine = async (req, res) => {
  try {
    const { machineId } = req.params;

    const timeErrors = validateMachineTimes(req.body);
    if (Object.keys(timeErrors).length > 0) {
      return res.status(400).json({ isOk: false, errors: timeErrors, message: "Please fix the highlighted fields" });
    }

    // Empty string means "clear this time" — casting "" against the HH:mm
    // regex would fail validation, so translate it to an explicit unset.
    const update = { ...req.body };
    if (update.machineOnTime === "") update.machineOnTime = null;
    if (update.machineOffTime === "") update.machineOffTime = null;

    const machine = await Machine.findOneAndUpdate({ _id: machineId }, update, {
      new: true,
      runValidators: true,
    });

    if (!machine) {
      return res.status(404).json({ isOk: false, message: "Machine not found" });
    }

    res.status(200).json({
      isOk: true,
      data: machine,
      message: "Machine updated successfully",
    });
  } catch (error) {
    console.error("Error updating machine:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Delete Machine (soft then hard, same pattern as Department)
exports.deleteMachine = async (req, res) => {
  try {
    const { machineId } = req.params;

    const machine = await Machine.findById(machineId);
    if (!machine) {
      return res.status(404).json({ isOk: false, message: "Machine not found" });
    }

    if (machine.isActive) {
      machine.isActive = false;
      await machine.save();
      return res.status(200).json({ isOk: true, message: "Machine deactivated successfully" });
    } else {
      await Machine.findByIdAndDelete(machineId);
      return res.status(200).json({ isOk: true, message: "Machine deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting machine:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Get Machine By Id
exports.getMachineById = async (req, res) => {
  try {
    const { machineId } = req.params;
    const machine = await Machine.findOne({ _id: machineId }).populate(PROCESSES_WITH_SHIFT_POPULATE).lean();

    if (!machine) {
      return res.status(404).json({ isOk: false, message: "Machine not found" });
    }

    const [withShiftTime] = attachShiftTime([machine]);
    res.status(200).json({ isOk: true, data: withShiftTime });
  } catch (error) {
    console.error("Error fetching machine:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// List all Machines (no pagination) — used to populate the M/C dropdown
exports.listMachines = async (req, res) => {
  try {
    const machines = await Machine.find({ isActive: true })
      .populate(PROCESSES_WITH_SHIFT_POPULATE)
      .sort({ machineName: 1 })
      .lean();
    const withShiftTime = attachShiftTime(machines);
    res.status(200).json({ isOk: true, data: withShiftTime });
  } catch (error) {
    console.error("Error listing machines:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Search / List Machines By Params (Pagination)
exports.listMachineByParams = async (req, res) => {
  try {
    const { skip = 0, per_page = 10, sorton, sortdir, match, isActive } = req.body;

    let query = {};
    if (match) {
      query.$or = [
        { machineName: { $regex: match, $options: "i" } },
        { machineCode: { $regex: match, $options: "i" } },
      ];
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    let sortQuery = { createdAt: -1 };
    if (sorton && sortdir) {
      sortQuery = { [sorton]: sortdir === "desc" ? -1 : 1 };
    }

    const [totalCount, machines] = await Promise.all([
      Machine.countDocuments(query),
      Machine.find(query)
        .populate(PROCESSES_WITH_SHIFT_POPULATE)
        .sort(sortQuery)
        .skip(parseInt(skip))
        .limit(parseInt(per_page))
        .lean(),
    ]);
    const withShiftTime = attachShiftTime(machines);

    res.status(200).json({
      isOk: true,
      data: [{ count: totalCount, data: withShiftTime }],
    });
  } catch (error) {
    console.error("Error searching machines:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
