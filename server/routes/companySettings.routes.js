const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const { getCompanySettings, updateWeeklyOffDays } = require("../controllers/companySettings.controller");

const router = express.Router();

const MENU_URL = "/production/holidays";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// GET is ungated, same shared-lookup reasoning as company-holidays — every
// logged-in user needs this for the client-side advisory edit-window check,
// not just Holiday Master itself.
router.get("/", getCompanySettings);
router.put("/weekly-off", requireMenuPermission(MENU_URL, "write"), updateWeeklyOffDays);

module.exports = router;
