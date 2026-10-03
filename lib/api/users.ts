import { apiGet, apiJson } from "./http";
import type { EmailChangeRequest, UserProfile } from "./contracts";

export const usersApi = {
  me: () => apiGet<UserProfile>("/api/v1/users/me"),
  changeEmail: (body: EmailChangeRequest) => apiJson<void>("/api/v1/users/me/email", "PUT", body),
  verifyEmail: (token: string) => apiGet<void>(`/api/v1/users/me/email/verify?token=${encodeURIComponent(token)}`)
};
