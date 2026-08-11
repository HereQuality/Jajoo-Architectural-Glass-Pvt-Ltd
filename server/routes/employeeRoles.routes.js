const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createEmployeeRoles,
  getEmployeeRoles,
  updateEmployeeRoles,
} = require("../controllers/employeeRoles.controller");

const router = express.Router();

// NOTE: GET is intentionally NOT gated by requireMenuPermission. Every
// logged-in Employee calls GET /:roleId with their OWN roleId to
// resolve their own permissions and build their sidebar (see
// MenuContext.fetchEmployeeRoles) — gating it on "manage-role" write
// access would break every employee's menu on login. Only the
// mutating endpoints (assigning permissions to a role) are
// Manage-Role-permission-gated.
const MENU_URL = "/employee-management/manage-role";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", requireMenuPermission(MENU_URL, "write"), createEmployeeRoles);
router.get("/:roleId", getEmployeeRoles);
router.put("/:roleId", requireMenuPermission(MENU_URL, "write"), updateEmployeeRoles);

module.exports = router;
