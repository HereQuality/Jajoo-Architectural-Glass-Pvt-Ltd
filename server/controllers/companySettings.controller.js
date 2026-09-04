const CompanySettings = require("../models/CompanySettings");

// Singleton — there's only ever one settings document, created lazily on
// first read/write with sane defaults (Tuesday off) instead of a seed step.
async function getOrCreateSettings() {
  let settings = await CompanySettings.findOne();
  if (!settings) settings = await CompanySettings.create({});
  return settings;
}

exports.getCompanySettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json({ isOk: true, data: settings });
  } catch (error) {
    console.error("Error fetching company settings:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};

exports.updateWeeklyOffDays = async (req, res) => {
  try {
    const { weeklyOffDays } = req.body;
    if (
      !Array.isArray(weeklyOffDays) ||
      !weeklyOffDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    ) {
      return res.status(400).json({ isOk: false, message: "weeklyOffDays must be an array of integers 0-6" });
    }

    const settings = await getOrCreateSettings();
    settings.weeklyOffDays = [...new Set(weeklyOffDays)].sort((a, b) => a - b);
    await settings.save();

    res.status(200).json({ isOk: true, data: settings, message: "Weekly off updated" });
  } catch (error) {
    console.error("Error updating company settings:", error);
    res.status(500).json({ isOk: false, message: error.message });
  }
};
