import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinancialForm } from "@/components/banking/FinancialForm";
import { invalidateCsrfToken, onAuthExpired } from "@/lib/api/http";

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ status: "authenticated" }) }));

const account = { accountId: "account-1", accountNumber: "100001", accountType: "SAVINGS", accountStatus: "ACTIVE", balance: "100.0000" };
const receipt = { journalEntryId: "journal-1", journalReference: "JR-1", amount: "10.0000" };
const history = [{ transactionId: "transaction-1", type: "DEPOSIT", amount: "10.0000" }];
type Reply = () => Response | Promise<Response>;

function reject(status: number, code: string, message = "Server response", headers?: HeadersInit): Response {
  return Response.json({ code, message }, { status, headers });
}

async function openForm(replies: Reply[], refreshFailure?: "balance" | "history", kind: "deposit" | "withdraw" = "deposit") {
  const writePath = `/api/v1/transactions/${kind}`;
  const fetchMock = vi.fn<(path: string, options: RequestInit) => Promise<Response>>(async (path) => {
    if (path === "/api/auth/csrf") return Response.json({ token: "a".repeat(43) });
    if (path === "/api/v1/accounts/my") return Response.json([account]);
    if (path === "/api/v1/accounts/account-1") return refreshFailure === "balance"
      ? reject(503, "ERR_UNAVAILABLE") : Response.json({ ...account, balance: "110.0000" });
    if (path === "/api/v1/accounts/account-1/transactions") return refreshFailure === "history"
      ? reject(503, "ERR_UNAVAILABLE") : Response.json(history);
    if (path === writePath) {
      const reply = replies.shift();
      if (reply) return reply();
    }
    throw new Error(`Unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<FinancialForm kind={kind} />);
  await waitFor(() => expect(screen.getByLabelText("Account")).toHaveValue(account.accountId));
  const input = screen.getByLabelText("Amount (decimal text)");
  const form = screen.getByTestId(`${kind}-form`);
  const writes = () => fetchMock.mock.calls
    .filter(([path]) => path === writePath)
    .map(([, options]) => ({
      key: new Headers(options.headers).get("Idempotency-Key"),
      body: JSON.parse(String(options.body))
    }));
  return { fetchMock, input, form, writes };
}

describe("money submission outcomes", () => {
  beforeEach(invalidateCsrfToken);
  afterEach(() => { vi.unstubAllGlobals(); });

  it("validates excess precision before sending a transaction", async () => {
    const { input, form, writes } = await openForm([]);
    fireEvent.change(input, { target: { value: "0.001" } });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent(/two decimal places/i);
    expect(writes()).toHaveLength(0);
  });

  it("blocks duplicate submissions in the same event batch and refreshes after success", async () => {
    let complete!: (response: Response) => void;
    const outcome = new Promise<Response>((resolve) => { complete = resolve; });
    const { input, form, writes, fetchMock } = await openForm([() => outcome]);
    fireEvent.change(input, { target: { value: " 010.00 " } });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      body: { accountId: account.accountId, amount: "010.00" }
    });
    expect(input).toBeDisabled();
    expect(screen.getByLabelText("Account")).toHaveTextContent("100.0000");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/accounts/account-1", expect.anything());
    await act(async () => complete(Response.json(receipt)));
    expect(await screen.findByTestId("transaction-receipt")).toHaveTextContent("JR-1");
    expect(await screen.findByLabelText("Refreshed server balances")).toHaveTextContent("110.0000");
    expect(screen.getByText(/DEPOSIT · 10\.0000/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Completed" })).toBeDisabled();
  });

  it.each([
    { name: "browser timeout", reply: () => { throw new DOMException("Timed out", "AbortError"); } },
    { name: "network failure", reply: () => { throw new TypeError("Failed to fetch"); } },
    { name: "BFF timeout", reply: () => reject(504, "BANKING_UPSTREAM_TIMEOUT") },
    { name: "BFF connection failure", reply: () => reject(502, "BANKING_UPSTREAM_UNAVAILABLE") },
    { name: "gateway failure without an error code", reply: () => new Response("Bad Gateway", { status: 502 }) },
    { name: "same key still processing in core", reply: () => reject(409, "ERR_IDEMPOTENCY_IN_PROGRESS") }
  ])("preserves payload and key after $name and waits for a manual retry", async ({ reply }) => {
    const { input, form, writes } = await openForm([reply, () => Response.json(receipt)]);
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(/may already have succeeded/i);
    expect(input).toBeDisabled();
    expect(input).toHaveValue("10.00");
    expect(writes()).toHaveLength(1);
    expect(screen.queryByTestId("transaction-receipt")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry same transaction" }));
    expect(await screen.findByTestId("transaction-receipt")).toHaveTextContent("JR-1");
    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(writes()[0]);
  });

  it("requires an intentional restart before submitting a different transaction after uncertainty", async () => {
    const { input, form, writes } = await openForm([
      () => reject(504, "BANKING_UPSTREAM_TIMEOUT"),
      () => Response.json(receipt)
    ]);
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(/may already have succeeded/i);
    fireEvent.click(screen.getByRole("button", { name: "Start a different transaction" }));
    expect(input).toBeEnabled();
    expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "11.25" } });
    expect(writes()).toHaveLength(1);
    fireEvent.submit(form);
    await screen.findByTestId("transaction-receipt");
    expect(writes()[1].key).not.toBe(writes()[0].key);
    expect(writes()[1].body.amount).toBe("11.25");
  });

  it.each([
    { status: 422, code: "ERR_INSUFFICIENT_FUNDS" },
    { status: 401, code: "AUTH", authExpired: true },
    { status: 403, code: "ERR_FORBIDDEN" },
    { status: 503, code: "ERR_TRANSACTION_TEMPORARILY_UNAVAILABLE" },
    { status: 504, code: "ERR_EXPLICIT_BACKEND_REJECTION" }
  ])("keeps explicit $status $code rejections distinct from uncertainty", async ({ status, code, authExpired }) => {
    const expired = vi.fn();
    const unsubscribe = onAuthExpired(expired);
    try {
      const { input, form, writes } = await openForm([() => reject(status, code, "Request rejected", authExpired ? { "X-Bank-Auth-Expired": "1" } : undefined)]);
      fireEvent.change(input, { target: { value: "10.00" } });
      fireEvent.submit(form);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Request rejected");
      expect(alert).not.toHaveTextContent(/may already have succeeded/i);
      expect(screen.getByTestId("idempotency-state")).toHaveTextContent("confirmed-failure");
      expect(input).toBeEnabled();
      expect(writes()).toHaveLength(1);
      expect(expired).toHaveBeenCalledTimes(authExpired ? 1 : 0);
    } finally {
      unsubscribe();
    }
  });

  it("allows correction and an intentional new submission after a definitive rejection", async () => {
    const { input, form, writes } = await openForm([
      () => reject(422, "ERR_INSUFFICIENT_FUNDS", "Insufficient funds"),
      () => Response.json(receipt)
    ]);
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient funds");
    fireEvent.change(input, { target: { value: "5.00" } });
    expect(writes()).toHaveLength(1);
    fireEvent.submit(form);
    await screen.findByTestId("transaction-receipt");
    expect(writes()[1].key).not.toBe(writes()[0].key);
    expect(writes()[1].body.amount).toBe("5.00");
  });

  it("keeps the original transaction uncertain if an attempted retry is denied", async () => {
    const { input, form, writes } = await openForm([
      () => reject(504, "BANKING_UPSTREAM_TIMEOUT"),
      () => reject(403, "ERR_FORBIDDEN", "Retry denied")
    ]);
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    await screen.findByRole("button", { name: "Retry same transaction" });
    fireEvent.click(screen.getByRole("button", { name: "Retry same transaction" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Retry denied");
    expect(alert).toHaveTextContent(/may already have succeeded/i);
    expect(writes()[1]).toEqual(writes()[0]);
  });

  it.each(["balance", "history"] as const)("keeps the receipt and successful refresh when %s refresh fails", async (failure) => {
    const { input, form, writes } = await openForm([() => Response.json(receipt)], failure);
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(/transaction succeeded.*could not be refreshed/i);
    expect(screen.getByTestId("transaction-receipt")).toHaveTextContent("JR-1");
    expect(screen.getByTestId("idempotency-state")).toHaveTextContent("succeeded");
    if (failure === "balance") expect(screen.getByText(/DEPOSIT · 10\.0000/)).toBeVisible();
    else expect(screen.getByLabelText("Refreshed server balances")).toHaveTextContent("110.0000");
    fireEvent.submit(form);
    expect(writes()).toHaveLength(1);
  });

  it("submits a withdrawal through its own endpoint and refreshes the source", async () => {
    const { input, form, writes, fetchMock } = await openForm([() => Response.json(receipt)], undefined, "withdraw");
    fireEvent.change(input, { target: { value: "10.00" } });
    fireEvent.submit(form);
    expect(await screen.findByTestId("transaction-receipt")).toHaveTextContent("JR-1");
    expect(await screen.findByLabelText("Refreshed server balances")).toHaveTextContent("110.0000");
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({ accountId: "account-1", amount: "10.00" });
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/accounts/account-1/transactions", expect.anything());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
