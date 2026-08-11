/**
 * Production Data Entry API Service
 */
import api from "./index";
import { ENDPOINTS } from "./endpoints";

export const createProductionEntry = async (data) =>
    api.post(ENDPOINTS.PRODUCTION_ENTRIES.BASE, data);

export const updateProductionEntry = async (id, data) =>
    api.put(ENDPOINTS.PRODUCTION_ENTRIES.BY_ID(id), data);

export const deleteProductionEntry = async (id) =>
    api.delete(ENDPOINTS.PRODUCTION_ENTRIES.BY_ID(id));

export const getProductionEntryById = async (id) =>
    api.get(ENDPOINTS.PRODUCTION_ENTRIES.BY_ID(id));

/**
 * List entries for the sheet view.
 * @param {Object} params - { machine, from, to, skip, per_page }
 */
export const listProductionEntries = async (params = {}) =>
    api.get(ENDPOINTS.PRODUCTION_ENTRIES.BASE, { params });

/**
 * Operator Efficiency + Machine Efficiency tables for a date range.
 * @param {Object} params - { from, to }
 */
export const getProductionEfficiency = async (params = {}) =>
    api.get(ENDPOINTS.PRODUCTION_ENTRIES.EFFICIENCY, { params });

export default {
    createProductionEntry,
    updateProductionEntry,
    deleteProductionEntry,
    getProductionEntryById,
    listProductionEntries,
    getProductionEfficiency,
};
