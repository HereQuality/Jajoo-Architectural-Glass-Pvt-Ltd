"use strict";
// Safe, idempotent menu/sidebar structure seeder. Every write is an
// upsert-by-natural-key (menuGroupName+portal for groups, menuUrl for
// menus) — it NEVER deletes/recreates MenuGroupMaster or MenuMaster rows,
// unlike seed.js's one-shot fresh-install seeder. That matters because
// EmployeeRoles (server/models/EmployeeRoles.js) stores role permissions
// keyed by the exact menuId/menuGroupId ObjectId — wiping and recreating
// these collections would silently orphan every existing role's
// permissions. Re-running this script is always safe: existing groups/
// menus keep their _id and just get their sequence/menuGroup/icon fields
// updated in place; only genuinely new rows get created.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const MenuGroupMaster = require("../models/MenuGroupMaster");
const MenuMaster = require("../models/MenuMaster");

// ── Sidebar order (top to bottom) ────────────────────────────────────────
//   1. Home                      (link)
//   2. hqepl-dashboard            (link, SuperAdmin only)
//   3. Administration             (group: Menu Group, Menu Master, Company)
//   4. Dashboard                  (link — the OEE analytics dashboard)
//   5. Employee Management        (group)
//   6. Setup                      (group: Process/Machine/Operator/Standard Time Master)
//   7. Data Entry                 (group: Grinding Data Entry today; future
//                                  per-process entry pages join here too)
//   8. Support                    (link)
const HOME_GROUP = { menuGroupName: "Home", sequence: 1, isLink: true, menuUrl: "/hqepl/home", portal: "Both", icon: "Home" };
const HQEPL_DASHBOARD_GROUP = { menuGroupName: "hqepl-dashboard", sequence: 2, isLink: true, menuUrl: "/hqepl/hqepl-dashboard", portal: "SuperAdmin", icon: "ShieldCheck" };
const ADMINISTRATION_GROUP = { menuGroupName: "Administration", sequence: 3, isLink: false, portal: "SuperAdmin", icon: "Settings" };
const DASHBOARD_GROUP = { menuGroupName: "Dashboard", sequence: 4, isLink: true, menuUrl: "/hqepl/dashboard", portal: "Both", icon: "LayoutDashboard" };
const EMPLOYEE_MANAGEMENT_GROUP = { menuGroupName: "Employee Management", sequence: 5, isLink: false, portal: "Both", icon: "Users" };
const SETUP_GROUP = { menuGroupName: "Setup", sequence: 6, isLink: false, portal: "Both", icon: "Wrench" };
const DATA_ENTRY_GROUP = { menuGroupName: "Data Entry", sequence: 7, isLink: false, portal: "Both", icon: "ClipboardList" };
const SUPPORT_GROUP = { menuGroupName: "Support", sequence: 8, isLink: true, menuUrl: "/hqepl/support", portal: "Both", icon: "Headphones" };

// Retired group — its menus have all moved to SETUP_GROUP / DATA_ENTRY_GROUP.
// Deactivated (not deleted) so any pre-existing group-level permission row
// pointing at its _id doesn't dangle on a missing document; it just stops
// rendering (getMenuByGroups filters isActive: true).
const RETIRED_PRODUCTION_GROUP_NAME = "Production";

const ADMINISTRATION_MENUS = [
  { menuName: "Menu Group", menuUrl: "/x/menu-groups", sequence: 1, icon: "FolderTree" },
  { menuName: "Menu Master", menuUrl: "/x/menus", sequence: 2, icon: "List" },
  { menuName: "Company", menuUrl: "/x/company", sequence: 3, icon: "Building2" },
];

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

async function upsertGroup(def) {
  return MenuGroupMaster.findOneAndUpdate(
    { menuGroupName: def.menuGroupName, portal: def.portal },
    { ...def, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertMenus(menus, group) {
  for (const menu of menus) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: group._id,
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
}

async function run() {
  await connectDB();

  await upsertGroup(HOME_GROUP);
  await upsertGroup(HQEPL_DASHBOARD_GROUP);

  const adminGroup = await upsertGroup(ADMINISTRATION_GROUP);
  await upsertMenus(ADMINISTRATION_MENUS, adminGroup);

  await upsertGroup(DASHBOARD_GROUP);

  const empMgmtGroup = await upsertGroup(EMPLOYEE_MANAGEMENT_GROUP);
  await upsertMenus(EMPLOYEE_MANAGEMENT_MENUS, empMgmtGroup);

  const setupGroup = await upsertGroup(SETUP_GROUP);
  await upsertMenus(SETUP_MENUS, setupGroup);

  const dataEntryGroup = await upsertGroup(DATA_ENTRY_GROUP);
  await upsertMenus(DATA_ENTRY_MENUS, dataEntryGroup);

  await upsertGroup(SUPPORT_GROUP);

  // Retire the old combined "Production" group now that its menus have all
  // been re-pointed to Setup/Data Entry above.
  await MenuGroupMaster.updateMany(
    { menuGroupName: RETIRED_PRODUCTION_GROUP_NAME },
    { isActive: false }
  );

  console.log("Menus seeded (safe upsert, existing IDs preserved).");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
