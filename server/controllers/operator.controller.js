const Operator = require("../models/Operator");

// ── Create ────────────────────────────────────────────────────────────────
exports.createOperator = async (req, res) => {
  try {
    const { name, code, isActive } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ isOk: false, message: "Operator name is required" });
    }

    const newOperator = await Operator.create({
      name: String(name).trim(),
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({ isOk: true, data: newOperator, message: "Operator created successfully" });
  } catch (error) {
    console.error("Error creating operator:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Update ────────────────────────────────────────────────────────────────
exports.updateOperator = async (req, res) => {
  try {
    const { operatorId } = req.params;
    const { name, code, isActive } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ isOk: false, message: "Operator name cannot be empty" });
    }

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (isActive !== undefined) update.isActive = isActive;

    const operator = await Operator.findOneAndUpdate({ _id: operatorId }, update, { new: true });
    if (!operator) {
      return res.status(404).json({ isOk: false, message: "Operator not found" });
    }

    res.status(200).json({ isOk: true, data: operator, message: "Operator updated successfully" });
  } catch (error) {
    console.error("Error updating operator:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Delete (soft first, then hard) ────────────────────────────────────────
exports.deleteOperator = async (req, res) => {
  try {
    const { operatorId } = req.params;
    const operator = await Operator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({ isOk: false, message: "Operator not found" });
    }

    if (operator.isActive) {
      operator.isActive = false;
      await operator.save();
      return res.status(200).json({ isOk: true, message: "Operator deactivated successfully" });
    } else {
      await Operator.findByIdAndDelete(operatorId);
      return res.status(200).json({ isOk: true, message: "Operator deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting operator:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Get by ID ─────────────────────────────────────────────────────────────
exports.getOperatorById = async (req, res) => {
  try {
    const { operatorId } = req.params;
    const operator = await Operator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({ isOk: false, message: "Operator not found" });
    }
    res.status(200).json({ isOk: true, data: operator });
  } catch (error) {
    console.error("Error fetching operator:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── List all (for dropdown) ───────────────────────────────────────────────
exports.listOperators = async (req, res) => {
  try {
    const operators = await Operator.find({ isActive: true }).sort({ name: 1 });
    res.status(200).json({ isOk: true, data: operators });
  } catch (error) {
    console.error("Error listing operators:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Search / paginated list ───────────────────────────────────────────────
exports.listOperatorsByParams = async (req, res) => {
  try {
    const { skip = 0, per_page = 10, sorton, sortdir, match, isActive } = req.body;

    let query = {};
    if (match) {
      query.$or = [
        { name: { $regex: match, $options: "i" } },
      ];
    }
    if (isActive !== undefined) query.isActive = isActive;

    let sortQuery = { createdAt: -1 };
    if (sorton && sortdir) sortQuery = { [sorton]: sortdir === "desc" ? -1 : 1 };

    const [totalCount, operators] = await Promise.all([
      Operator.countDocuments(query),
      Operator.find(query).sort(sortQuery).skip(parseInt(skip)).limit(parseInt(per_page)).lean(),
    ]);

    res.status(200).json({ isOk: true, data: [{ count: totalCount, data: operators }] });
  } catch (error) {
    console.error("Error searching operators:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
