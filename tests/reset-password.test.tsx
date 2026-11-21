import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordView } from "@/components/auth/ResetPasswordView";
import { invalidateCsrfToken } from "@/lib/api/http";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams({ token: "mail-link-token" })
}));

const password = "FixturePass1!";

function renderReset(response: Response) {
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    if (url === "/api/auth/csrf") return Response.json({ token: "a".repeat(43) });
    if (options.method === "GET") return new Response("Valid Reset Token!");
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ResetPasswordView />);
  return { fetchMock, user: userEvent.setup() };
}

async function submitReset(user: ReturnType<typeof userEvent.setup>, confirmation = password) {
  await user.type(await screen.findByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("password reset page", () => {
  beforeEach(invalidateCsrfToken);
  afterEach(() => vi.unstubAllGlobals());

  it("shows the form without looking up the reset token by GET", () => {
    const { fetchMock } = renderReset(new Response("Password has been reset"));

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows success after POST and removes the spent form", async () => {
    const { user } = renderReset(new Response("Password has been reset"));
    await submitReset(user);

    expect(await screen.findByRole("status")).toHaveTextContent("Password reset successfully");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
  });

  it("offers a fresh link after a failed POST even when core sends a generic error", async () => {
    const { user } = renderReset(Response.json({ error: "Internal Server Error" }, { status: 500 }));
    await submitReset(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired|already used/i);
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/reset-password");
    expect(screen.getByRole("button", { name: "Reset password" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("rejects mismatched passwords locally without sending a request", async () => {
    const { fetchMock, user } = renderReset(new Response("Password has been reset"));
    await submitReset(user, "DifferentPass2!");

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords must match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the form editable after core rejects the new password", async () => {
    const { user } = renderReset(Response.json({ code: "ERR_VALIDATION", message: "Invalid request" }, { status: 400 }));
    await submitReset(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/check your new password/i);
    expect(screen.getByLabelText("New password")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeEnabled();
  });
});
