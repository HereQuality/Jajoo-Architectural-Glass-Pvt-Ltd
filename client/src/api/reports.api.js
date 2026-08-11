/**
 * OEE Reports API Service
 */
import api from "./index";
import { ENDPOINTS } from "./endpoints";

export const downloadOeeReport = async (params) =>
  api.get(ENDPOINTS.REPORTS.OEE, { params, responseType: "blob" });

// Dashboard's quick download — always all machines, no process/machine filter.
export const downloadDashboardOeeReport = async (params) =>
  api.get(ENDPOINTS.REPORTS.OEE_DASHBOARD, { params, responseType: "blob" });

export default { downloadOeeReport, downloadDashboardOeeReport };
