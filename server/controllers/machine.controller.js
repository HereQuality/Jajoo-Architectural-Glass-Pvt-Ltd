const Machine = require("../models/Machine");

// Create Machine
exports.createMachine = async (req, res) => {
  try {
    const { machineName, machineCode, description, processes, isActive } = req.body;

    if (!machineName || !machineName.trim()) {
      return res.status(400).json({ isOk: false, message: "Machine name is required" });
    }

    const newMachine = await Machine.create({
      machineName: machineName.trim(),
      machineCode: machineCode ? machineCode.trim() : "",
      description: description ? description.trim() : undefined,
      processes: Array.isArray(processes) ? processes : [],
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

    const machine = await Machine.findOneAndUpdate({ _id: machineId }, req.body, {
      new: true,
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
    const machine = await Machine.findOne({ _id: machineId }).populate("processes", "processName");

    if (!machine) {
      return res.status(404).json({ isOk: false, message: "Machine not found" });
    }

    res.status(200).json({ isOk: true, data: machine });
  } catch (error) {
    console.error("Error fetching machine:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// List all Machines (no pagination) — used to populate the M/C dropdown
exports.listMachines = async (req, res) => {
  try {
    const machines = await Machine.find({ isActive: true })
      .populate("processes", "processName")
      .sort({ machineName: 1 });
    res.status(200).json({ isOk: true, data: machines });
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
        .populate("processes", "processName")
        .sort(sortQuery)
        .skip(parseInt(skip))
        .limit(parseInt(per_page))
        .lean(),
    ]);

    res.status(200).json({
      isOk: true,
      data: [{ count: totalCount, data: machines }],
    });
  } catch (error) {
    console.error("Error searching machines:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
