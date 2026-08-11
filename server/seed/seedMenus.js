"use strict";
// Seeds only Menu Groups + Menus (Dashboard / Menu Group / Menu Master /
// Employee Management + children, for both portals). See scripts/seed.js
// for the full seed — this exists because package.json's "seed:menus"
// script expects this file to exist.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const MenuGroupMaster = require("../models/MenuGroupMaster");
const MenuMaster = require("../models/MenuMaster");

const HQEPL_DASHBOARD_GROUP = { menuGroupName: "hqepl-dashboard", sequence: 2, isLink: true, menuUrl: "/hqepl/hqepl-dashboard", portal: "SuperAdmin" };
const EMPLOYEE_DASHBOARD_GROUP = { menuGroupName: "Dashboard", sequence: 1, isLink: true, menuUrl: "/hqepl/dashboard", portal: "Both" };
const ADMINISTRATION_GROUP = { menuGroupName: "Administration", sequence: 3, isLink: false, portal: "SuperAdmin" };
const EMPLOYEE_MANAGEMENT_GROUP = { menuGroupName: "Employee Management", sequence: 4, isLink: false, portal: "Both" };
const PRODUCTION_GROUP = { menuGroupName: "Production", sequence: 5, isLink: false, portal: "Both" };

const ADMINISTRATION_MENUS = [
  { menuName: "Menu Group", menuUrl: "/x/menu-groups", sequence: 1 },
  { menuName: "Menu Master", menuUrl: "/x/menus", sequence: 2 },
  { menuName: "Company", menuUrl: "/x/company", sequence: 3 },
];

const EMPLOYEE_MANAGEMENT_MENUS = [
  { menuName: "Department", menuUrl: "/hqepl/employee-management/department", sequence: 1 },
  { menuName: "Role", menuUrl: "/hqepl/employee-management/role", sequence: 2 },
  { menuName: "Employee", menuUrl: "/hqepl/employee-management/employee", sequence: 3 },
  { menuName: "Manage Role", menuUrl: "/hqepl/employee-management/manage-role", sequence: 4 },
];

const PRODUCTION_MENUS = [
  { menuName: "Machine Master", menuUrl: "/hqepl/production/machines", sequence: 1 },
  { menuName: "Operator Master", menuUrl: "/hqepl/production/operators", sequence: 2 },
  { menuName: "Standard Time Master", menuUrl: "/hqepl/production/standard-time", sequence: 3 },
  { menuName: "Production Data Entry", menuUrl: "/hqepl/production/data-entry", sequence: 4 },
];

async function upsertGroup(def) {
  return MenuGroupMaster.findOneAndUpdate(
    { menuGroupName: def.menuGroupName, portal: def.portal },
    { ...def, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await connectDB();

  await upsertGroup(HQEPL_DASHBOARD_GROUP);
  await upsertGroup(EMPLOYEE_DASHBOARD_GROUP);
  const adminGroup = await upsertGroup(ADMINISTRATION_GROUP);

  for (const menu of ADMINISTRATION_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: adminGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
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
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const productionGroup = await upsertGroup(PRODUCTION_GROUP);

  for (const menu of PRODUCTION_MENUS) {
    await MenuMaster.findOneAndUpdate(
      { menuUrl: menu.menuUrl },
      {
        menuName: menu.menuName,
        menuGroup: productionGroup._id,
        menuUrl: menu.menuUrl,
        sequence: menu.sequence,
        isActive: true,
        isParent: false,
        parentMenu: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log("Menus seeded.");
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
