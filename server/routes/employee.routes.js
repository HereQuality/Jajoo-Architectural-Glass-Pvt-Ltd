const express = require("express");
const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");
const {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  listAllEmployees,
  listTeamMembers,
  listEmployeesByParams,
  listAllEmployeesByDepartment,
  resetPassword,
  impersonateEmployee,
} = require("../controllers/employee.controller");

const { uploadProfilePic } = require("../middlewares/upload.middleware");
const { rewriteUploadPaths } = require("../utils/fileUrl");

const router = express.Router();

const MENU_URL = "/employee-management/employee";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

// ── Employee Management page endpoints ──────────────────────────────────────
router.post("/", requireMenuPermission(MENU_URL, "write"), uploadProfilePic.single("profilePic"), rewriteUploadPaths, createEmployee);
router.get("/", requireMenuPermission(MENU_URL, "read"), listAllEmployees);
router.post("/search", requireMenuPermission(MENU_URL, "read"), listEmployeesByParams);
router.post("/department/:departmentId", requireMenuPermission(MENU_URL, "read"), listAllEmployeesByDepartment);

// ── Team Members page endpoints (SuperAdmin only, must be BEFORE /:employeeId) ──
// Static sub-paths must come before dynamic /:employeeId or Express will
// match "team-members" as an employeeId and hit the wrong handler.
// This isn't a normal menu-permission page — it lets one account impersonate
// another, so it's intentionally not delegable to any custom role, ever
// (previously this relied on requireMenuPermission against menu URLs that
// were never seeded, which happened to also always block Employees, but for
// the wrong reason — a role granted "manage-role" style full access could
// never actually be given this, but the failure mode was an opaque "page
// not available" 403 rather than an explicit, correct restriction).
router.get("/team-members/list", authorize("SuperAdmin"), listTeamMembers);
router.post("/:employeeId/impersonate", authorize("SuperAdmin"), impersonateEmployee);

// ── Dynamic employee ID routes ────────────────────────────────────────────
router.get("/:employeeId", requireMenuPermission(MENU_URL, "read"), getEmployeeById);
router.put("/:employeeId", requireMenuPermission(MENU_URL, "write"), uploadProfilePic.single("profilePic"), rewriteUploadPaths, updateEmployee);
router.delete("/:employeeId", requireMenuPermission(MENU_URL, "write"), deleteEmployee);
router.post("/:employeeId/reset-password", requireMenuPermission(MENU_URL, "write"), resetPassword);

module.exports = router;


