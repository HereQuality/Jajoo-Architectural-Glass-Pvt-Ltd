"use strict";

/**
 * routes/skill.routes.js
 * ───────────────────────
 * Every route requires the "/skills" menu's own read/write permission
 * (Manage Role) — same fix as team.routes.js, this had no permission
 * check at all before, just a login check.
 */
const express = require("express");
const {
  createSkill,
  getAllSkills,
  getSkill,
  updateSkill,
  deleteSkill,
} = require("../controllers/skill.controller");

const { protect, authorize } = require("../middlewares/auth.middleware");
const { requireMenuPermission } = require("../middlewares/permission.middleware");

const router = express.Router();

const MENU_URL = "/skills";

router.use(protect);
router.use(authorize("SuperAdmin", "Employee"));

router.route("/")
  .get(requireMenuPermission(MENU_URL, "read"), getAllSkills)
  .post(requireMenuPermission(MENU_URL, "write"), createSkill);

router.route("/:id")
  .get(requireMenuPermission(MENU_URL, "read"), getSkill)
  .put(requireMenuPermission(MENU_URL, "write"), updateSkill)
  .delete(requireMenuPermission(MENU_URL, "write"), deleteSkill);

module.exports = router;
