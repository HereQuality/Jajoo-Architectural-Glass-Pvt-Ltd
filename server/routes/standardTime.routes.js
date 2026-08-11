const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const {
  createStandardTime,
  updateStandardTime,
  deleteStandardTime,
  getStandardTimeById,
  listStandardTimes,
  searchStandardTimes,
} = require("../controllers/standardTime.controller");

const router = express.Router();

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.get("/", listStandardTimes);          // ?machine=<id>&isActive=true
router.post("/", createStandardTime);
router.post("/search", searchStandardTimes); // paginated for master page
router.get("/:stdId", getStandardTimeById);
router.put("/:stdId", updateStandardTime);
router.delete("/:stdId", deleteStandardTime);

module.exports = router;
