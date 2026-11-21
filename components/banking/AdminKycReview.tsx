"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { ApiError } from "@/lib/api/errors";
import type { KycAdminCheck, KycCase, KycDecisionRequest, KycReviewPage, KycStatus } from "@/lib/api/contracts";
import { kycApi } from "@/lib/api/kyc";
import { AdminKycDocumentPreview } from "./AdminKycDocumentPreview";

const statuses: readonly KycStatus[] = ["PENDING", "AUTO_REVIEW", "UNDER_REVIEW", "NEEDS_MORE_INFO", "APPROVED", "REJECTED", "SUPERSEDED"];
const statusLabels: Record<KycStatus, string> = {
  PENDING: "Pending",
  AUTO_REVIEW: "Automatic review",
  UNDER_REVIEW: "Under review",
  NEEDS_MORE_INFO: "Needs more information",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded"
};
const pageSize = 20;
const checkStatuses: Record<KycStatus, readonly KycDecisionRequest["decision"][]> = {
  PENDING: ["NEEDS_MORE_INFO"],
  AUTO_REVIEW: ["APPROVED", "REJECTED", "NEEDS_MORE_INFO"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "NEEDS_MORE_INFO"],
  NEEDS_MORE_INFO: ["REJECTED"],
  APPROVED: [],
  REJECTED: [],
  SUPERSEDED: []
};
const decisionLabels: Record<KycDecisionRequest["decision"], string> = {
  APPROVED: "Approve case",
  REJECTED: "Reject case",
  NEEDS_MORE_INFO: "Request more information"
};
const documentFields = [
  { key: "docFrontId", label: "ID front" },
  { key: "docBackId", label: "ID back" },
  { key: "selfieId", label: "Selfie" },
  { key: "addressId", label: "Address proof" }
] as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function queueError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Your Admin session has expired. Sign in again to review KYC cases.";
  if (error instanceof ApiError && error.status === 403) return "Your role is not permitted to review KYC cases.";
  if (error instanceof ApiError && error.status === 404) return "The KYC review endpoint or requested case was not found.";
  return "The KYC review queue could not be loaded from bank-core.";
}

function decisionError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Bank-core returned an unexpected response. Refresh the case before deciding again.";
  if (error.status === 401) return "Your Admin session has expired. Sign in again before continuing.";
  if (error.status === 403) return "Your role is not permitted to make KYC decisions.";
  if (error.status === 404) return "This case is no longer available. Refresh the queue and select a current case.";
  if (error.status === 400 || error.status === 422) return "Bank-core rejected this decision, likely because the case has moved to a status that does not allow it. Refresh the case before choosing again.";
  if (error.status === 409) return "Another review action changed this case. Refresh the case before choosing again.";
  if (error.status === 429) return "Bank-core is limiting review requests. Wait briefly, then refresh the case before deciding again.";
  if (error.status >= 500) return "Bank-core could not complete the decision request. Refresh the case state before deciding again.";
  return "Bank-core rejected the decision request. Refresh the case state and try an allowed action.";
}

function isUncertainDecision(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.retryableTransport || error.kind === "network" || error.kind === "timeout") return true;
  return (error.status === 502 && error.code === "BANKING_UPSTREAM_UNAVAILABLE")
    || (error.status === 504 && error.code === "BANKING_UPSTREAM_TIMEOUT");
}

function statusCanMoveTo(from: KycStatus, to: KycDecisionRequest["decision"]): boolean {
  return checkStatuses[from].includes(to);
}

async function findCurrentCase(caseId: string): Promise<KycCase | null> {
  // The backend has no single-case admin detail route. Search its supported status queues and pages.
  for (const status of statuses) {
    let page = 0;
    let lastPage = 0;
    do {
      const result = await kycApi.admin.list({ status, page, size: 50 });
      const found = result.content.find((item) => item.caseId === caseId);
      if (found) return found;
      const total = Number(result.total);
      lastPage = Number.isFinite(total) && result.size > 0 ? Math.ceil(total / result.size) - 1 : page;
      page += 1;
    } while (page <= lastPage);
  }
  return null;
}

