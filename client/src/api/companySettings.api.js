/**
 * Company Settings API Service (weekly off days, etc.)
 */
import api from "./index";
import { ENDPOINTS } from "./endpoints";

export const getCompanySettings = () => api.get(ENDPOINTS.COMPANY_SETTINGS.BASE);
export const updateWeeklyOffDays = (weeklyOffDays) =>
  api.put(ENDPOINTS.COMPANY_SETTINGS.WEEKLY_OFF, { weeklyOffDays });

export default { getCompanySettings, updateWeeklyOffDays };
