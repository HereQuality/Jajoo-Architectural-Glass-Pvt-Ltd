const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createCompanyHoliday,
  updateCompanyHoliday,
  deleteCompanyHoliday,
  listCompanyHolidays,
} = require("../controllers/companyHoliday.controller");

const router = express.Router();

const MENU_URL = "/production/holidays";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// GET / is intentionally left without a menu-permission check — every
// logged-in user needs the holiday list to compute the advisory "is this
// entry still editable" check client-side (see client/src/utils/
// workingDays.js), not just Holiday Master itself (same shared-lookup
// reasoning as Machine/Process/Standard Time's own GET list endpoints).
router.get("/", listCompanyHolidays);
router.post("/", requireMenuPermission(MENU_URL, "write"), createCompanyHoliday);
router.put("/:holidayId", requireMenuPermission(MENU_URL, "write"), updateCompanyHoliday);
router.delete("/:holidayId", requireMenuPermission(MENU_URL, "write"), deleteCompanyHoliday);

module.exports = router;
