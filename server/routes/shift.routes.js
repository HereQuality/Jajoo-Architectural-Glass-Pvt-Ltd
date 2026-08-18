const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createShift,
  updateShift,
  deleteShift,
  getShiftById,
  listShifts,
  listShiftByParams,
} = require("../controllers/shift.controller");

const router = express.Router();

const MENU_URL = "/production/shift-master";

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", requireMenuPermission(MENU_URL, "write"), createShift);
router.get("/", listShifts);
router.get("/:shiftId", requireMenuPermission(MENU_URL, "read"), getShiftById);
router.put("/:shiftId", requireMenuPermission(MENU_URL, "write"), updateShift);
router.delete("/:shiftId", requireMenuPermission(MENU_URL, "write"), deleteShift);
router.post("/search", requireMenuPermission(MENU_URL, "read"), listShiftByParams);

module.exports = router;
