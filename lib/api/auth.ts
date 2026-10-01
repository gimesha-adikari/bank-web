import { apiGet, apiJson } from "./http";
import type { ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, LoginResponse, RefreshResponse, RegisterRequest, TokenIdentity } from "./contracts";

export const authApi = {
  login: (body: LoginRequest) => apiJson<LoginResponse>("/api/v1/auth/login", "POST", body, { allowGetRefresh: false }),
  validateToken: (token: string) => apiGet<TokenIdentity>("/api/v1/auth/validate-token", token, { allowGetRefresh: false }),
  refresh: (token: string, username: string) => apiJson<RefreshResponse>("/api/v1/auth/refresh-token", "POST", { username }, { token, allowGetRefresh: false }),
  logout: (token: string) => apiJson<void>("/api/v1/auth/logout", "POST", undefined, { token, allowGetRefresh: false }),
  changePassword: (token: string, body: ChangePasswordRequest) => apiJson<void>("/api/v1/auth/change-password", "PUT", body, { token, allowGetRefresh: false }),
  register: (body: RegisterRequest) => apiJson<void>("/api/v1/auth/register", "POST", body, { allowGetRefresh: false }),
  forgotPassword: (body: ForgotPasswordRequest) => apiJson<void>("/api/v1/auth/forgot-password", "POST", body, { allowGetRefresh: false }),
  validateResetToken: (token: string) => apiGet<void>(`/api/v1/auth/reset-password?token=${encodeURIComponent(token)}`, null, { allowGetRefresh: false }),
  resetPassword: (token: string, newPassword: string) => apiJson<void>(`/api/v1/auth/reset-password?token=${encodeURIComponent(token)}&newPassword=${encodeURIComponent(newPassword)}`, "POST", undefined, { allowGetRefresh: false })
};
