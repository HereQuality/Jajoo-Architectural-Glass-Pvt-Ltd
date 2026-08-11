const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createMachine,
  updateMachine,
  deleteMachine,
  getMachineById,
  listMachines,
  listMachineByParams,
} = require("../controllers/machine.controller");

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", createMachine);
router.get("/", listMachines);
router.get("/:machineId", getMachineById);
router.put("/:machineId", updateMachine);
router.delete("/:machineId", deleteMachine);
router.post("/search", listMachineByParams);

module.exports = router;
