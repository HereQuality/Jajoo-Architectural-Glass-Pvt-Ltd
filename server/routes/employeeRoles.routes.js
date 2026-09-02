const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createEmployeeRoles,
  getEmployeeRoles,
  updateEmployeeRoles,
} = require("../controllers/employeeRoles.controller");

const router = express.Router();

// NOTE: GET is intentionally NOT unconditionally gated by
// requireMenuPermission. Every logged-in Employee calls GET /:roleId with
// their OWN roleId to resolve their own permissions and build their sidebar
// (see MenuContext.fetchEmployeeRoles) — gating that self-lookup on
// "manage-role" access would break every employee's menu on login.
// ManageRole.jsx also calls this for OTHER roles' roleId, to populate the
// permission-editing grid — that case (and only that case) needs the same
// Manage-Role "read" permission the mutating endpoints already require, so
// an employee can't fetch an arbitrary other role's full permission matrix
// just by knowing/guessing its id.
const MENU_URL = "/employee-management/manage-role";

const allowSelfOrManageRolePermission = (req, res, next) => {
  const isSelf = req.user.roleId && String(req.user.roleId) === String(req.params.roleId);
  if (isSelf || req.user.roleType === "SuperAdmin") return next();
  return requireMenuPermission(MENU_URL, "read")(req, res, next);
};

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.post("/", requireMenuPermission(MENU_URL, "write"), createEmployeeRoles);
router.get("/:roleId", allowSelfOrManageRolePermission, getEmployeeRoles);
router.put("/:roleId", requireMenuPermission(MENU_URL, "write"), updateEmployeeRoles);

module.exports = router;
