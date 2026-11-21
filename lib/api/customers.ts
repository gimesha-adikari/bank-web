import type { Customer, CustomerRecordRequest, UserProfile } from "./contracts";
import { ApiError } from "./errors";
import { apiGet, apiJson } from "./http";

const self = "/api/v1/customers/me";

export const customersApi = {
  listStaffCustomers: (): Promise<Customer[]> => apiGet<Customer[]>("/api/v1/customers"),
  getStaffCustomer: (customerId: string): Promise<Customer> =>
    apiGet<Customer>(`/api/v1/customers/${encodeURIComponent(customerId)}`),
  searchCustomerUsers: (search: string): Promise<UserProfile[]> => {
    const query = new URLSearchParams({ search });
    return apiGet<UserProfile[]>(`/api/v1/users/all?${query.toString()}`);
  },
  createStaffCustomer: (body: CustomerRecordRequest): Promise<Customer> =>
    apiJson<Customer>("/api/v1/customers", "POST", body),
  updateStaffCustomer: (body: CustomerRecordRequest): Promise<Customer> =>
    apiJson<Customer>("/api/v1/customers", "PUT", body),
  async me(): Promise<Customer | null> {
    try {
      const record = await apiGet<Customer>(self);
      if (!record?.customerId) throw new ApiError({ kind: "parse", message: "Invalid customer record." });
      return record;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === "ERR_NOT_FOUND") return null;
      throw error;
    }
  },
  save: (body: CustomerRecordRequest) => apiJson<Customer>(self, "PUT", body)
};
