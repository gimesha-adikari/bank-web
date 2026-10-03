import { apiGet, apiJson } from "./http";
import type { ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, LoginResponse, RegisterRequest, TokenIdentity } from "./contracts";

export const authApi = {
  login: (body: LoginRequest) => apiJson<LoginResponse>("/api/v1/auth/login", "POST", body),
  validateToken: () => apiGet<TokenIdentity>("/api/v1/auth/validate-token"),
  usernameAvailable: (username: string) => apiGet<string>(`/api/v1/auth/available?username=${encodeURIComponent(username)}`),
  logout: () => apiJson<void>("/api/v1/auth/logout", "POST"),
  changePassword: (body: ChangePasswordRequest) => apiJson<void>("/api/v1/auth/change-password", "PUT", body),
  register: (body: RegisterRequest) => apiJson<void>("/api/v1/auth/register", "POST", body),
  forgotPassword: (body: ForgotPasswordRequest) => apiJson<void>("/api/v1/auth/forgot-password", "POST", body),
  validateResetToken: (token: string) => apiGet<void>(`/api/v1/auth/reset-password?token=${encodeURIComponent(token)}`),
  resetPassword: (token: string, newPassword: string) => apiJson<void>(`/api/v1/auth/reset-password?token=${encodeURIComponent(token)}&newPassword=${encodeURIComponent(newPassword)}`, "POST")
};
