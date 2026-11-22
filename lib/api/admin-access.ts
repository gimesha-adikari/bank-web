import { apiGet, apiJson } from "./http";
import type {
  AdminAccessRole,
  AdminEmployeeRecord,
  AdminManagerDirectoryEntry,
  AdminRoleUpdateRequest,
  AdminUserDirectoryEntry
} from "./contracts";

const root = "/api/v1/access-control";

export const adminAccessApi = {
  listRoles: (): Promise<AdminAccessRole[]> => apiGet(`${root}/roles`),
  listEmployees: (): Promise<AdminEmployeeRecord[]> => apiGet(`${root}/employees`),
  listManagers: (): Promise<AdminManagerDirectoryEntry[]> => apiGet(`${root}/employees/managers`),
  listUsers: (): Promise<AdminUserDirectoryEntry[]> => apiGet(`${root}/users`),
  getUserByUsername: (username: string): Promise<AdminUserDirectoryEntry> =>
    apiGet(`${root}/users/${encodeURIComponent(username)}`),
  updateUserRole: (userId: string, body: AdminRoleUpdateRequest): Promise<string> =>
    apiJson(`${root}/roles/${encodeURIComponent(userId)}`, "PUT", body)
};
