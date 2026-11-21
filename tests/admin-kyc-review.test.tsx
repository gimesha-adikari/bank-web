import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/errors";
import type { KycCase } from "@/lib/api/contracts";

const mocks = vi.hoisted(() => ({ list: vi.fn(), checks: vi.fn(), decide: vi.fn(), file: vi.fn() }));

vi.mock("@/lib/api/kyc", () => ({ kycApi: { admin: { list: mocks.list, checks: mocks.checks, decide: mocks.decide }, file: mocks.file } }));

import { AdminKycReview } from "@/components/banking/AdminKycReview";

const pendingCase = {
  caseId: "case-pending", status: "PENDING", docFrontId: "doc-front", docBackId: "doc-back", selfieId: "selfie", addressId: "address",
  decisionReason: null, createdAt: "2026-03-01T10:00:00Z", updatedAt: "2026-03-01T10:00:00Z", reviewerId: null, decidedAt: null, reviewerNotes: null
} as const;
const underReviewCase = { ...pendingCase, caseId: "case-under-review", status: "UNDER_REVIEW" } as const;
const transitionFixtures = {
  PENDING: pendingCase,
  AUTO_REVIEW: { ...pendingCase, caseId: "case-auto-review", status: "AUTO_REVIEW" },
  UNDER_REVIEW: underReviewCase,
  NEEDS_MORE_INFO: { ...pendingCase, caseId: "case-needs-info", status: "NEEDS_MORE_INFO" },
  APPROVED: { ...pendingCase, caseId: "case-approved", status: "APPROVED" },
  REJECTED: { ...pendingCase, caseId: "case-rejected", status: "REJECTED" },
  SUPERSEDED: { ...pendingCase, caseId: "case-superseded", status: "SUPERSEDED" }
} as const;

beforeEach(() => {
  mocks.list.mockImplementation(async ({ status, page = 0, size = 20 } = {}) => {
    const item = transitionFixtures[status as keyof typeof transitionFixtures];
    const cases = item ? [item] : [];
    return { page, size, total: cases.length, content: cases };
  });
  mocks.checks.mockResolvedValue([{ id: "check-1", caseId: pendingCase.caseId, type: "FACE_MATCH", score: 0.91, passed: true, detailsJson: "private fixture", createdAt: "2026-03-01T11:00:00Z" }]);
  mocks.decide.mockImplementation(async (caseId, body) => ({ ...(caseId === underReviewCase.caseId ? underReviewCase : pendingCase), status: body.decision, decisionReason: body.reason ?? null }));
  mocks.file.mockResolvedValue({ blob: new Blob(["synthetic image"], { type: "image/png" }), contentDisposition: 'inline; filename="synthetic.png"' });
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:synthetic"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Admin KYC review", () => {
  it("loads the backend status-filtered queue and only offers a transition allowed from PENDING", async () => {
    render(<AdminKycReview />);
    expect(await screen.findByText(pendingCase.caseId)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pendingCase.caseId) }));
    expect(await screen.findByText("FACE_MATCH")).toBeInTheDocument();
    expect(screen.queryByText("private fixture")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request more information" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Approve case" })).not.toBeInTheDocument();
    expect(screen.queryByText(/applicant identity details/)).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith({ status: "PENDING", page: 0, size: 20 });
    expect(mocks.checks).toHaveBeenCalledWith(pendingCase.caseId);
  });

  it.each([
    ["AUTO_REVIEW", ["Approve case", "Reject case", "Request more information"]],
    ["UNDER_REVIEW", ["Approve case", "Reject case", "Request more information"]],
    ["NEEDS_MORE_INFO", ["Reject case"]],
    ["APPROVED", []],
    ["REJECTED", []],
    ["SUPERSEDED", []]
  ] as const)("offers only bank-core transitions for %s", async (status, actions) => {
    render(<AdminKycReview />);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: status } });
    const item = transitionFixtures[status];
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(item.caseId) }));
    await screen.findByText("FACE_MATCH");
    const actionNames: readonly string[] = actions;
    for (const action of ["Approve case", "Reject case", "Request more information"]) {
      if (actionNames.includes(action)) expect(await screen.findByRole("button", { name: action })).toBeEnabled();
      else expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("retrieves a protected document into a temporary preview and revokes the URL on close", async () => {
    render(<AdminKycReview />);
    await screen.findByText(pendingCase.caseId);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pendingCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "View ID front" }));
    expect(await screen.findByRole("img", { name: "ID front submitted for KYC" })).toHaveAttribute("src", "blob:synthetic");
    expect(mocks.file).toHaveBeenCalledWith("doc-front");
    fireEvent.click(screen.getByRole("button", { name: "Close document" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic"));
  });

  it("shows denied and unsupported document responses without exposing the file", async () => {
    mocks.file.mockRejectedValueOnce(new ApiError({ kind: "backend", status: 403, message: "Access denied" }));
    render(<AdminKycReview />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(pendingCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "View ID front" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/bank-core denied access/i);
    fireEvent.click(screen.getByRole("button", { name: "Close document" }));

    mocks.file.mockResolvedValueOnce({ blob: new Blob(["not an image"], { type: "application/pdf" }), contentDisposition: null });
    fireEvent.click(screen.getByRole("button", { name: "View ID front" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unsupported document format/i);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("requires a deliberate confirmation and posts the supported optional reason", async () => {
    render(<AdminKycReview />);
    await screen.findByText(pendingCase.caseId);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(pendingCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "Request more information" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Please provide a clearer address document." } });
    expect(mocks.decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));

    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(pendingCase.caseId, {
      decision: "NEEDS_MORE_INFO", reason: "Please provide a clearer address document."
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(/bank-core recorded the needs more information status/i);
  });

  it("prevents duplicate confirmation clicks while a decision is in flight", async () => {
    let finish: ((value: KycCase) => void) | undefined;
    mocks.decide.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<AdminKycReview />);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "UNDER_REVIEW" } });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(underReviewCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve case" }));
    const confirm = screen.getByRole("button", { name: "Confirm decision" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.decide).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.({ ...underReviewCase, status: "APPROVED" }); });
    await waitFor(() => expect(screen.getByText(/bank-core recorded the approved status/i)).toBeInTheDocument());
  });

  it("keeps a stale transition rejection definitive and refreshes current server data", async () => {
    mocks.decide.mockRejectedValueOnce(new ApiError({ kind: "backend", status: 400, code: "ERR_VALIDATION", message: "Invalid request" }));
    render(<AdminKycReview />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(pendingCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "Request more information" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/case has moved to a status that does not allow it/i);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Request more information" })).toBeEnabled();
  });

  it("reconciles an uncertain decision by reading current server state without resending", async () => {
    let status = "UNDER_REVIEW";
    mocks.list.mockImplementation(async ({ status: filter, page = 0, size = 20 } = {}) => {
      const current = { ...underReviewCase, status };
      const cases = filter === status ? [current] : [];
      return { page, size, total: cases.length, content: cases };
    });
    mocks.decide.mockImplementationOnce(async (_id, body) => {
      status = body.decision;
      throw new ApiError({ kind: "timeout", status: 504, code: "BANKING_UPSTREAM_TIMEOUT", message: "Timed out", retryableTransport: true });
    });
    render(<AdminKycReview />);
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "UNDER_REVIEW" } });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(underReviewCase.caseId) }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve case" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm decision" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/response was interrupted.*bank-core currently reports approved/i);
    expect(mocks.decide).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith({ status: "APPROVED", page: 0, size: 50 });
  });
});
