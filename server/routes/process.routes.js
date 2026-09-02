const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createProcess,
  updateProcess,
  deleteProcess,
  getProcessById,
  listProcesses,
  listProcessByParams,
} = require("../controllers/process.controller");

const router = express.Router();

const MENU_URL = "/production/processes";

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// GET /, GET /:processId are intentionally left without a menu-permission
// check — they're the shared process lookup used by Grinding Data Entry and
// Dashboard, not just Process Master itself (see machine.routes.js for the
// same reasoning). Only admin actions and Process Master's own search are
// menu-gated.
router.post("/", requireMenuPermission(MENU_URL, "write"), createProcess);
router.get("/", listProcesses);
router.get("/:processId", getProcessById);
router.put("/:processId", requireMenuPermission(MENU_URL, "write"), updateProcess);
router.delete("/:processId", requireMenuPermission(MENU_URL, "write"), deleteProcess);
router.post("/search", requireMenuPermission(MENU_URL, "read"), listProcessByParams);

module.exports = router;
