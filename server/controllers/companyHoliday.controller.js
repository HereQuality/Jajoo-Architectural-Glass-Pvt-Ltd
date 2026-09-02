const CompanyHoliday = require("../models/CompanyHoliday");

function validatePayload(body) {
  const errors = {};
  const name = typeof body.name === "string" ? body.name.trim() : body.name;
  if (!name) errors.name = "Name is required";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer";

  if (!body.date) errors.date = "Date is required";
  else if (Number.isNaN(new Date(body.date).getTime())) errors.date = "Invalid date";

  return errors;
}

// ── Create ────────────────────────────────────────────────────────────────
exports.createCompanyHoliday = async (req, res) => {
  try {
    const errors = validatePayload(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ isOk: false, errors, message: "Please fix the highlighted fields" });
    }

    const record = await CompanyHoliday.create({
      name: req.body.name.trim(),
      date: req.body.date,
      isRecurringYearly: !!req.body.isRecurringYearly,
    });

    res.status(201).json({ isOk: true, data: record, message: "Holiday added successfully" });
  } catch (error) {
    console.error("Error creating company holiday:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Update ────────────────────────────────────────────────────────────────
exports.updateCompanyHoliday = async (req, res) => {
  try {
    const { holidayId } = req.params;
    const errors = validatePayload(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ isOk: false, errors, message: "Please fix the highlighted fields" });
    }

    const record = await CompanyHoliday.findOneAndUpdate(
      { _id: holidayId },
      {
        name: req.body.name.trim(),
        date: req.body.date,
        isRecurringYearly: !!req.body.isRecurringYearly,
      },
      { new: true, runValidators: true },
    );

    if (!record) return res.status(404).json({ isOk: false, message: "Holiday not found" });

    res.status(200).json({ isOk: true, data: record, message: "Holiday updated successfully" });
  } catch (error) {
    console.error("Error updating company holiday:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── Delete ────────────────────────────────────────────────────────────────
exports.deleteCompanyHoliday = async (req, res) => {
  try {
    const record = await CompanyHoliday.findByIdAndDelete(req.params.holidayId);
    if (!record) return res.status(404).json({ isOk: false, message: "Holiday not found" });
    res.status(200).json({ isOk: true, message: "Holiday deleted" });
  } catch (error) {
    console.error("Error deleting company holiday:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

// ── List (used by Holiday Master page AND, indirectly, the edit-window
// check — see middlewares/editWindow.middleware.js) ────────────────────────
exports.listCompanyHolidays = async (req, res) => {
  try {
    const holidays = await CompanyHoliday.find({}).sort({ date: 1 });
    res.status(200).json({ isOk: true, data: holidays });
  } catch (error) {
    console.error("Error listing company holidays:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
