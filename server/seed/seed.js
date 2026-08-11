"use strict";
/**
 * scripts/seed.js
 *
 * One-shot seeder for a fresh database:
 *   1. The platform-owner SuperAdmin account (email/username/password below).
 *   2. Menu Groups + Menus for the HQEPL (SuperAdmin) portal:
 *      Dashboard, Menu Group, Menu Master, Employee Management (with its
 *      Department/Teams/Role/Skills/Employee/Manage Role/Org Chart children).
 *   3. A Menu Group + Menu for the normal Employee portal's Dashboard.
 *
 * Safe to re-run: every insert is upsert-by-natural-key.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const User = require("../models/user.model");
const MenuGroupMaster = require("../models/MenuGroupMaster");
const MenuMaster = require("../models/MenuMaster");

const SUPERADMIN = {
  name: "HQEPL Admin",
  username: "hqepl",
  email: "csc@herequality.com",
  password: "Hqepl@123",
  roleType: "SuperAdmin",
};

// ── Menu groups & menus ──────────────────────────────────────────────
const HQEPL_DASHBOARD_GROUP = {
  menuGroupName: "hqepl-dashboard",
  sequence: 2,
  isLink: true,
  menuUrl: "/hqepl/hqepl-dashboard",
  portal: "SuperAdmin",
  icon: "ShieldCheck",
};

const EMPLOYEE_DASHBOARD_GROUP = {
  menuGroupName: "Home",
  sequence: 1,
  isLink: true,
  menuUrl: "/hqepl/home", // prefix is rewritten per-role at render time
  portal: "Both",
  icon: "Home",
};

const ADMINISTRATION_GROUP = {
  menuGroupName: "Administration",
  sequence: 3,
  isLink: false,
  portal: "SuperAdmin",
  icon: "Settings",
};

const ADMINISTRATION_MENUS = [
  { menuName: "Menu Group", menuUrl: "/x/menu-groups", sequence: 1, icon: "FolderTree" },
  { menuName: "Menu Master", menuUrl: "/x/menus", sequence: 2, icon: "List" },
  { menuName: "Company", menuUrl: "/x/company", sequence: 3, icon: "Building2" },
];

// The OEE analytics dashboard (client/src/pages/Dashboard.jsx) — a direct
// link, not a group with children.
const DASHBOARD_GROUP = {
  menuGroupName: "Dashboard",
  sequence: 4,
  isLink: true,
  menuUrl: "/hqepl/dashboard",
  portal: "Both",
  icon: "LayoutDashboard",
};

const EMPLOYEE_MANAGEMENT_GROUP = {
  menuGroupName: "Employee Management",
  sequence: 5,
  isLink: false,
  portal: "Both",
  icon: "Users",
};

// Config/setup pages for the Production module.
const SETUP_GROUP = {
  menuGroupName: "Setup",
  sequence: 6,
  isLink: false,
  portal: "Both",
  icon: "Wrench",
};

// Per-process daily data-entry pages. Grinding today; future processes
// (Cutting, Edging, etc.) each get their own entry here as they're built.
const DATA_ENTRY_GROUP = {
  menuGroupName: "Data Entry",
  sequence: 7,
  isLink: false,
  portal: "Both",
  icon: "ClipboardList",
};

const EMPLOYEE_MANAGEMENT_MENUS = [
  { menuName: "Department", menuUrl: "/hqepl/employee-management/department", sequence: 1, icon: "Building" },
  { menuName: "Teams", menuUrl: "/hqepl/teams", sequence: 2, icon: "UsersRound" },
  { menuName: "Role", menuUrl: "/hqepl/employee-management/role", sequence: 3, icon: "ShieldCheck" },
  { menuName: "Skills", menuUrl: "/hqepl/skills", sequence: 4, icon: "Sparkles" },
  { menuName: "Employee", menuUrl: "/hqepl/employee-management/employee", sequence: 5, icon: "User" },
  { menuName: "Manage Role", menuUrl: "/hqepl/employee-management/manage-role", sequence: 6, icon: "UserCog" },
];

const SETUP_MENUS = [
  { menuName: "Process Master", menuUrl: "/hqepl/production/processes", sequence: 1, icon: "Workflow" },
  { menuName: "Machine Master", menuUrl: "/hqepl/production/machines", sequence: 2, icon: "Factory" },
  { menuName: "Operator Master", menuUrl: "/hqepl/production/operators", sequence: 3, icon: "UserCog" },
  { menuName: "Standard Time Master", menuUrl: "/hqepl/production/standard-time", sequence: 4, icon: "Timer" },
];

const DATA_ENTRY_MENUS = [
  { menuName: "Grinding Data Entry", menuUrl: "/hqepl/production/data-entry", sequence: 1, icon: "FileSpreadsheet" },
];

// Support ticketing. Every role sees it (isLink: true, direct page — no
// submenu), but what happens on it depends on their Manage Role permission:
//   - SuperAdmin: always full access (built-in bypass, no permission row needed).
//   - Employee with "write"/edit on this menu: becomes a support AGENT —
//     everyone else's tickets land in their queue instead of going straight
//     to SuperAdmin (see server/utils/supportAgent.js).
//   - Employee with only "read": can raise their own tickets, nothing else.
const SUPPORT_GROUP = {
  menuGroupName: "Support",
  sequence: 8,
  isLink: true,
  menuUrl: "/hqepl/support",
  portal: "Both",
  icon: "Headphones",
};

async function upsertGroup(def) {
  const group = await MenuGroupMaster.findOneAndUpdate(
    { menuGroupName: def.menuGroupName, portal: def.portal },
    { ...def, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return group;
}

async function run() {
  await connectDB();

  // ── 1. SuperAdmin user ────────────────────────────────────────────
  let admin = await User.findOne({ email: SUPERADMIN.email });
  if (!admin) {
    admin = await User.create(SUPERADMIN); // pre-save hook hashes the password
    console.log(`Created SuperAdmin: ${SUPERADMIN.email} / ${SUPERADMIN.username}`);
  } else {
    console.log(`SuperAdmin already exists: ${SUPERADMIN.email} (left untouched)`);
  }

  // ── 2. HQEPL (SuperAdmin) portal menus ───────────────────────────
  // Clear old menus to prevent duplicates due to URL changes
  await MenuGroupMaster.deleteMany({});
  await MenuMaster.deleteMany({});

  await upsertGroup(HQEPL_DASHBOARD_GROUP);
  
  const adminGroup = await upsertGroup(ADMINISTRATION_GROUP);
  for (const menu of ADMINISTRATION_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: adminGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
        icon: menu.icon,
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  
  const empMgmtGroup = await upsertGroup(EMPLOYEE_MANAGEMENT_GROUP);

  for (const menu of EMPLOYEE_MANAGEMENT_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: empMgmtGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
        icon: menu.icon,
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await upsertGroup(DASHBOARD_GROUP);

  const setupGroup = await upsertGroup(SETUP_GROUP);
  for (const menu of SETUP_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: setupGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
        icon: menu.icon,
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const dataEntryGroup = await upsertGroup(DATA_ENTRY_GROUP);
  for (const menu of DATA_ENTRY_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: dataEntryGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
        icon: menu.icon,
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  // Add Support as a direct link group
  await upsertGroup(SUPPORT_GROUP);

  console.log("Seeded HQEPL menu groups + Employee Management menus.");

  // ── 3. Normal Employee portal dashboard ──────────────────────────
  await upsertGroup(EMPLOYEE_DASHBOARD_GROUP);
  console.log("Seeded Employee portal dashboard menu group.");

  console.log("\nDone. Login with:");
  console.log(`  username: ${SUPERADMIN.username}`);
  console.log(`  email:    ${SUPERADMIN.email}`);
  console.log(`  password: ${SUPERADMIN.password}`);

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
