const mongoose = require("mongoose");

/**
 * Company Holiday Master
 *
 * A day the company doesn't operate — either a specific one-off date or a
 * named holiday that repeats every year (isRecurringYearly, matched by
 * month+day only; the year on `date` is just whatever year it was first
 * entered in). Feeds the "2 working day" Production Entry edit window (see
 * server/utils/workingDays.js and middlewares/editWindow.middleware.js): a
 * holiday is skipped exactly like the existing Tuesday off-day, so the
 * window naturally extends past it by one more calendar day instead of
 * counting it against the 2 days.
 */
const CompanyHolidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name must be 100 characters or fewer"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    isRecurringYearly: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CompanyHoliday", CompanyHolidaySchema);
