const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createMachine,
  updateMachine,
  deleteMachine,
  getMachineById,
  listMachines,
  listMachineByParams,
} = require("../controllers/machine.controller");

const router = express.Router();

const MENU_URL = "/production/machines";

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// GET /, GET /:machineId are intentionally left without a menu-permission
// check — they're the shared machine lookup used by Grinding Data Entry and
// Dashboard (dropdowns, machine names), not just Machine Master itself, so
// gating them behind Machine Master's own permission would break those
// other pages for a role that only has Data Entry access. Only the actual
// admin actions (create/update/delete) and Machine Master's own search are
// menu-gated.
router.post("/", requireMenuPermission(MENU_URL, "write"), createMachine);
router.get("/", listMachines);
router.get("/:machineId", getMachineById);
router.put("/:machineId", requireMenuPermission(MENU_URL, "write"), updateMachine);
router.delete("/:machineId", requireMenuPermission(MENU_URL, "write"), deleteMachine);
router.post("/search", requireMenuPermission(MENU_URL, "read"), listMachineByParams);

module.exports = router;
