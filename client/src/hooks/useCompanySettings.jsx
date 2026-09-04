import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanySettings } from "../api/companySettings.api";

export const COMPANY_SETTINGS_QUERY_KEY = ["companySettings"];

export const useCompanySettings = (options = {}) => {
  return useQuery({
    queryKey: COMPANY_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await getCompanySettings();
      return response?.data?.data || { weeklyOffDays: [2] };
    },
    ...options,
  });
};

export const useInvalidateCompanySettings = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: COMPANY_SETTINGS_QUERY_KEY });
};
