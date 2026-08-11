import React from "react";
import { Navigate } from "react-router-dom";
import Landing from "../pages/Landing";
import Login from "../pages/Login";
import Blocked from "../pages/Authentication/Blocked";
import NoAccess from "../pages/Authentication/NoAccess";
import NotFoundFallback from "./NotFoundFallback";

import HqeplAdmin from "../pages/HqeplAdmin";
import Home from "../pages/Home";
import Profile from "../pages/Profile";
import MenuGroup from "../pages/MenuGroup";
import MenuMaster from "../pages/MenuMaster";
import Department from "../pages/Department";
import RoleMaster from "../pages/RoleMaster";
import Employee from "../pages/Employee";
import ManageRole from "../pages/ManageRole";
import CompanyManagement from "../pages/CompanyManagement";
import Settings from "../pages/Settings";
import Shortcuts from "../pages/Shortcuts";
import TeamMembers from "../pages/TeamMembers";
import Skills from "../pages/Skills";
import TeamsBoard from "../pages/TeamsBoard";
import Support from "../pages/Support";
import Notifications from "../pages/Notifications";
import MachineMaster from "../pages/MachineMaster";
import ProcessMaster from "../pages/ProcessMaster";
import OperatorMaster from "../pages/OperatorMaster";
import StandardTimeMaster from "../pages/StandardTimeMaster";
import ProductionEntry from "../pages/ProductionEntry";
import Dashboard from "../pages/Dashboard";

// ── Every logged-in page, defined ONCE ──────────────────────────────────
// Every route renders under "/:roleSlug/<path>" — the role slug is
// resolved per-user by utils/roleUrl.js (SuperAdmin -> "hqepl",
// Employee -> their role's own custom slug).
// RoleRoute (see RoleRoute.jsx) is what actually enforces the two things
// below, using this same list — nothing is duplicated into a second
// "admin" route tree just to change the URL prefix.
//
//   roles: which roleTypes may open this URL at all. Omit it (or leave it
//   undefined) to mean "any authenticated role". Use it to lock a page to
//   specific roles, e.g. Menu Master / Menu Group are SuperAdmin-only
//   screens for defining what pages/menu items exist at all — a client's
//   Admin role only ever assigns access to what's already there, via
//   Manage Role.
//
//   Fine-grained per-page permissions (read/write/edit/delete/print/mail)
//   for Employees are a separate, already-dynamic layer handled by
//   MenuContext (currentPagePermissions) — that's what actually hides
//   buttons/menu links a role's role wasn't granted "read"/"write" on.
//   `roles` here is only the coarse "which portal" gate.
const protectedRoutes = [
  { path: "/profile", component: <Profile /> },
  { path: "/settings", component: <Settings /> },
  { path: "/shortcuts", component: <Shortcuts /> },

  // Company/Employee home — all non-SuperAdmin users land here
  { path: "/home", component: <Home /> },

  // SuperAdmin only — defines the app's page/menu structure itself
  { path: "/hqepl-dashboard", component: <HqeplAdmin />, roles: ["SuperAdmin"] },
  { path: "/menu-groups", component: <MenuGroup />, roles: ["SuperAdmin"] },
  { path: "/menus", component: <MenuMaster />, roles: ["SuperAdmin"] },
  { path: "/company", component: <CompanyManagement />, roles: ["SuperAdmin"] },

  // Shared by SuperAdmin and every Employee role alike — what each one
  // actually sees/can edit inside these pages is still narrowed by their
  // menu permissions (MenuContext), not by a second copy of the page.
  { path: "/employee-management/department", component: <Department /> },
  { path: "/employee-management/role", component: <RoleMaster /> },
  { path: "/employee-management/employee", component: <Employee /> },
  { path: "/employee-management/manage-role", component: <ManageRole /> },
  { path: "/employee-management/team-members", component: <TeamMembers /> },
  // Other Routes
  { path: "/skills", component: <Skills /> },
  { path: "/teams", component: <TeamsBoard /> },
  { path: "/support", component: <Support /> },
  { path: "/notifications", component: <Notifications /> },

  // Production module
  { path: "/production/machines", component: <MachineMaster /> },
  { path: "/production/processes", component: <ProcessMaster /> },
  { path: "/production/operators", component: <OperatorMaster /> },
  { path: "/production/standard-time", component: <StandardTimeMaster /> },
  { path: "/production/data-entry", component: <ProductionEntry /> },
  { path: "/dashboard", component: <Dashboard /> },

  // Dev-only tool — not registered in Menu Master, reached by direct URL.
];

const publicRoutes = [
  { path: "/", component: <Login /> },
  { path: "/landing", component: <Landing /> },
  { path: "/login", component: <Login /> },
  { path: "/blocked", component: <Blocked /> },
  { path: "/no-access", component: <NoAccess /> },

  // Fallback
  { path: "*", component: <NotFoundFallback /> },
];

export { protectedRoutes, publicRoutes };
