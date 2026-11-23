"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import type { TellerEmployee, TellerGender, TellerRequest, TellerUserDirectoryEntry } from "@/lib/api/contracts";
import { tellersApi } from "@/lib/api/tellers";
import { SectionHeading } from "@/components/layout/ProtectedLayout";

type FormMode = "create" | "edit" | null;
type TellerForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  gender: string;
  dateOfBirth: string;
  department: string;
};
type WriteAttempt =
  | { operation: "create"; userId: string; body: TellerRequest }
  | { operation: "update"; userId: string; body: TellerRequest }
  | { operation: "remove"; userId: string; email: string };

const EMPTY_FORM: TellerForm = {
  email: "", firstName: "", lastName: "", phone: "", address: "", gender: "", dateOfBirth: "", department: ""
};
const genders: readonly TellerGender[] = ["MALE", "FEMALE", "OTHER"];

function employeeName(employee: TellerEmployee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Unnamed Teller";
}

function userName(user: TellerUserDirectoryEntry): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formFromEmployee(employee: TellerEmployee): TellerForm {
  return {
    email: employee.email,
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    address: employee.address,
    gender: employee.gender ?? "",
    dateOfBirth: employee.dateOfBirth ?? "",
    department: employee.department ?? ""
  };
}

function formFromUser(user: TellerUserDirectoryEntry): TellerForm {
  return {
    ...EMPTY_FORM,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.mobileNumber ?? "",
    address: user.address ?? ""
  };
}

function localYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validationMessage(form: TellerForm): string | null {
  if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid Teller email address.";
  if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.address.trim()) return "First name, last name, phone, and address are required.";
  if (form.address.trim().length > 255) return "Address must be 255 characters or fewer.";
  if (!genders.includes(form.gender as TellerGender)) return "Select a supported gender value.";
  if (!form.dateOfBirth || form.dateOfBirth >= localToday()) return "Date of birth must be before today.";
  if (form.email.length > 150 || form.firstName.length > 100 || form.lastName.length > 100 || form.phone.length > 20 || form.department.length > 100) {
    return "One or more fields exceed the supported storage length.";
  }
  return null;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function requestFromForm(form: TellerForm): TellerRequest {
  const request: TellerRequest = {
    email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(),
    phone: form.phone.trim(), address: form.address.trim(), gender: form.gender as TellerGender,
    dateOfBirth: form.dateOfBirth
  };
  const department = form.department.trim();
  if (department) request.department = department;
  return request;
}

function requestError(error: unknown, action: string): string {
  if (!(error instanceof ApiError)) return `The ${action} result could not be confirmed. Check the current Teller state before continuing.`;
  if (error.status === 401 || error.authExpired) return "Your Manager session has expired. Sign in again before continuing.";
  if (error.status === 403) return "Bank-core does not permit your role to manage Teller assignments.";
  if (error.status === 404) return "The linked user or Teller record was not found. Refresh the directory and try again.";
  if (error.status === 409) return "Bank-core rejected this change because the email or user assignment conflicts with an existing record.";
  if (error.status === 400 || error.status === 422) return "Bank-core rejected one or more Teller profile fields. Review the values and correct the highlighted fields.";
  if (error.status === 429) return "Bank-core is limiting requests. Wait, then refresh the directory before continuing.";
  if (error.status >= 500) return `Bank-core returned an uncertain response for the ${action}. Current Teller state is being checked; do not submit it again.`;
  return `Bank-core rejected the ${action}. Refresh the directory before continuing.`;
}

function attemptMessage(operation: WriteAttempt["operation"]): string {
  if (operation === "create") return "Teller assignment was confirmed by bank-core.";
  if (operation === "update") return "Teller profile update was confirmed by bank-core.";
  return "Teller removal was confirmed by bank-core.";
}

function sameProfile(employee: TellerEmployee, request: TellerRequest): boolean {
  return employee.status === "ACTIVE"
    && employee.email === request.email
    && employee.firstName === request.firstName
    && employee.lastName === request.lastName
    && employee.phone === request.phone
    && employee.address === request.address
    && employee.gender === request.gender
    && employee.dateOfBirth === request.dateOfBirth
    && (employee.department ?? "") === (request.department ?? "");
}

