const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const { downloadOeeReport, downloadDashboardOeeReport } = require("../controllers/report.controller");

const router = express.Router();

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// Reuses the Dashboard's own "read" permission — downloading a report is a
// Dashboard capability, not a separate page that needs its own menu entry.
router.get("/oee", requireMenuPermission("/dashboard", "read"), downloadOeeReport);
router.get("/oee/dashboard", requireMenuPermission("/dashboard", "read"), downloadDashboardOeeReport);

module.exports = router;
