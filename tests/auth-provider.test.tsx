import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
  validateToken: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  push: vi.fn(),
  replace: vi.fn()
}));

vi.mock("@/lib/api/auth", () => ({
  authApi: {
    validateToken: mocks.validateToken,
    logout: mocks.logout,
    login: mocks.login
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/customer"
}));

import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { triggerAuthExpired } from "@/lib/api/http";

function Harness() {
  const auth = useAuth();
  const [failure, setFailure] = useState<string | null>(null);
  return <div>
    <output data-testid="status">{auth.status}</output>
    <output data-testid="username">{auth.username ?? ""}</output>
    <output data-testid="role">{auth.role ?? ""}</output>
    <button onClick={() => void auth.signIn({ username: "new-user", password: "secret" })}>Sign in</button>
    <button onClick={() => void auth.signOut().catch((error) => setFailure(error.message))}>Sign out</button>
    <output data-testid="logout-error">{failure ?? ""}</output>
    <button onClick={auth.retryBootstrap}>Retry session check</button>
  </div>;
}

function renderAuth() {
  return render(<AuthProvider><Harness /></AuthProvider>);
}

describe("mounted authentication state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateToken.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    mocks.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("validates the ambient cookie-backed session on startup", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(mocks.validateToken).toHaveBeenCalledTimes(1);
    expect(mocks.validateToken).toHaveBeenCalledWith();
    expect(screen.getByTestId("username")).toHaveTextContent("sam");
  });

  it("becomes anonymous on a terminal bootstrap 401", async () => {
    mocks.validateToken.mockRejectedValue(new ApiError({ kind: "backend", status: 401, message: "Expired", authExpired: true }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mocks.validateToken).toHaveBeenCalledTimes(1);
  });

  it("keeps backend-unavailable bootstrap distinct from anonymous", async () => {
    mocks.validateToken.mockRejectedValue(new ApiError({ kind: "backend", status: 503, message: "Unavailable", retryableTransport: true }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("boot-error"));
    expect(screen.getByRole("button", { name: "Retry session check" })).toBeVisible();
  });

  it("clears identity when the HTTP layer emits terminal authentication expiry", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await act(async () => { triggerAuthExpired(); });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("username")).toHaveTextContent("");
  });

  it("signs in with identity only and routes by role", async () => {
    mocks.login.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    mocks.login.mockResolvedValue({ username: "new-user", role: "CUSTOMER" });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByTestId("username")).toHaveTextContent("new-user"));
    expect(mocks.push).toHaveBeenCalledWith("/customer");
  });

  it("logs out through the cookie-backed API", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mocks.logout).toHaveBeenCalledWith();
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });

  it("preserves authenticated state when logout revocation is unconfirmed", async () => {
    mocks.logout.mockRejectedValue(new ApiError({ kind: "backend", status: 503, message: "Unavailable", retryableTransport: true }));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByTestId("logout-error")).toHaveTextContent("Unavailable"));
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });
});
