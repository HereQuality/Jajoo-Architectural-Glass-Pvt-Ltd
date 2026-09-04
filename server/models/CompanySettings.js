const mongoose = require("mongoose");

/**
 * Singleton document (always exactly one — see getOrCreateSettings in
 * companySettings.controller.js) holding the weekly-off configuration for
 * Production scheduling: which day(s) of the week the company doesn't
 * operate at all (Date#getDay() values, 0=Sun..6=Sat). Feeds the same
 * "2 working day" Production Entry edit window as CompanyHoliday (see
 * server/utils/workingDays.js) — a weekly-off day is skipped exactly like
 * a holiday, so the window naturally extends past it. Kept as its own
 * model (rather than a field on the SuperAdmin-only Company branding
 * model) so it can be managed under Holiday Master's own menu permission,
 * matching who's actually allowed to configure production scheduling.
 */
const CompanySettingsSchema = new mongoose.Schema(
  {
    weeklyOffDays: {
      type: [Number],
      default: [2], // Tuesday — the historical hardcoded default
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "weeklyOffDays must be integers 0-6 (Sun-Sat)",
      },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CompanySettings", CompanySettingsSchema);
