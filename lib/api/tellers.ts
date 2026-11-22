import { apiGet, apiJson } from "./http";
import type { TellerEmployee, TellerRequest, TellerUserDirectoryEntry } from "./contracts";

export const tellersApi = {
  list: (): Promise<TellerEmployee[]> => apiGet("/api/v1/tellers"),
  users: (): Promise<TellerUserDirectoryEntry[]> => apiGet("/api/v1/tellers/users"),
  create: (userId: string, body: TellerRequest): Promise<string> => {
    const query = new URLSearchParams({ userId });
    return apiJson(`/api/v1/tellers?${query.toString()}`, "POST", body);
  },
  update: (userId: string, body: TellerRequest): Promise<string> =>
    apiJson(`/api/v1/tellers/${encodeURIComponent(userId)}`, "PUT", body),
  remove: (userId: string): Promise<void> =>
    apiJson(`/api/v1/tellers/${encodeURIComponent(userId)}`, "DELETE")
};