export function AdminKycReview() {
  const [filter, setFilter] = useState<KycStatus>("PENDING");
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [queue, setQueue] = useState<KycReviewPage>();
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueFailure, setQueueFailure] = useState<string>();
  const [selected, setSelected] = useState<KycCase>();
  const [checks, setChecks] = useState<{ caseId: string; values: KycAdminCheck[] }>();
  const [checksFailure, setChecksFailure] = useState<string>();
  const [checksLoading, setChecksLoading] = useState(false);
  const [checksReload, setChecksReload] = useState(0);
  const [activeDocument, setActiveDocument] = useState<{ id: string; label: string }>();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<KycDecisionRequest["decision"]>();
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionFailure, setDecisionFailure] = useState<string>();
  const [decisionNotice, setDecisionNotice] = useState<string>();
  const [reconciliationWarning, setReconciliationWarning] = useState<string>();
  const [reconciliationCase, setReconciliationCase] = useState<KycCase>();
  const decisionInFlight = useRef(false);
  const selectedCaseId = selected?.caseId;

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- expose loading state for initial and explicit queue refreshes.
    setQueueLoading(true);
    setQueueFailure(undefined);
    void kycApi.admin.list({ status: filter, page, size: pageSize }).then((result) => {
      if (!active) return;
      setQueue(result);
      setSelected((current) => current ? result.content.find((item) => item.caseId === current.caseId) ?? current : current);
    }).catch((error: unknown) => {
      if (active) setQueueFailure(queueError(error));
    }).finally(() => {
      if (active) setQueueLoading(false);
    });
    return () => { active = false; };
  }, [filter, page, reload]);

  useEffect(() => {
    if (!selectedCaseId) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset check state when selecting or explicitly refreshing a case.
    setChecksLoading(true);
    setChecksFailure(undefined);
    void kycApi.admin.checks(selectedCaseId).then((values) => {
      if (active) setChecks({ caseId: selectedCaseId, values });
    }).catch((error: unknown) => {
      if (active) setChecksFailure(queueError(error));
    }).finally(() => {
      if (active) setChecksLoading(false);
    });
    return () => { active = false; };
  }, [selectedCaseId, checksReload]);

  const refresh = useCallback(async () => {
    setReload((value) => value + 1);
    if (selected) setChecksReload((value) => value + 1);
    if (!reconciliationCase) return;

    setDecisionPending(true);
    try {
      const current = await findCurrentCase(reconciliationCase.caseId);
      if (current) {
        setSelected(current);
        setDecisionNotice(`The decision response was interrupted. Bank-core currently reports ${statusLabels[current.status]}. No decision was resent.`);
        setReconciliationWarning(undefined);
        setReconciliationCase(undefined);
        setChecksReload((value) => value + 1);
      } else {
        setReconciliationWarning("Bank-core did not return this case from any status queue. The decision outcome is still unconfirmed. Do not resubmit; verify the case with another Admin or contact support.");
      }
    } catch {
      setReconciliationWarning("The decision outcome is still unconfirmed because the current case could not be retrieved. Do not resubmit; refresh the queue or verify the case with another Admin.");
    } finally {
      setDecisionPending(false);
    }
  }, [selected, reconciliationCase]);

  function startDecision(decision: KycDecisionRequest["decision"]) {
    if (!selected || !statusCanMoveTo(selected.status, decision) || decisionPending) return;
    setDecisionFailure(undefined);
    setDecisionNotice(undefined);
    setConfirmation(decision);
  }

  async function recoverUncertainDecision(caseAtSubmission: KycCase) {
    setReconciliationCase(caseAtSubmission);
    setReconciliationWarning("The decision response was interrupted. Checking the current bank-core case state; no decision will be resent automatically.");
    try {
      const current = await findCurrentCase(caseAtSubmission.caseId);
      if (current) {
        setSelected(current);
        setDecisionNotice(`The decision response was interrupted. Bank-core currently reports ${statusLabels[current.status]}. No decision was resent.`);
        setReconciliationWarning(undefined);
        setReconciliationCase(undefined);
        setReload((value) => value + 1);
        setChecksReload((value) => value + 1);
      } else {
        setReconciliationWarning("Bank-core did not return this case from any status queue. The decision outcome is still unconfirmed. Do not resubmit; verify the case with another Admin or contact support.");
      }
    } catch {
      setReconciliationWarning("The decision outcome is still unconfirmed because the current case could not be retrieved. Do not resubmit; refresh the queue or verify the case with another Admin.");
    }
  }

  async function submitDecision() {
    if (!selected || !confirmation || decisionInFlight.current) return;
    decisionInFlight.current = true;
    setDecisionPending(true);
    setDecisionFailure(undefined);
    setDecisionNotice(undefined);
    try {
      const body: KycDecisionRequest = { decision: confirmation };
      const note = reason.trim();
      if (note) body.reason = note;
      const result = await kycApi.admin.decide(selected.caseId, body);
      if (result.caseId !== selected.caseId || !statuses.includes(result.status)) throw new Error("Unexpected decision response");
      setSelected(result);
      setReason("");
      setConfirmation(undefined);
      setDecisionNotice(`Bank-core recorded the ${statusLabels[result.status].toLowerCase()} status. The queue and checks are being refreshed.`);
      setReload((value) => value + 1);
      setChecksReload((value) => value + 1);
    } catch (error) {
      setConfirmation(undefined);
      if (isUncertainDecision(error) || !(error instanceof ApiError)) {
        await recoverUncertainDecision(selected);
      } else {
        setDecisionFailure(decisionError(error));
        setReload((value) => value + 1);
        setChecksReload((value) => value + 1);
      }
    } finally {
      decisionInFlight.current = false;
      setDecisionPending(false);
    }
  }

  const total = Number(queue?.total ?? 0);
  const lastPage = queue?.size ? Math.max(0, Math.ceil(total / queue.size) - 1) : 0;
  const currentChecks = selected && checks?.caseId === selected.caseId ? checks.values : undefined;

  return <>
    <SectionHeading eyebrow="Administrator workspace" title="KYC review">
      <button type="button" className="button secondary" onClick={() => void refresh()} disabled={queueLoading || decisionPending}>
        {decisionPending && reconciliationCase ? "Checking case status…" : queueLoading ? "Refreshing…" : "Refresh queue"}
      </button>
    </SectionHeading>
    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="card grid content-start gap-4" aria-label="KYC case queue">
        <div>
          <h2 className="text-xl font-black">Submitted cases</h2>
          <p className="mt-1 muted">Bank-core supports status filtering and pagination. Applicant name and contact details are not returned by this endpoint.</p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="kyc-status-filter" className="font-semibold">Filter by status</label>
          <select id="kyc-status-filter" className="field" value={filter} onChange={(event) => { setFilter(event.target.value as KycStatus); setPage(0); setSelected(undefined); setActiveDocument(undefined); setConfirmation(undefined); }}>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </div>
        {queueFailure && <div className="error-box grid gap-3" role="alert"><p>{queueFailure}</p><button className="button secondary w-fit" type="button" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
        {queueLoading && <p className="muted" role="status">Loading KYC cases from bank-core…</p>}
        {!queueLoading && !queueFailure && queue?.content.length === 0 && <p className="muted" role="status">No cases are currently returned for {statusLabels[filter].toLowerCase()}.</p>}
        {!queueLoading && !queueFailure && queue && queue.content.length > 0 && <ul className="grid gap-2" aria-label="KYC cases">
          {queue.content.map((item) => <li key={item.caseId}>
            <button type="button" className={`w-full rounded-lg border p-3 text-left hover:border-teal-700 ${selected?.caseId === item.caseId ? "border-teal-700 bg-teal-50" : "border-slate-200"}`} aria-pressed={selected?.caseId === item.caseId} onClick={() => { setSelected(item); setActiveDocument(undefined); setConfirmation(undefined); setDecisionFailure(undefined); setDecisionNotice(undefined); }}>
              <span className="block break-all font-mono text-sm font-bold">{item.caseId}</span>
              <span className="mt-1 block text-sm">{statusLabels[item.status]}</span>
              <span className="mt-1 block text-xs muted">Submitted {formatDate(item.createdAt)}</span>
            </button>
          </li>)}
        </ul>}
        {queue && !queueFailure && <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-sm muted">{total} case{total === 1 ? "" : "s"} · page {page + 1} of {lastPage + 1}</span>
          <div className="flex gap-2">
            <button type="button" className="button ghost" disabled={page === 0 || queueLoading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
            <button type="button" className="button ghost" disabled={page >= lastPage || queueLoading} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>}
      </section>

      <section className="grid content-start gap-5" aria-label="KYC case review">
        {!selected && <p className="card muted">Select a case to inspect its documents and recorded verification checks.</p>}
        {selected && <>
          <section className="card grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-sm font-bold uppercase tracking-wide text-teal-700">Selected case</p><h2 className="mt-1 break-all font-mono text-xl font-black">{selected.caseId}</h2></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">{statusLabels[selected.status]}</span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm muted">Submitted</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              <div><dt className="text-sm muted">Last updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div>
              {selected.decidedAt && <div><dt className="text-sm muted">Decision recorded</dt><dd>{formatDate(selected.decidedAt)}</dd></div>}
              {selected.decisionReason && <div className="sm:col-span-2"><dt className="text-sm muted">Recorded decision reason</dt><dd className="whitespace-pre-wrap">{selected.decisionReason}</dd></div>}
            </dl>
            <p className="text-sm muted">This endpoint does not return applicant identity details. The case ID and submitted files are the available review context.</p>
            {reconciliationWarning && <p className="error-box" role="alert">{reconciliationWarning}</p>}
            {decisionNotice && <p className="success-box" role="status">{decisionNotice}</p>}
            {decisionFailure && <p className="error-box" role="alert">{decisionFailure}</p>}
          </section>

          <section className="card grid gap-3" aria-label="Submitted documents">
            <div><h3 className="text-lg font-bold">Submitted documents</h3><p className="text-sm muted">Files are retrieved from the protected bank-core document endpoint and held in a temporary preview only.</p></div>
            <div className="flex flex-wrap gap-2">
              {documentFields.map(({ key, label }) => {
                const id = selected[key];
                return id
                  ? <button key={key} type="button" className="button secondary" disabled={decisionPending} onClick={() => setActiveDocument({ id, label })}>View {label}</button>
                  : <span key={key} className="muted text-sm">{label}: not supplied</span>;
              })}
            </div>
            {activeDocument && <AdminKycDocumentPreview key={`${selected.caseId}:${activeDocument.id}`} {...activeDocument} onClose={() => setActiveDocument(undefined)} />}
          </section>

          <section className="card grid gap-3" aria-label="Automated verification checks">
            <div><h3 className="text-lg font-bold">Recorded automated checks</h3><p className="text-sm muted">These check results are evidence from automated processing and do not constitute the final Admin decision. Detailed check JSON is not displayed.</p></div>
            {checksLoading && <p className="muted" role="status">Loading checks…</p>}
            {checksFailure && <div className="grid gap-2"><p className="error-box" role="alert">{checksFailure}</p><button type="button" className="button secondary w-fit" onClick={() => setChecksReload((value) => value + 1)}>Reload checks</button></div>}
            {!checksLoading && !checksFailure && currentChecks?.length === 0 && <p className="muted">No verification checks were returned for this case.</p>}
            {!checksLoading && !checksFailure && currentChecks && currentChecks.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">
              {currentChecks.map((check) => <li key={check.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-bold">{check.type}</p>
                <p className="text-sm">Result: {check.passed === true ? "Passed" : check.passed === false ? "Did not pass" : "Not reported"}</p>
                <p className="text-sm">Score: {check.score === null ? "Not reported" : `${(check.score * 100).toFixed(1)}%`}</p>
                <p className="text-xs muted">Recorded {formatDate(check.createdAt)}</p>
              </li>)}
            </ul>}
          </section>

          <section className="card grid gap-3" aria-label="Admin case decision">
            <div><h3 className="text-lg font-bold">Admin decision</h3><p className="text-sm muted">Available actions follow bank-core’s current case transition rules. A stale decision is rejected by bank-core.</p></div>
            {checkStatuses[selected.status].length === 0 && <p className="muted">No further Admin decision is allowed for this case status.</p>}
            {checkStatuses[selected.status].length > 0 && !confirmation && <div className="flex flex-wrap gap-2">
              {checkStatuses[selected.status].map((decision) => <button key={decision} type="button" className={decision === "REJECTED" ? "button danger" : "button secondary"} disabled={decisionPending || Boolean(reconciliationWarning)} onClick={() => startDecision(decision)}>{decisionLabels[decision]}</button>)}
            </div>}
            {confirmation && <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Confirm KYC decision">
              <p className="font-bold">Confirm: {decisionLabels[confirmation]}?</p>
              <p className="text-sm">This sends a decision to bank-core for case {selected.caseId}. Bank-core remains authoritative for the final status.</p>
              <label htmlFor="kyc-decision-reason" className="font-semibold">Reason (optional)</label>
              <textarea id="kyc-decision-reason" className="field min-h-24" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby="kyc-decision-reason-hint" />
              <p id="kyc-decision-reason-hint" className="text-xs muted">Up to 500 characters. Bank-core accepts an optional reason.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="button" disabled={decisionPending || !statusCanMoveTo(selected.status, confirmation)} onClick={() => void submitDecision()}>{decisionPending ? "Submitting…" : "Confirm decision"}</button>
                <button type="button" className="button ghost" disabled={decisionPending} onClick={() => setConfirmation(undefined)}>Cancel</button>
              </div>
            </div>}
          </section>
        </>}
      </section>
    </div>
  </>;
}
