"use client";

import { useEffect, useState } from "react";
import { kycApi } from "@/lib/api/kyc";
import { ApiError } from "@/lib/api/errors";

const supportedPreviewTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function documentFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) return "Your Admin session has expired. Sign in again to view this document.";
  if (error instanceof ApiError && error.status === 403) return "Bank-core denied access to this document.";
  if (error instanceof ApiError && error.status === 404) return "This document is no longer available in bank-core.";
  return "The document could not be retrieved. Refresh the case and try again.";
}

export function AdminKycDocumentPreview({ id, label, onClose }: Readonly<{ id: string; label: string; onClose: () => void }>) {
  const [preview, setPreview] = useState<{ url: string; type: string }>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    void kycApi.file(id).then(({ blob }) => {
      if (!active) return;
      const contentType = blob.type.toLowerCase().split(";", 1)[0];
      if (!supportedPreviewTypes.has(contentType)) {
        setError("Bank-core returned an unsupported document format. Only submitted JPEG, PNG and WebP images can be previewed here.");
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, type: contentType });
    }).catch((failure: unknown) => {
      if (active) setError(documentFailure(failure));
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return <section className="card grid gap-3" aria-label={`${label} preview`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-bold">{label}</h3>
      <button type="button" className="button ghost" onClick={onClose}>Close document</button>
    </div>
    {!preview && !error && <p role="status" className="muted">Retrieving the protected document from bank-core…</p>}
    {error && <p role="alert" className="error-box">{error}</p>}
    {/* eslint-disable-next-line @next/next/no-img-element -- the source is a short-lived protected document blob, not an optimizable public asset. */}
    {preview && <img src={preview.url} alt={`${label} submitted for KYC`} referrerPolicy="no-referrer" className="max-h-[70vh] max-w-full justify-self-start rounded border border-slate-200 object-contain" />}
  </section>;
}
