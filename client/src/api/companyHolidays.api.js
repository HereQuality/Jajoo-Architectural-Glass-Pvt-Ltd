/**
 * Company Holiday Master API Service
 */
import api from "./index";
import { ENDPOINTS } from "./endpoints";

export const getCompanyHolidays = () => api.get(ENDPOINTS.COMPANY_HOLIDAYS.BASE);
export const createCompanyHoliday = (data) => api.post(ENDPOINTS.COMPANY_HOLIDAYS.BASE, data);
export const updateCompanyHoliday = (id, data) => api.put(ENDPOINTS.COMPANY_HOLIDAYS.BY_ID(id), data);
export const deleteCompanyHoliday = (id) => api.delete(ENDPOINTS.COMPANY_HOLIDAYS.BY_ID(id));

export default { getCompanyHolidays, createCompanyHoliday, updateCompanyHoliday, deleteCompanyHoliday };
