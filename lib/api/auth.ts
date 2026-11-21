import { apiGet, apiJson, apiRequest } from "./http";
import type { ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, LoginResponse, RegisterRequest, TokenIdentity } from "./contracts";

export const authApi = {
  login: (body: LoginRequest) => apiJson<LoginResponse>("/api/v1/auth/login", "POST", body),
  validateToken: () => apiGet<TokenIdentity>("/api/v1/auth/validate-token"),
  usernameAvailable: (username: string) => apiGet<string>(`/api/v1/auth/available?username=${encodeURIComponent(username)}`),
  logout: () => apiJson<void>("/api/v1/auth/logout", "POST"),
  changePassword: (body: ChangePasswordRequest) => apiJson<void>("/api/v1/auth/change-password", "PUT", body),
  register: (body: RegisterRequest) => apiJson<void>("/api/v1/auth/register", "POST", body),
  forgotPassword: (body: ForgotPasswordRequest) => apiJson<void>("/api/v1/auth/forgot-password", "POST", body),
  resetPassword: (token: string, newPassword: string) => apiRequest<void>("/api/v1/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ token, newPassword }).toString()
  })
};
