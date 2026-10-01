import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  validateToken: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  push: vi.fn(),
  replace: vi.fn()
}));

vi.mock("@/lib/api/auth", () => ({
  authApi: {
    validateToken: mocks.validateToken,
    refresh: mocks.refresh,
    logout: mocks.logout,
    login: mocks.login
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/customer"
}));

import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";

function Harness() {
  const auth = useAuth();
  return <div>
    <output data-testid="status">{auth.status}</output>
    <output data-testid="username">{auth.username ?? ""}</output>
    <output data-testid="role">{auth.role ?? ""}</output>
    <button onClick={() => void auth.refreshToken()}>Refresh session</button>
    <button onClick={() => void auth.signOut()}>Sign out</button>
  </div>;
}

function renderAuth() {
  return render(<AuthProvider><Harness /></AuthProvider>);
}

describe("mounted authentication state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("starts anonymous without reading a missing session as authenticated", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mocks.validateToken).not.toHaveBeenCalled();
  });

  it("validates a stored token on startup without automatic bootstrap refresh", async () => {
    window.localStorage.setItem("bank-web.jwt", "stored-jwt");
    mocks.validateToken.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(mocks.validateToken).toHaveBeenCalledWith("stored-jwt");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("username")).toHaveTextContent("sam");
  });

  it("clears an invalid startup token instead of replaying validation", async () => {
    window.localStorage.setItem("bank-web.jwt", "expired-jwt");
    mocks.validateToken.mockRejectedValue(new Error("expired"));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("bank-web.jwt")).toBeNull();
  });

  it("refreshes an authenticated session and stores the replacement token", async () => {
    window.localStorage.setItem("bank-web.jwt", "old-jwt");
    mocks.validateToken.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    mocks.refresh.mockResolvedValue({ token: "new-jwt" });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledWith("old-jwt", "sam"));
    expect(window.localStorage.getItem("bank-web.jwt")).toBe("new-jwt");
  });

  it("clears the session when refresh fails", async () => {
    window.localStorage.setItem("bank-web.jwt", "old-jwt");
    mocks.validateToken.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    mocks.refresh.mockRejectedValue(new Error("refresh failed"));
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(window.localStorage.getItem("bank-web.jwt")).toBeNull();
  });

  it("logs out through the backend then removes the browser token", async () => {
    window.localStorage.setItem("bank-web.jwt", "stored-jwt");
    mocks.validateToken.mockResolvedValue({ username: "sam", role: "CUSTOMER" });
    mocks.logout.mockResolvedValue(undefined);
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(mocks.logout).toHaveBeenCalledWith("stored-jwt");
    expect(window.localStorage.getItem("bank-web.jwt")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });
});
