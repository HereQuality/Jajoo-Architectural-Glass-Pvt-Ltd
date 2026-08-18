const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const { requireEditWindow } = require("../middlewares/editWindow.middleware");
const {
  createProductionEntry,
  updateProductionEntry,
  deleteProductionEntry,
  getProductionEntryById,
  listProductionEntries,
  getProductionEfficiency,
  downloadGrindingEfficiencyPdf,
  getShiftTimeReport,
} = require("../controllers/productionEntry.controller");

const router = express.Router();

const MENU_URL = "/production/data-entry";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", requireMenuPermission(MENU_URL, "write"), createProductionEntry);
router.get("/", requireMenuPermission(MENU_URL, "read"), listProductionEntries);
router.get("/efficiency", requireMenuPermission(MENU_URL, "read"), getProductionEfficiency);
router.get("/efficiency/pdf", requireMenuPermission(MENU_URL, "read"), downloadGrindingEfficiencyPdf);
router.get("/shift-time-report", requireMenuPermission(MENU_URL, "read"), getShiftTimeReport);
router.get("/:entryId", requireMenuPermission(MENU_URL, "read"), getProductionEntryById);
router.put(
  "/:entryId",
  requireMenuPermission(MENU_URL, "write"),
  requireEditWindow,
  updateProductionEntry
);
router.delete(
  "/:entryId",
  requireMenuPermission(MENU_URL, "write"),
  requireEditWindow,
  deleteProductionEntry
);

module.exports = router;
