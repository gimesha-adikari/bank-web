"use client";

import { useEffect, useState } from "react";
import { customersApi } from "@/lib/api/customers";
import { ApiError } from "@/lib/api/errors";
import { kycApi } from "@/lib/api/kyc";

type Eligibility =
  | { state: "loading" | "eligible" | "missing-record" | "verification-needed" }
  | { state: "error"; message: string };

export function useAccountOpeningEligibility() {
  const [eligibility, setEligibility] = useState<Eligibility>({ state: "loading" });
  const [lookup, setLookup] = useState(0);

  useEffect(() => {
    let active = true;
    void customersApi.me().then(async (customer) => {
      if (!active) return;
      if (!customer) {
        setEligibility({ state: "missing-record" });
        return;
      }
      const latest = await kycApi.me();
      if (active) setEligibility({ state: latest?.status === "APPROVED" ? "eligible" : "verification-needed" });
    }).catch((failure: unknown) => {
      if (!active) return;
      const message = failure instanceof ApiError && failure.status === 403
        ? "You are not allowed to check account-opening eligibility."
        : "We could not check account-opening eligibility. Try again.";
      setEligibility({ state: "error", message });
    });
    return () => { active = false; };
  }, [lookup]);

  function recheckEligibility() {
    setEligibility({ state: "loading" });
    setLookup((previous) => previous + 1);
  }

  return { eligibility, recheckEligibility };
}
