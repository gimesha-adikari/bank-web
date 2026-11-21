"use client";

import { useId, useRef, useState } from "react";
import type { KycDocumentType } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";
import { kycApi } from "@/lib/api/kyc";

const acceptedImages = ["image/jpeg", "image/png", "image/webp"];
const maxUploadBytes = 1024 * 1024;

function uploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sign in again to upload this document.";
    if (error.status === 403) return "You are not allowed to upload this document.";
    if (error.status === 413) return "Each file must be 1 MiB or smaller.";
    if (error.status === 415) return "Choose a JPEG, PNG, or WebP image.";
    if (error.status === 429) return "Daily upload limit reached. Try again later.";
    if (error.status === 400 || error.status === 422) return "Bank-core rejected this file. Choose another image.";
  }
  return "The upload could not be confirmed. Try uploading this file again.";
}

export function KycDocumentUpload({ type, label, disabled, onUploaded }: {
  type: KycDocumentType;
  label: string;
  disabled: boolean;
  onUploaded: (type: KycDocumentType, id?: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [file, setFile] = useState<File>();
  const [uploaded, setUploaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  function choose(candidate?: File) {
    setError(undefined);
    if (!candidate) return;
    setFile(undefined);
    setUploaded(false);
    onUploaded(type);
    if (!acceptedImages.includes(candidate.type)) setError("Choose a JPEG, PNG, or WebP image.");
    else if (candidate.size === 0) setError("Choose a file that is not empty.");
    else if (candidate.size > maxUploadBytes) setError("Each file must be 1 MiB or smaller.");
    else {
      setFile(candidate);
      return;
    }
    if (input.current) input.current.value = "";
  }

  async function upload() {
    if (!file || disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await kycApi.upload(file, type);
      if (!result?.id) throw new Error("Missing upload ID");
      onUploaded(type, result.id);
      setUploaded(true);
      setFile(undefined);
      if (input.current) input.current.value = "";
    } catch (failure) {
      setError(uploadError(failure));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 px-3 pb-3" disabled={disabled || pending}>
      <legend className="px-1 font-bold">{label}</legend>
      <div className="grid gap-2">
        <label className="sr-only" htmlFor={id}>{label}</label>
        <input id={id} ref={input} type="file" accept={acceptedImages.join(",")} className="w-full text-sm"
          aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => choose(event.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="button secondary" onClick={() => void upload()} disabled={!file}>
            {pending ? "Uploading…" : "Upload"}
          </button>
          {uploaded && <span role="status" className="text-sm font-semibold text-teal-800">Uploaded</span>}
        </div>
        {error && <p id={`${id}-error`} className="error-box text-sm" role="alert">{error}</p>}
      </div>
    </fieldset>
  );
}
