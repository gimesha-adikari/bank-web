import type { Customer, CustomerRecordRequest } from "./contracts";
import { ApiError } from "./errors";
import { apiGet, apiJson } from "./http";

const self = "/api/v1/customers/me";

export const customersApi = {
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