export function ManagerTellerDirectory() {
  const [employees, setEmployees] = useState<TellerEmployee[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string>();
  const [users, setUsers] = useState<TellerUserDirectoryEntry[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string>();
  const [userSearch, setUserSearch] = useState("");
  const [mode, setMode] = useState<FormMode>(null);
  const [formUserId, setFormUserId] = useState("");
  const [form, setForm] = useState<TellerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string>();
  const [formFieldErrors, setFormFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [writePending, setWritePending] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [unresolved, setUnresolved] = useState<WriteAttempt>();
  const writeInFlight = useRef(false);
  const selected = employees.find((employee) => employee.email === selectedEmail);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set the pending view for initial and manual directory loads.
    setDirectoryLoading(true);
    setDirectoryError(undefined);
    void tellersApi.list().then((result) => {
      if (!active) return;
      setEmployees(result);
      setSelectedEmail((current) => current && result.some((employee) => employee.email === current) ? current : undefined);
    }).catch((error: unknown) => {
      if (active) {
        setDirectoryError(error instanceof ApiError && error.status === 401
          ? "Your Manager session has expired. Sign in again to manage Teller assignments."
          : error instanceof ApiError && error.status === 403
            ? "Bank-core does not permit your role to view Teller management.":
              "The Teller directory could not be loaded from bank-core.");
      }
    }).finally(() => { if (active) setDirectoryLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(undefined);
    try {
      const result = await tellersApi.users();
      setUsers(result);
      return result;
    } catch (error) {
      setUsersError(error instanceof ApiError && error.status === 403
        ? "Bank-core does not permit your role to list eligible login accounts."
        : error instanceof ApiError && error.status === 401
          ? "Your Manager session has expired. Sign in again before assigning a Teller."
          : "Eligible user accounts could not be loaded from bank-core.");
      return null;
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const refreshDirectory = useCallback(async (refreshUsers = false) => {
    setDirectoryLoading(true);
    setDirectoryError(undefined);
    try {
      const result = await tellersApi.list();
      setEmployees(result);
      setSelectedEmail((current) => current && result.some((employee) => employee.email === current) ? current : undefined);
      if (refreshUsers && users !== null) {
        setUsers(await tellersApi.users());
      }
      return result;
    } catch (error) {
      setDirectoryError(error instanceof ApiError && error.status === 401
        ? "Your Manager session has expired. Sign in again to manage Teller assignments."
        : error instanceof ApiError && error.status === 403
          ? "Bank-core does not permit your role to view Teller management."
          : "The Teller directory could not be refreshed from bank-core.");
      throw error;
    } finally {
      setDirectoryLoading(false);
    }
  }, [users]);

  const eligibleUsers = useMemo(() => (users ?? []).filter((user) =>
    user.role?.roleName?.toUpperCase() === "CUSTOMER" && user.isActive === true && Boolean(user.email)
  ), [users]);
  const visibleCandidates = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return query ? eligibleUsers.filter((user) => [user.username, user.email, user.firstName, user.lastName].some((value) => value.toLowerCase().includes(query))) : eligibleUsers;
  }, [eligibleUsers, userSearch]);
  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? employees.filter((employee) => [employeeName(employee), employee.email, employee.phone, employee.department ?? "", employee.status ?? "", employee.userId ?? ""].some((value) => value.toLowerCase().includes(query))) : employees;
  }, [employees, search]);

  function openCreate() {
    setMode("create");
    setFormUserId("");
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormFieldErrors({});
    setNotice(undefined);
    setWarning(undefined);
    setUserSearch("");
    if (users === null && !usersLoading) void loadUsers();
  }

  function openEdit(employee: TellerEmployee) {
    if (!employee.userId) return;
    setMode("edit");
    setFormUserId(employee.userId);
    setForm(formFromEmployee(employee));
    setFormError(undefined);
    setFormFieldErrors({});
    setNotice(undefined);
    setWarning(undefined);
  }

  function chooseUser(userId: string) {
    setFormUserId(userId);
    const user = eligibleUsers.find((candidate) => candidate.userId === userId);
    if (user) setForm(formFromUser(user));
  }

  async function reconcile(attempt: WriteAttempt) {
    setReconciling(true);
    setWarning("The write response was interrupted. Checking authoritative Teller and user state; no write will be repeated.");
    setNotice(undefined);
    try {
      const freshEmployees = await tellersApi.list();
      setEmployees(freshEmployees);
      let confirmed = false;
      let targetEmail = "";

      if (attempt.operation === "create") {
        const current = freshEmployees.find((employee) => employee.userId === attempt.userId);
        confirmed = Boolean(current && current.roleName === "TELLER" && current.status === "ACTIVE");
        targetEmail = current?.email ?? attempt.body.email;
      } else if (attempt.operation === "update") {
        const current = freshEmployees.find((employee) => employee.userId === attempt.userId);
        confirmed = Boolean(current && sameProfile(current, attempt.body));
        targetEmail = current?.email ?? attempt.body.email;
      } else {
        const [freshUsers] = await Promise.all([tellersApi.users()]);
        setUsers(freshUsers);
        const resigned = freshEmployees.find((employee) => employee.email === attempt.email && employee.status === "INACTIVE" && employee.userId === null);
        const user = freshUsers.find((entry) => entry.userId === attempt.userId);
        confirmed = Boolean(resigned && user?.role?.roleName?.toUpperCase() === "CUSTOMER");
        targetEmail = attempt.email;
      }

      if (confirmed) {
        setSelectedEmail(targetEmail);
        setUnresolved(undefined);
        setWarning(undefined);
        setNotice(`${attemptMessage(attempt.operation)} The previous response was interrupted; this state was confirmed by a read-only refresh.`);
        setMode(null);
        setConfirmation(false);
      } else {
        setUnresolved(attempt);
        setWarning("The write outcome remains unconfirmed. No retry was sent. Refresh state again or contact another Manager before repeating this operation.");
      }
    } catch {
      setUnresolved(attempt);
      setWarning("The write outcome remains unconfirmed because bank-core state could not be retrieved. No retry was sent. Check current state before any further Teller change.");
    } finally {
      setReconciling(false);
    }
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writeInFlight.current || !mode || unresolved) return;
    setFormError(undefined);
    setFormFieldErrors({});
    setNotice(undefined);
    setWarning(undefined);
    if (mode === "create" && !formUserId) {
      setFormError("Select an existing active customer login before assigning a Teller.");
      return;
    }
    const invalid = validationMessage(form);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    const body = requestFromForm(form);
    const attempt: WriteAttempt = mode === "create"
      ? { operation: "create", userId: formUserId, body }
      : { operation: "update", userId: formUserId, body };
    writeInFlight.current = true;
    setWritePending(true);
    try {
      if (attempt.operation === "create") await tellersApi.create(attempt.userId, attempt.body);
      else await tellersApi.update(attempt.userId, attempt.body);
      setMode(null);
      setNotice(attemptMessage(attempt.operation));
      try {
        const fresh = await refreshDirectory(attempt.operation === "create");
        setSelectedEmail(fresh.find((employee) => employee.userId === attempt.userId)?.email ?? body.email);
      } catch {
        setWarning("Bank-core acknowledged the write, but the latest directory could not be loaded. Refresh to view authoritative fields.");
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.retryableTransport || error.kind === "network" || error.kind === "timeout" || error.status >= 500) {
        await reconcile(attempt);
      } else {
        setFormError(requestError(error, attempt.operation === "create" ? "Teller assignment" : "Teller profile update"));
        setFormFieldErrors(error.fieldErrors ?? {});
        if (error.status === 409) {
          try { await refreshDirectory(); } catch { /* the validation error remains visible */ }
        }
      }
    } finally {
      writeInFlight.current = false;
      setWritePending(false);
    }
  }

  async function confirmRemoval() {
    if (!selected?.userId || writeInFlight.current || unresolved) return;
    const attempt: WriteAttempt = { operation: "remove", userId: selected.userId, email: selected.email };
    writeInFlight.current = true;
    setWritePending(true);
    setConfirmation(false);
    setFormError(undefined);
    setNotice(undefined);
    setWarning(undefined);
    try {
      await tellersApi.remove(attempt.userId);
      setNotice(attemptMessage(attempt.operation));
      try {
        const fresh = await refreshDirectory(true);
        setSelectedEmail(fresh.find((employee) => employee.email === attempt.email)?.email);
      } catch {
        setWarning("Bank-core confirmed the removal, but the latest directory could not be loaded. Refresh to verify the inactive employee record.");
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.retryableTransport || error.kind === "network" || error.kind === "timeout" || error.status >= 500) {
        await reconcile(attempt);
      } else {
        setFormError(requestError(error, "Teller removal"));
      }
    } finally {
      writeInFlight.current = false;
      setWritePending(false);
    }
  }

  const busy = writePending || reconciling;
  return <>
    <SectionHeading eyebrow="Manager workspace" title="Teller management">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button secondary" disabled={directoryLoading || busy} onClick={() => setReload((value) => value + 1)}>{directoryLoading ? "Refreshing…" : "Refresh directory"}</button>
        <button type="button" className="button" disabled={busy || Boolean(unresolved)} onClick={openCreate}>Assign existing customer as Teller</button>
      </div>
    </SectionHeading>

    <div className="grid gap-5 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
      <section className="card grid content-start gap-4" aria-label="Teller directory">
        <div>
          <h2 className="text-xl font-black">Teller directory</h2>
          <p className="mt-1 muted">Bank-core returns the full Teller list without pagination or server-side search. Search below filters the loaded results locally.</p>
        </div>
        <label htmlFor="teller-search" className="font-semibold">Search tellers</label>
        <input id="teller-search" className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, department, status, or user UUID" />
        {directoryLoading && <p role="status" className="muted">Loading Teller directory…</p>}
        {directoryError && <div className="error-box grid gap-3" role="alert"><p>{directoryError}</p><button type="button" className="button secondary w-fit" onClick={() => setReload((value) => value + 1)}>Try again</button></div>}
        {!directoryLoading && !directoryError && employees.length === 0 && <p className="muted" role="status">No Teller employee records were returned by bank-core.</p>}
        {!directoryLoading && !directoryError && employees.length > 0 && visibleEmployees.length === 0 && <p className="muted" role="status">No Teller records match “{search.trim()}”.</p>}
        {!directoryLoading && !directoryError && visibleEmployees.length > 0 && <ul className="grid gap-2" aria-label="Teller records">
          {visibleEmployees.map((employee) => <li key={employee.email}>
            <button type="button" className={`w-full rounded-lg border p-3 text-left hover:border-teal-700 ${selectedEmail === employee.email ? "border-teal-700 bg-teal-50" : "border-slate-200"}`} aria-pressed={selectedEmail === employee.email} aria-label={`View ${employeeName(employee)} details`} onClick={() => { setSelectedEmail(employee.email); setMode(null); setConfirmation(false); setNotice(undefined); setFormError(undefined); }}>
              <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{employeeName(employee)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{employee.status ?? "Status not returned"}</span></span>
              <span className="mt-1 block text-sm">{employee.email}</span>
              <span className="mt-1 block text-xs muted">{employee.roleName ?? "Role not returned"} · {employee.department || "No department returned"}</span>
            </button>
          </li>)}
        </ul>}
      </section>

      <section className="grid content-start gap-5" aria-label="Teller details and actions">
        {notice && <p className="success-box" role="status">{notice}</p>}
        {warning && <div className="error-box grid gap-3" role="alert"><p>{warning}</p>{unresolved && <button type="button" className="button secondary w-fit" disabled={busy} onClick={() => void reconcile(unresolved)}>{reconciling ? "Checking state…" : "Check current state"}</button>}</div>}
        {directoryError && <p className="error-box" role="alert">Manager operations are unavailable until the directory can be loaded.</p>}
        {mode && <section className="card grid gap-4" aria-label={mode === "create" ? "Assign Teller" : "Edit Teller profile"}>
          <div><h2 className="text-xl font-black">{mode === "create" ? "Assign an existing login as Teller" : "Update Teller profile"}</h2>
            <p className="mt-1 text-sm muted">{mode === "create" ? "Bank-core assigns the TELLER role to the selected CUSTOMER login and revokes its existing sessions. The user must sign in again." : "This replaces the Teller profile fields through bank-core. Changing this employee email does not change the linked login email."}</p>
          </div>
          {mode === "create" && <>
            <label htmlFor="teller-user-search" className="font-semibold">Search eligible customer logins</label>
            <input id="teller-user-search" className="field" type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Name, username, or email" />
            <label htmlFor="teller-user" className="font-semibold">Existing customer login</label>
            <select id="teller-user" className="field" value={formUserId} onChange={(event) => chooseUser(event.target.value)} disabled={usersLoading || busy}>
              <option value="">Select an active CUSTOMER login</option>
              {visibleCandidates.map((user) => <option key={user.userId} value={user.userId}>{userName(user)} · {user.email}</option>)}
            </select>
            {usersLoading && <p role="status" className="muted">Loading existing user accounts…</p>}
            {usersError && <div className="error-box grid gap-2" role="alert"><p>{usersError}</p><button type="button" className="button secondary w-fit" onClick={() => void loadUsers()}>Retry user lookup</button></div>}
            {!usersLoading && users !== null && eligibleUsers.length === 0 && <p className="muted">No active CUSTOMER login accounts are available for Teller assignment.</p>}
            <p className="text-sm muted">The backend Teller contract has no branch field. A Teller cannot be assigned to a branch through these endpoints.</p>
          </>}
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitForm(event)}>
            <label className="grid gap-1 text-sm font-semibold">First name<input className="field" maxLength={100} required value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold">Last name<input className="field" maxLength={100} required value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold">Email<input className="field" type="email" maxLength={150} required value={form.email} readOnly={mode === "create"} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold">Phone<input className="field" maxLength={20} required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Address<input className="field" maxLength={255} required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold">Gender<select className="field" required value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))} disabled={busy}><option value="">Select</option>{genders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">Date of birth<input className="field" type="date" max={localYesterday()} required value={form.dateOfBirth} onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))} disabled={busy} /></label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Department (optional)<input className="field" maxLength={100} value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} disabled={busy} /></label>
            {Object.entries(formFieldErrors).map(([field, message]) => <p key={field} className="error-box sm:col-span-2" role="alert">{field}: {message}</p>)}
            {formError && <p className="error-box sm:col-span-2" role="alert">{formError}</p>}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="button" disabled={busy || Boolean(unresolved) || (mode === "create" && (!formUserId || usersLoading || Boolean(usersError)))}>{writePending ? "Saving…" : reconciling ? "Checking state…" : mode === "create" ? "Assign Teller" : "Save Teller profile"}</button>
              <button type="button" className="button ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
            </div>
          </form>
        </section>}

        {!mode && selected && <section className="card grid gap-4">
          <div><p className="text-sm font-bold uppercase tracking-wide text-teal-700">Teller record</p><h2 className="mt-1 text-2xl font-black">{employeeName(selected)}</h2></div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm muted">Employee ID</dt><dd>Employee ID is not returned by bank-core.</dd></div>
            <div><dt className="text-sm muted">Linked user UUID</dt><dd className="break-all font-mono">{selected.userId ?? "Not linked (former Teller)"}</dd></div>
            <div><dt className="text-sm muted">Email</dt><dd className="break-all">{selected.email}</dd></div>
            <div><dt className="text-sm muted">Role</dt><dd>{selected.roleName ?? "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Status</dt><dd>{selected.status ?? "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Department</dt><dd>{selected.department || "Not assigned"}</dd></div>
            <div><dt className="text-sm muted">Phone</dt><dd>{selected.phone || "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Hire date</dt><dd>{formatDate(selected.hireDate)}</dd></div>
            <div><dt className="text-sm muted">Manager employee UUID</dt><dd className="break-all font-mono">{selected.managerId ?? "Not assigned"}</dd></div>
            <div><dt className="text-sm muted">Branch</dt><dd>Branch association is not supported by the Teller API.</dd></div>
          </dl>
          {selected.userId && <div className="flex flex-wrap gap-2">
            <button type="button" className="button secondary" disabled={busy || Boolean(unresolved)} onClick={() => openEdit(selected)}>{selected.status === "INACTIVE" ? "Reactivate and edit profile" : "Edit Teller profile"}</button>
            {selected.status === "ACTIVE" && <button type="button" className="button danger" disabled={busy || Boolean(unresolved)} onClick={() => { setConfirmation(true); setNotice(undefined); setFormError(undefined); }}>Remove Teller assignment</button>}
          </div>}
          {confirmation && <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Confirm Teller removal">
            <p className="font-bold">Confirm removal of {employeeName(selected)}?</p>
            <p className="text-sm">Bank-core marks the employee record INACTIVE, removes its linked user UUID, and changes the linked login role to CUSTOMER. When removal commits, bank-core revokes the user’s existing sessions. The user must sign in again. A revoked session receives HTTP 401 on its next protected request. A valid session without permission receives HTTP 403.</p>
            <div className="flex flex-wrap gap-2"><button type="button" className="button danger" disabled={busy} onClick={() => void confirmRemoval()}>{writePending ? "Removing…" : "Confirm removal"}</button><button type="button" className="button ghost" disabled={busy} onClick={() => setConfirmation(false)}>Cancel</button></div>
          </div>}
        </section>}
        {!mode && !selected && <p className="card muted">Select a Teller record to inspect the fields bank-core returns.</p>}
      </section>
    </div>
  </>;
}
