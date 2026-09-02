const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createOperator,
  updateOperator,
  deleteOperator,
  getOperatorById,
  listOperators,
  listOperatorsByParams,
} = require("../controllers/operator.controller");

const router = express.Router();

const MENU_URL = "/production/operators";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// GET /, GET /:operatorId are intentionally left without a menu-permission
// check — they're the shared operator lookup used by Grinding Data Entry
// and Dashboard, not just Operator Master itself (see machine.routes.js for
// the same reasoning). Only admin actions and Operator Master's own search
// are menu-gated.
router.post("/", requireMenuPermission(MENU_URL, "write"), createOperator);
router.get("/", listOperators);
router.post("/search", requireMenuPermission(MENU_URL, "read"), listOperatorsByParams);
router.get("/:operatorId", getOperatorById);
router.put("/:operatorId", requireMenuPermission(MENU_URL, "write"), updateOperator);
router.delete("/:operatorId", requireMenuPermission(MENU_URL, "write"), deleteOperator);

module.exports = router;
