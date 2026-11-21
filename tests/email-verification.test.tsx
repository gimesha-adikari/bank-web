import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { invalidateCsrfToken } from "@/lib/api/http";

const csrf = "a".repeat(43);
const email = "customer@example.test";
const registration = "/api/v1/auth/register";
const resend = "/api/v1/auth/resend-verification";

describe("registration and resend", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let resendResponse: () => Response | Promise<Response>;

  beforeEach(() => {
    invalidateCsrfToken();
    resendResponse = () => new Response("If an account exists, a verification email has been sent");
    fetchMock = vi.fn(async (path: string) => {
      if (path === "/api/auth/csrf") return Response.json({ token: csrf });
      if (path === registration) return new Response("User registered successfully", { status: 201 });
      if (path === resend) return resendResponse();
      throw new Error(`Unexpected API call: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function register() {
    const { container } = render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "test-customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic!1" } });
    fireEvent.submit(container.querySelector("form")!);
    await screen.findByRole("heading", { name: "Verify your email" });
    return screen.getByRole("button", { name: "Resend verification email" });
  }

  it("requires verification after signup, clears the password field, and leaves sign-in to the customer", async () => {
    await register();
    expect(screen.getByText(/verify your email before you can sign in/i)).toBeVisible();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue(email);
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(["/api/auth/csrf", registration]);
  });

  it("sends only the email in CSRF-protected JSON, blocks duplicate submits, and uses its own generic acknowledgement", async () => {
    let complete!: (response: Response) => void;
    resendResponse = () => new Promise((resolve) => { complete = resolve; });
    const button = await register();
    act(() => {
      fireEvent.submit(button.closest("form")!);
      fireEvent.submit(button.closest("form")!);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(resend, expect.anything()));
    expect(button).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([path]) => path === resend)).toHaveLength(1);
    const [, options] = fetchMock.mock.calls.find(([path]) => path === resend)! as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({ email });
    expect(new Headers(options.headers).get("x-csrf-token")).toBe(csrf);
    await act(async () => complete(new Response("Ignore any upstream acknowledgement text")));
    expect(await screen.findByText(/if verification is needed/i)).toBeVisible();
    expect(screen.queryByText(/ignore any upstream/i)).not.toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it.each([
    { failure: "validation", response: () => Response.json({ message: "Internal response detail" }, { status: 400 }), copy: /valid email address/i },
    { failure: "rate limit", response: () => new Response(null, { status: 429 }), copy: /wait.*try again/i },
    { failure: "network", response: () => { throw new TypeError("Internal network detail"); }, copy: /could not send.*try again/i }
  ])("allows recovery after $failure", async ({ response, copy }) => {
    resendResponse = response;
    const button = await register();
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(screen.queryByText(/internal .*detail/i)).not.toBeInTheDocument();
    expect(button).toBeEnabled();

    resendResponse = () => new Response("OK");
    fireEvent.click(button);
    expect(await screen.findByText(/if verification is needed/i)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
