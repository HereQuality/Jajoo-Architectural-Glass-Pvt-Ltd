"use strict";
/**
 * middlewares/editWindow.middleware.js
 *
 * Enforces the "2 working days" edit window on Production Entries
 * (see server/utils/workingDays.js for the working-day math — Tuesday is
 * the off day). Applied to PUT/DELETE routes for :entryId, after
 * requireMenuPermission has already confirmed the user has write access
 * to the page at all. SuperAdmin bypasses this, same convention as
 * requireMenuPermission's own SuperAdmin bypass.
 */

const ProductionEntry = require("../models/ProductionEntry");
const AppError = require("../utils/AppError");
const { isEntryEditable } = require("../utils/workingDays");

const requireEditWindow = async (req, res, next) => {
  try {
    if (req.user?.roleType === "SuperAdmin") return next();

    const entry = await ProductionEntry.findById(req.params.entryId).select("date");
    if (!entry) return next(new AppError("Entry not found", 404));

    if (!isEntryEditable(entry.date, new Date())) {
      return next(
        new AppError(
          "Edit window closed — entries can only be edited within 2 working days.",
          423
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireEditWindow };
