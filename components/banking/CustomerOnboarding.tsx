"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import type { Customer, KycCase, KycCheck, KycDocumentType, KycStatus, KycSubmitRequest } from "@/lib/api/contracts";
import { customersApi } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/errors";
import { kycApi } from "@/lib/api/kyc";
import { CustomerRecordForm } from "./CustomerRecordForm";
import { KycDocumentUpload } from "./KycDocumentUpload";

const documents = [
  { type: "DOC_FRONT", label: "ID front" },
  { type: "DOC_BACK", label: "ID back" },
  { type: "SELFIE", label: "Selfie" },
  { type: "ADDRESS_PROOF", label: "Proof of address" }
] as const;

const statuses: Record<KycStatus, { label: string; description: string }> = {
  PENDING: { label: "Pending", description: "Bank-core received your documents. They are waiting for review." },
  AUTO_REVIEW: { label: "Automatic review", description: "Bank-core is running verification checks." },
  UNDER_REVIEW: { label: "Under review", description: "Your case is awaiting a reviewer’s decision." },
  NEEDS_MORE_INFO: {
    label: "More information needed",
    description: "Replacement documents cannot be submitted for this case through the current bank-core workflow. Contact the bank for help."
  },
  APPROVED: { label: "Approved", description: "Your identity is verified. You can now save your customer details." },
  REJECTED: { label: "Rejected", description: "This case was rejected. You can start a new verification with new uploads." },
  SUPERSEDED: { label: "Superseded", description: "This case is no longer active. You can start a new verification." }
};

type Documents = Partial<Record<KycDocumentType, string>>;
type Submission = { payload: KycSubmitRequest; key: string; previousCaseId: string | null };

function canStartOver(latest: KycCase) {
  return latest.status === "REJECTED" || latest.status === "SUPERSEDED";
}

function caseWasFound(latest: KycCase | null | undefined, submission: Submission) {
  return latest && (latest.caseId !== submission.previousCaseId || !canStartOver(latest));
}

function errorMessage(error: unknown, fallback: string, forbidden: string) {
  if (error instanceof ApiError && error.status === 403) return forbidden;
  return fallback;
}

async function fetchCase() {
  const value = await kycApi.me();
  if (value !== null && (!value?.caseId || !Object.hasOwn(statuses, value.status))) throw new Error("Invalid KYC case");
  return value;
}

export function CustomerOnboarding() {
  const [record, setRecord] = useState<Customer | null>();
  const [recordError, setRecordError] = useState<string>();
  const [latest, setLatest] = useState<KycCase | null>();
  const [caseError, setCaseError] = useState<string>();
  const [checks, setChecks] = useState<{ source: KycCase; values: KycCheck[] | null }>();
  const [uploads, setUploads] = useState<Documents>({});
  const [consent, setConsent] = useState(false);
  const [newDraftFor, setNewDraftFor] = useState<string>();
  const [uncertain, setUncertain] = useState<Submission>();
  const [acceptedCaseId, setAcceptedCaseId] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [working, setWorking] = useState<"refresh" | "submit">();
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const readCase = useCallback((isCurrent: () => boolean = () => true) => {
    return fetchCase().then((value) => {
      if (isCurrent()) {
        setLatest(value);
        setCaseError(undefined);
      }
      return value;
    }).catch((error: unknown) => {
      if (isCurrent()) setCaseError(errorMessage(error, "We could not load your verification. Try refreshing status.", "You are not allowed to view your verification."));
      return undefined;
    });
  }, []);

  const readRecord = useCallback((isCurrent: () => boolean = () => true) => {
    return customersApi.me().then((value) => {
      if (isCurrent()) {
        setRecord(value);
        setRecordError(undefined);
      }
    }).catch((error: unknown) => {
      if (isCurrent()) setRecordError(errorMessage(error, "We could not load your customer record. Try refreshing status.", "You are not allowed to view your customer record."));
    });
  }, []);

  useEffect(() => {
    let active = true;
    void readCase(() => active);
    void readRecord(() => active);
    return () => { active = false; };
  }, [readCase, readRecord]);

  useEffect(() => {
    if (!latest) return;
    let active = true;
    void kycApi.checks(latest.caseId).then((values) => {
      if (active) setChecks({ source: latest, values });
    }).catch(() => {
      if (active) setChecks({ source: latest, values: null });
    });
    return () => { active = false; };
  }, [latest]);

  function clearDraft() {
    setUploads({});
    setConsent(false);
    setUncertain(undefined);
    setNewDraftFor(undefined);
  }

  async function run(action: "refresh" | "submit", work: () => Promise<void>) {
    if (inFlight.current || saving) return;
    inFlight.current = true;
    setWorking(action);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setWorking(undefined);
    }
  }

  async function refresh() {
    await run("refresh", async () => {
      const [current] = await Promise.all([readCase(), readRecord()]);
      if (current && current.caseId === acceptedCaseId) setAcceptedCaseId(undefined);
      if (uncertain && caseWasFound(current, uncertain)) {
        clearDraft();
        setSubmitError(undefined);
      }
    });
  }

  async function postSubmission(submission: Submission) {
    setSubmitError(undefined);
    try {
      const response = await kycApi.submit(submission.payload, { idempotencyKey: submission.key });
      if (!response?.caseId) throw new Error("Submission response missing case ID");
      clearDraft();
      setAcceptedCaseId(response.caseId);
      const current = await readCase();
      if (current?.caseId === response.caseId) setAcceptedCaseId(undefined);
    } catch (error) {
      if (!(error instanceof ApiError) || error.retryableTransport || error.status >= 500) {
        setUncertain(submission);
        if (caseWasFound(await readCase(), submission)) clearDraft();
      } else {
        setSubmitError(errorMessage(error, "Bank-core did not accept this request. Check your uploads and consent, or refresh status.", "You are not allowed to submit verification."));
      }
    }
  }

  const replaceable = latest != null && canStartOver(latest);
  const showDraft = !acceptedCaseId && (latest === null || (replaceable && latest.caseId === newDraftFor));
  const hasDistinctUploads = documents.every(({ type }) => Boolean(uploads[type])) && new Set(Object.values(uploads)).size === 4;
  const canSubmit = showDraft && hasDistinctUploads && consent && !caseError && !working && !uncertain;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const { DOC_FRONT, DOC_BACK, SELFIE, ADDRESS_PROOF } = uploads;
    if (!DOC_FRONT || !DOC_BACK || !SELFIE || !ADDRESS_PROOF) return;
    await run("submit", () => postSubmission({
      payload: { docFrontId: DOC_FRONT, docBackId: DOC_BACK, selfieId: SELFIE, addressId: ADDRESS_PROOF, consent: true },
      key: crypto.randomUUID(),
      previousCaseId: latest?.caseId ?? null
    }));
  }

  async function retry() {
    if (!uncertain) return;
    await run("submit", async () => {
      const current = await readCase();
      if (current === undefined) return;
      if (caseWasFound(current, uncertain)) {
        clearDraft();
        setSubmitError(undefined);
        return;
      }
      await postSubmission(uncertain);
    });
  }

  const status = latest ? statuses[latest.status] : undefined;
  const currentChecks = checks?.source === latest ? checks?.values : undefined;
  const approved = latest?.status === "APPROVED" && !caseError;
  const completed = approved && record && !recordError;

  return (
    <>
      <SectionHeading title="Customer onboarding">
        <button type="button" className="button secondary" onClick={() => void refresh()} disabled={Boolean(working) || saving}>
          {working === "refresh" ? "Refreshing…" : "Refresh status"}
        </button>
      </SectionHeading>
      <div className="grid max-w-4xl gap-5">
        <section className="card grid gap-3">
          <h2 className="text-xl font-black">Identity verification</h2>
          {caseError && <p className="error-box" role="alert">{caseError}</p>}
          {latest === undefined && !caseError && <p className="muted" role="status">Loading verification status…</p>}
          {latest === null && !caseError && !acceptedCaseId && <p className="muted">No verification case yet.</p>}
          {status && <div className="grid gap-2">
            <span className="text-sm muted">{caseError ? "Last loaded status" : "Case status"}</span>
            <p className="text-lg font-black" role="status">{status.label}</p>
            {!caseError && <p className="muted">{status.description}</p>}
          </div>}
          {latest?.decisionReason && (latest.status === "REJECTED" || latest.status === "NEEDS_MORE_INFO") && <p>{latest.decisionReason}</p>}
          {latest?.status === "UNDER_REVIEW" && (latest.reviewerNotes === "ml_unavailable" || latest.reviewerNotes === "ml_response_empty") &&
            <p className="muted">Automatic review is unavailable. Your case remains under review.</p>}
          {latest && <div className="grid gap-2 border-t border-slate-200 pt-3">
            <h3 className="font-bold">Verification checks</h3>
            {currentChecks === undefined && <p className="muted" role="status">Loading checks…</p>}
            {currentChecks === null && <p className="muted">Checks could not be loaded. Refresh status to try again.</p>}
            {currentChecks?.length === 0 && <p className="muted">No checks are available yet.</p>}
            {currentChecks && currentChecks.length > 0 && <ul className="grid gap-1 text-sm">
              {currentChecks.map((check, index) => <li className="flex flex-wrap gap-x-3" key={`${check.type}-${index}`}>
                <span className="font-bold">{check.type === "ERROR" ? "Automatic check unavailable" : check.type.replaceAll("_", " ")}</span>
                {check.type !== "ERROR" && <span>{check.passed === null ? "No result" : check.passed ? "Passed" : "Did not pass"}</span>}
                {check.type !== "ERROR" && check.score !== null && Number.isFinite(check.score) && <span>Score {check.score}</span>}
              </li>)}
            </ul>}
          </div>}
          {acceptedCaseId && <p className="success-box" role="status">Bank-core accepted your submission. Refresh status to load the case.</p>}
          {replaceable && !showDraft && !acceptedCaseId && !caseError && <button type="button" className="button w-fit" disabled={Boolean(working)}
            onClick={() => {
              clearDraft();
              setSubmitError(undefined);
              setNewDraftFor(latest.caseId);
            }}>Start a new verification</button>}
        </section>

        {showDraft && <form method="post" className="card grid gap-4" onSubmit={(event) => void submit(event)}>
          <h2 className="text-xl font-black">Verification documents</h2>
          <p className="muted">Upload four separate images. JPEG, PNG, and WebP files up to 1 MiB each are accepted.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {documents.map(({ type, label }) => <KycDocumentUpload key={type} type={type} label={label}
              disabled={Boolean(working || caseError || uncertain)} onUploaded={(field, id) => setUploads((current) => ({ ...current, [field]: id }))} />)}
          </div>
          {documents.every(({ type }) => uploads[type]) && !hasDistinctUploads && <p className="error-box" role="alert">Each document must have a different upload ID.</p>}
          <label className="flex items-start gap-2 font-semibold">
            <input type="checkbox" className="mt-1" checked={consent} disabled={Boolean(working || caseError || uncertain)}
              onChange={(event) => setConsent(event.target.checked)} required />
            I consent to the bank processing these documents to verify my identity.
          </label>
          {submitError && <p className="error-box" role="alert">{submitError}</p>}
          {uncertain ? <>
            <p className="error-box" role="alert">Bank-core may already have received your verification. Check and retry to look for a case before reusing the same request.</p>
            <button type="button" className="button w-fit" disabled={Boolean(working)} onClick={() => void retry()}>
              {working === "submit" ? "Checking submission…" : "Check and retry same submission"}
            </button>
          </> : <button className="button w-fit" type="submit" disabled={!canSubmit}>
            {working === "submit" ? "Submitting…" : "Submit verification"}
          </button>}
        </form>}

        {recordError && <p className="error-box" role="alert">{recordError}</p>}
        {record === null && !approved && !recordError && <p className="card muted">No customer record yet. You can save your details after verification is approved.</p>}
        {record && !approved && <p className="card muted">Your customer record is on file. Current KYC approval is required to update it here.</p>}
        {approved && record !== undefined && !recordError && <CustomerRecordForm record={record} disabled={Boolean(working)}
          onRecord={setRecord} onSavingChange={setSaving} />}
        {completed && <section className="card grid gap-3">
          <h2 className="text-xl font-black">Onboarding complete</h2>
          <p className="muted">Your verification is approved and your customer record is on file.</p>
          <Link href="/customer" className="button w-fit">Go to dashboard</Link>
        </section>}
      </div>
    </>
  );
}
