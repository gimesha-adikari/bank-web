import { apiGet, apiJson } from "./http";
import type { EmailChangeRequest, UserProfile } from "./contracts";

export const usersApi = {
  me: (token: string) => apiGet<UserProfile>("/api/v1/users/me", token),
  changeEmail: (token: string, body: EmailChangeRequest) => apiJson<void>("/api/v1/users/me/email", "PUT", body, { token, allowGetRefresh: false }),
  verifyEmail: (token: string) => apiGet<void>(`/api/v1/users/me/email/verify?token=${encodeURIComponent(token)}`, null, { allowGetRefresh: false })
};
