const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createProcess,
  updateProcess,
  deleteProcess,
  getProcessById,
  listProcesses,
  listProcessByParams,
} = require("../controllers/process.controller");

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", createProcess);
router.get("/", listProcesses);
router.get("/:processId", getProcessById);
router.put("/:processId", updateProcess);
router.delete("/:processId", deleteProcess);
router.post("/search", listProcessByParams);

module.exports = router;
