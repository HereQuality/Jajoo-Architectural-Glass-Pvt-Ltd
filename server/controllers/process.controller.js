const Process = require("../models/Process");

// Create Process
exports.createProcess = async (req, res) => {
  try {
    const { processName, description, isActive } = req.body;

    if (!processName || !processName.trim()) {
      return res.status(400).json({ isOk: false, message: "Process name is required" });
    }

    const newProcess = await Process.create({
      processName: processName.trim(),
      description: description ? description.trim() : undefined,
      isActive,
    });

    res.status(201).json({
      isOk: true,
      data: newProcess,
      message: "Process created successfully",
    });
  } catch (error) {
    console.error("Error creating process:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Update Process
exports.updateProcess = async (req, res) => {
  try {
    const { processId } = req.params;

    const process = await Process.findOneAndUpdate({ _id: processId }, req.body, {
      new: true,
    });

    if (!process) {
      return res.status(404).json({ isOk: false, message: "Process not found" });
    }

    res.status(200).json({
      isOk: true,
      data: process,
      message: "Process updated successfully",
    });
  } catch (error) {
    console.error("Error updating process:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Delete Process (soft then hard, same pattern as Machine)
exports.deleteProcess = async (req, res) => {
  try {
    const { processId } = req.params;

    const process = await Process.findById(processId);
    if (!process) {
      return res.status(404).json({ isOk: false, message: "Process not found" });
    }

    if (process.isActive) {
      process.isActive = false;
      await process.save();
      return res.status(200).json({ isOk: true, message: "Process deactivated successfully" });
    } else {
      await Process.findByIdAndDelete(processId);
      return res.status(200).json({ isOk: true, message: "Process deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting process:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Get Process By Id
exports.getProcessById = async (req, res) => {
  try {
    const { processId } = req.params;
    const process = await Process.findOne({ _id: processId });

    if (!process) {
      return res.status(404).json({ isOk: false, message: "Process not found" });
    }

    res.status(200).json({ isOk: true, data: process });
  } catch (error) {
    console.error("Error fetching process:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// List all Processes (no pagination) — used to populate dropdowns
exports.listProcesses = async (req, res) => {
  try {
    const processes = await Process.find({ isActive: true }).sort({ processName: 1 });
    res.status(200).json({ isOk: true, data: processes });
  } catch (error) {
    console.error("Error listing processes:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// Search / List Processes By Params (Pagination)
exports.listProcessByParams = async (req, res) => {
  try {
    const { skip = 0, per_page = 10, sorton, sortdir, match, isActive } = req.body;

    let query = {};
    if (match) {
      query.$or = [{ processName: { $regex: match, $options: "i" } }];
    }

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    let sortQuery = { createdAt: -1 };
    if (sorton && sortdir) {
      sortQuery = { [sorton]: sortdir === "desc" ? -1 : 1 };
    }

    const [totalCount, processes] = await Promise.all([
      Process.countDocuments(query),
      Process.find(query).sort(sortQuery).skip(parseInt(skip)).limit(parseInt(per_page)).lean(),
    ]);

    res.status(200).json({
      isOk: true,
      data: [{ count: totalCount, data: processes }],
    });
  } catch (error) {
    console.error("Error searching processes:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
