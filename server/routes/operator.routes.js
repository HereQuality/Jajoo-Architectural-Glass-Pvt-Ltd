const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createOperator,
  updateOperator,
  deleteOperator,
  getOperatorById,
  listOperators,
  listOperatorsByParams,
} = require("../controllers/operator.controller");

const router = express.Router();

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", createOperator);
router.get("/", listOperators);
router.post("/search", listOperatorsByParams);
router.get("/:operatorId", getOperatorById);
router.put("/:operatorId", updateOperator);
router.delete("/:operatorId", deleteOperator);

module.exports = router;
