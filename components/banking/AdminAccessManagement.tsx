"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SectionHeading } from "@/components/layout/ProtectedLayout";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminAccessRole,
  AdminEmployeeRecord,
  AdminManagerDirectoryEntry,
  AdminRoleUpdateRequest,
  AdminUserDirectoryEntry,
  EmployeeStatus,
  TellerGender
} from "@/lib/api/contracts";
import { adminAccessApi } from "@/lib/api/admin-access";

type DirectoryTab = "users" | "employees";
type RoleDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  roleName: string;
  department: string;
  managerId: string;
  status: string;
  gender: string;
  dateOfBirth: string;
};
type RoleChangeAttempt = {
  username: string;
  userId: string;
  previousRole: string;
  previousEmployee: AdminEmployeeRecord | undefined;
  request: AdminRoleUpdateRequest;
};

const employeeStatuses: readonly EmployeeStatus[] = ["ACTIVE", "INACTIVE", "PENDING", "RESIGNED"];
const genders: readonly TellerGender[] = ["MALE", "FEMALE", "OTHER"];
const directoryTabs = { users: "Users", employees: "Employees" } as const;
const fieldLabels: Record<keyof RoleDraft, string> = {
  firstName: "First name", lastName: "Last name", email: "Login email", phone: "Phone", address: "Address",
  roleName: "Target role", status: "Employee status", gender: "Gender", dateOfBirth: "Date of birth",
  department: "Department", managerId: "Manager employee UUID"
};

function focusSection(node: HTMLElement | null) {
  node?.focus();
}

function accountName(user: AdminUserDirectoryEntry): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

function employeeName(employee: AdminEmployeeRecord): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Unnamed employee";
}

function roleName(user: AdminUserDirectoryEntry | null): string {
  return user?.role?.roleName ?? "Not returned";
}

function readError(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.authExpired)) return "Your Admin session has expired. Sign in again to manage access.";
  if (error instanceof ApiError && error.status === 403) return "Bank-core denied this Admin directory request.";
  if (error instanceof ApiError && error.status === 404) return "The selected user or employee record was not found. Refresh the directories.";
  return "The Admin access directories could not be loaded from bank-core.";
}

function writeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The role change result could not be confirmed. Check current user state before making another change.";
  if (error.status === 401 || error.authExpired) return "Your Admin session has expired. Sign in again before changing access.";
  if (error.status === 403) return "Bank-core does not permit this role change for the current session.";
  if (error.status === 404) return "Bank-core could not find the selected user or target role. Refresh and select current data.";
  if (error.status === 409) return "Bank-core rejected this change because the employee profile conflicts with an existing record.";
  if (error.status === 400 || error.status === 422) return "Bank-core rejected one or more required role or employee profile values. Review the form and correct the returned fields.";
  if (error.status === 429) return "Bank-core is limiting role changes. Wait, then refresh current user state.";
  if (error.status >= 500) return "Bank-core returned an uncertain result. Current user and employee state is being checked; do not repeat the change.";
  return "Bank-core rejected this role change. Refresh the user record before continuing.";
}

function draftFor(user: AdminUserDirectoryEntry, employee?: AdminEmployeeRecord): RoleDraft {
  return {
    firstName: employee?.firstName ?? user.firstName ?? "",
    lastName: employee?.lastName ?? user.lastName ?? "",
    // Bank-core uses the login email as a fallback when no employee is linked by user UUID.
    email: user.email,
    phone: employee?.phone ?? user.mobileNumber ?? "",
    address: employee?.address ?? user.address ?? "",
    roleName: roleName(user) === "Not returned" ? "" : roleName(user),
    department: employee?.department ?? "",
    managerId: employee?.managerId ?? "",
    status: employee?.status ?? "",
    gender: employee?.gender ?? "",
    dateOfBirth: employee?.dateOfBirth ?? ""
  };
}

function requestFromDraft(draft: RoleDraft): AdminRoleUpdateRequest {
  const request: AdminRoleUpdateRequest = {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    address: draft.address.trim(),
    roleName: draft.roleName,
    department: draft.department.trim(),
    status: draft.status as EmployeeStatus,
    gender: draft.gender as TellerGender,
    dateOfBirth: draft.dateOfBirth
  };
  if (draft.managerId) request.managerId = draft.managerId;
  return request;
}

function validateDraft(draft: RoleDraft, roles: AdminAccessRole[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of ["firstName", "lastName", "phone", "address"] as const) {
    const label = fieldLabels[field].toLowerCase();
    if (!draft[field].trim()) errors[field] = `Enter ${field === "address" ? "an" : "a"} ${label}.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = "The user’s login email must be valid. Refresh the user record to check it.";
  if (!draft.roleName || !roles.some((role) => role.roleName === draft.roleName)) errors.roleName = "Select a role returned by bank-core.";
  if (!employeeStatuses.includes(draft.status as EmployeeStatus)) errors.status = "Select a supported employee status.";
  if (!genders.includes(draft.gender as TellerGender)) errors.gender = "Select a supported gender value.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dateOfBirth)) errors.dateOfBirth = "Enter the required date of birth.";
  return errors;
}

function sameEmployee(employee: AdminEmployeeRecord | undefined, request: AdminRoleUpdateRequest): boolean {
  if (!employee) return false;
  return employee.roleName === request.roleName
    && employee.status === request.status
    && employee.firstName === request.firstName
    && employee.lastName === request.lastName
    && employee.email === request.email
    && employee.phone === request.phone
    && employee.address === request.address
    && (employee.department ?? "") === request.department
    && employee.gender === request.gender
    && employee.dateOfBirth === request.dateOfBirth
    && (!request.managerId || employee.managerId === request.managerId);
}

export function AdminAccessManagement() {
  const { username: currentUsername } = useAuth();
  const [tab, setTab] = useState<DirectoryTab>("users");
  const [users, setUsers] = useState<AdminUserDirectoryEntry[]>([]);
  const [employees, setEmployees] = useState<AdminEmployeeRecord[]>([]);
  const [roles, setRoles] = useState<AdminAccessRole[]>([]);
  const [managers, setManagers] = useState<AdminManagerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [reload, setReload] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedUsername, setSelectedUsername] = useState<string>();
  const [selectedUser, setSelectedUser] = useState<AdminUserDirectoryEntry | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string>();
  const [selectedEmployee, setSelectedEmployee] = useState<AdminEmployeeRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [formFieldErrors, setFormFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [pending, setPending] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [unresolved, setUnresolved] = useState<RoleChangeAttempt>();
  const requestInFlight = useRef(false);
  const tabButtons = useRef<Partial<Record<DirectoryTab, HTMLButtonElement | null>>>({});
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const linkedEmployee = selectedUser ? employees.find((employee) => employee.userId === selectedUser.userId) : undefined;
  const employeeEmailMismatch = linkedEmployee && linkedEmployee.email.toLowerCase() !== selectedUser?.email.toLowerCase();
  const employeeLinkedElsewhere = selectedUser && employees.some((employee) =>
    employee.email.toLowerCase() === selectedUser.email.toLowerCase()
    && employee.userId !== null
    && employee.userId !== selectedUser.userId
  );
  const employeeIdentityConflictMessage = employeeEmailMismatch
    ? "The linked employee email differs from the login email. This form sends the login email, so the change is blocked to avoid overwriting the employee email."
    : employeeLinkedElsewhere
      ? "An Employee record with this login email is linked to a different user UUID. This change is blocked to protect that employee association."
      : undefined;

  const readSnapshot = useCallback(async () => Promise.all([
    adminAccessApi.listUsers(),
    adminAccessApi.listEmployees(),
    adminAccessApi.listRoles(),
    adminAccessApi.listManagers()
  ] as const), []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the loading state for initial and explicit directory refreshes.
    setLoading(true);
    setLoadError(undefined);
    void readSnapshot().then(([nextUsers, nextEmployees, nextRoles, nextManagers]) => {
      if (!active) return;
      setUsers(nextUsers);
      setEmployees(nextEmployees);
      setRoles(nextRoles);
      setManagers(nextManagers);
      setSelectedEmployee((current) => current
        ? nextEmployees.find((employee) => employee.email === current.email && employee.userId === current.userId) ?? null
        : null);
    }).catch((error: unknown) => {
      if (active) setLoadError(readError(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [readSnapshot, reload]);

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    return query ? users.filter((user) => [user.username, user.email, user.firstName ?? "", user.lastName ?? "", user.role?.roleName ?? "", user.userId].some((value) => value.toLowerCase().includes(query))) : users;
  }, [userSearch, users]);
  const visibleEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return query ? employees.filter((employee) => [employeeName(employee), employee.email, employee.roleName ?? "", employee.status ?? "", employee.userId ?? "", employee.managerId ?? ""].some((value) => value.toLowerCase().includes(query))) : employees;
  }, [employeeSearch, employees]);

  function activateTab(next: DirectoryTab) {
    if (next === tab) return;
    setTab(next);
    setSelectedEmployee(null);
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: DirectoryTab) {
    let next: DirectoryTab;
    switch (event.key) {
      case "Home": next = "users"; break;
      case "End": next = "employees"; break;
      case "ArrowLeft":
      case "ArrowRight": next = current === "users" ? "employees" : "users"; break;
      default: return;
    }
    event.preventDefault();
    tabButtons.current[next]?.focus();
  }

  async function selectUser(user: AdminUserDirectoryEntry) {
    setTab("users");
    setSelectedUsername(user.username);
    setSelectedUser(user);
    setSelectedEmployee(null);
    setUserError(undefined);
    setEditorOpen(false);
    setReviewOpen(false);
    setFormError(undefined);
    setNotice(undefined);
    setWarning(undefined);
    setUserLoading(true);
    try {
      const detail = await adminAccessApi.getUserByUsername(user.username);
      setSelectedUser(detail);
    } catch (error) {
      setUserError(readError(error));
    } finally {
      setUserLoading(false);
    }
  }

  function openRoleEditor() {
    if (!selectedUser || unresolved || employeeIdentityConflictMessage) return;
    setDraft(draftFor(selectedUser, linkedEmployee));
    setFormError(undefined);
    setFormFieldErrors({});
    setNotice(undefined);
    setWarning(undefined);
    setReviewOpen(false);
    setEditorOpen(true);
  }

  function makeAttempt(): RoleChangeAttempt | null {
    if (!selectedUser || !draft) return null;
    if (employeeIdentityConflictMessage) {
      setFormError(employeeIdentityConflictMessage);
      return null;
    }
    const invalid = validateDraft(draft, roles);
    if (Object.keys(invalid).length) {
      setFormError("Correct the highlighted fields before reviewing the role change.");
      setFormFieldErrors(invalid);
      return null;
    }
    if (draft.roleName === roleName(selectedUser) && roleName(selectedUser) === "CUSTOMER" && !linkedEmployee) {
      setFormError("This user already has the CUSTOMER role. Bank-core has no user activation or profile update operation here.");
      return null;
    }
    return {
      username: selectedUser.username,
      userId: selectedUser.userId,
      previousRole: roleName(selectedUser),
      previousEmployee: linkedEmployee,
      request: requestFromDraft(draft)
    };
  }

  function verifyRoleOutcome(user: AdminUserDirectoryEntry, employeeList: AdminEmployeeRecord[], attempt: RoleChangeAttempt): boolean {
    if (user.role?.roleName !== attempt.request.roleName) return false;
    if (attempt.request.roleName === "CUSTOMER") {
      if (!attempt.previousEmployee) return true;
      return !employeeList.some((employee) => employee.userId === attempt.userId)
        && employeeList.some((employee) => employee.email === attempt.previousEmployee?.email && employee.status === "INACTIVE" && employee.userId === null);
    }
    const currentEmployee = employeeList.find((employee) => employee.userId === attempt.userId);
    return sameEmployee(currentEmployee, attempt.request);
  }

  async function reconcile(attempt: RoleChangeAttempt, acknowledged = false) {
    setReconciling(true);
    setWarning(acknowledged
      ? "Bank-core acknowledged the role change, but refreshed records were unavailable. Reading user and employee records; no role change will be resent."
      : "The response was interrupted. Reading the user and employee records from bank-core; no role change will be resent.");
    setNotice(undefined);
    try {
      const [freshUser, freshEmployees] = await Promise.all([
        adminAccessApi.getUserByUsername(attempt.username),
        adminAccessApi.listEmployees()
      ]);
      setSelectedUser(freshUser);
      setEmployees(freshEmployees);
      setUsers((current) => current.map((entry) => entry.userId === freshUser.userId ? freshUser : entry));
      if (verifyRoleOutcome(freshUser, freshEmployees, attempt)) {
        setUnresolved(undefined);
        setEditorOpen(false);
        setReviewOpen(false);
        setWarning(undefined);
        setNotice(acknowledged
          ? `Bank-core acknowledged the role change, and the authoritative user record now reports ${attempt.request.roleName} after a read-only refresh.`
          : `The response was interrupted, but the authoritative user record now reports ${attempt.request.roleName}; the role change was confirmed by a read-only refresh.`);
      } else {
        setUnresolved(attempt);
        setWarning("The role-change outcome remains unconfirmed. No repeat request was sent. Refresh current state again or contact another Admin before attempting further changes.");
      }
    } catch {
      setUnresolved(attempt);
      setWarning(acknowledged
        ? "Bank-core acknowledged the role change, but authoritative state could not be retrieved. The outcome remains unconfirmed. No repeat request was sent. Check current state before another access change."
        : "The role-change outcome remains unconfirmed because bank-core state could not be retrieved. No repeat request was sent. Check current state before another access change.");
    } finally {
      setReconciling(false);
    }
  }

  async function refreshSelectedUser(): Promise<void> {
    if (!selectedUsername) return;
    if (unresolved) {
      await reconcile(unresolved);
      return;
    }
    setUserLoading(true);
    setUserError(undefined);
    try {
      const [freshUser, freshEmployees] = await Promise.all([
        adminAccessApi.getUserByUsername(selectedUsername),
        adminAccessApi.listEmployees()
      ]);
      setSelectedUser(freshUser);
      setUsers((current) => current.map((entry) => entry.userId === freshUser.userId ? freshUser : entry));
      setEmployees(freshEmployees);
      setUnresolved(undefined);
      setWarning(undefined);
      setNotice("Current user and employee state was refreshed from bank-core.");
    } catch (error) {
      setUserError(readError(error));
    } finally {
      setUserLoading(false);
    }
  }

  async function confirmRoleChange() {
    if (requestInFlight.current || unresolved) return;
    const attempt = makeAttempt();
    if (!attempt) return;
    requestInFlight.current = true;
    setPending(true);
    setFormError(undefined);
    setFormFieldErrors({});
    setNotice(undefined);
    setWarning(undefined);
    try {
      await adminAccessApi.updateUserRole(attempt.userId, attempt.request);
    } catch (error) {
      if (!(error instanceof ApiError) || error.retryableTransport || error.kind === "network" || error.kind === "timeout" || error.status >= 500) {
        await reconcile(attempt);
      } else {
        setFormError(writeError(error));
        setFormFieldErrors(error.fieldErrors ?? {});
        if (error.fieldErrors && Object.keys(error.fieldErrors).length) setReviewOpen(false);
        if (error.status === 409) {
          void refreshSelectedUser();
        }
      }
      requestInFlight.current = false;
      setPending(false);
      return;
    }

    try {
      const [[nextUsers, nextEmployees, nextRoles, nextManagers], freshUser] = await Promise.all([
        readSnapshot(),
        adminAccessApi.getUserByUsername(attempt.username)
      ]);
      setUsers(nextUsers);
      setEmployees(nextEmployees);
      setRoles(nextRoles);
      setManagers(nextManagers);
      setSelectedUser(freshUser);
      if (verifyRoleOutcome(freshUser, nextEmployees, attempt)) {
        setSelectedUsername(freshUser.username);
        setEditorOpen(false);
        setReviewOpen(false);
        setNotice(`Bank-core confirmed the role change. The current user role is ${freshUser.role?.roleName ?? "not returned"}.`);
      } else {
        setUnresolved(attempt);
        setWarning("Bank-core acknowledged the request, but refreshed user and employee data did not confirm the requested state. Do not repeat this change until it is reconciled.");
      }
    } catch {
      await reconcile(attempt, true);
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  function reviewRoleChange() {
    setFormError(undefined);
    setFormFieldErrors({});
    const attempt = makeAttempt();
    if (attempt) setReviewOpen(true);
  }

  const busy = pending || reconciling;
  const detailEmployee = selectedEmployee;

  function roleField(field: keyof RoleDraft, {
    type = "text", maxLength, options, optional = false, readOnly = false, wide = false, hint
  }: {
    type?: string; maxLength?: number; options?: ReactNode; optional?: boolean; readOnly?: boolean; wide?: boolean; hint?: ReactNode;
  } = {}) {
    if (!draft) return null;
    const id = `admin-role-${field}`;
    const error = formFieldErrors[field];
    const description = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
    const fieldError = error && <p id={`${id}-error`} className="admin-field-error text-sm">{error}</p>;
    const fieldHint = hint && <small id={`${id}-hint`}>{hint}</small>;
    if (readOnly) return <div className="field" role="group" aria-labelledby={`${id}-label`} aria-describedby={description}>
      <p id={`${id}-label`} className="admin-readonly-label">{fieldLabels[field]}</p>
      <p className="admin-readonly-value">{draft[field]}</p>
      {fieldError}
      {fieldHint}
    </div>;

    const control = {
      id, value: draft[field], disabled: busy, required: !optional,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": description
    };
    function update(value: string) {
      setDraft((current) => current && ({ ...current, [field]: value }));
      setReviewOpen(false);
      setFormError(undefined);
      setFormFieldErrors((current) => {
        if (!current[field]) return current;
        const remaining = { ...current };
        delete remaining[field];
        return remaining;
      });
    }

    return <div className={`field ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id}>{fieldLabels[field]}{control.required && <span aria-hidden="true"> *</span>}</label>
      {options
        ? <select {...control} onChange={(event) => update(event.target.value)}>{options}</select>
        : <input {...control} type={type} maxLength={maxLength} onChange={(event) => update(event.target.value)} />}
      {fieldError}
      {fieldHint}
    </div>;
  }

  return <div className="admin-access">
    <SectionHeading eyebrow="Administrator workspace" title="User and access management">
      <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)} disabled={loading || busy}>
        {loading ? "Refreshing…" : "Refresh directories"}
      </button>
    </SectionHeading>

    <p className="card mb-5 text-sm">Bank-core is the authorization authority. These directories have no server-side search or pagination; searches below filter the loaded records locally. User status and Employee status are separate fields.</p>
    {loadError && <div className="error-box mb-5 grid gap-3" role="alert"><p>{loadError}</p><button type="button" className="button secondary w-fit" onClick={() => setReload((value) => value + 1)}>Try loading again</button></div>}
    {loading && <p role="status" className="card muted">Loading Admin user, role and employee directories…</p>}

    {!loading && !loadError && <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(21rem,0.85fr)_minmax(0,1.15fr)]">
      <section className="card grid content-start gap-4" aria-label="Admin directory">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose directory">
          {(["users", "employees"] as const).map((name) => <button
            key={name}
            ref={(node) => { tabButtons.current[name] = node; }}
            id={`admin-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`admin-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            className={`button ${tab === name ? "" : "secondary"}`}
            onFocus={() => activateTab(name)}
            onClick={() => activateTab(name)}
            onKeyDown={(event) => navigateTabs(event, name)}
          >{directoryTabs[name]}</button>)}
        </div>

        <div id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" tabIndex={0} hidden={tab !== "users"}>
          {tab === "users" && <div className="grid gap-4">
            <div><h2 className="text-xl font-black">User directory</h2><p className="mt-1 muted">Search locally by username, email, role or user UUID.</p></div>
            <div className="field">
              <label htmlFor="admin-user-search">Search users</label>
              <input id="admin-user-search" type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Username, email, name, role or user UUID" />
            </div>
            {users.length === 0 && <p role="status" className="muted">Bank-core returned no users.</p>}
            {users.length > 0 && visibleUsers.length === 0 && <p role="status" className="muted">No users match this search.</p>}
            {visibleUsers.length > 0 && <ul className="grid gap-2" aria-label="User records">
              {visibleUsers.map((user) => <li key={user.userId}>
                <button type="button" className={`w-full rounded-lg border p-3 text-left hover:border-teal-700 ${selectedUsername === user.username ? "border-teal-700 bg-teal-50" : "border-slate-200"}`} aria-label={`View ${user.username} account`} aria-pressed={selectedUsername === user.username} onClick={() => void selectUser(user)}>
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{accountName(user)}</span><span className="text-sm">{user.role?.roleName ?? "Role not returned"}</span></span>
                  <span className="mt-1 block text-sm muted">{user.username} · {user.email}</span>
                </button>
              </li>)}
            </ul>}
          </div>}
        </div>

        <div id="admin-panel-employees" role="tabpanel" aria-labelledby="admin-tab-employees" tabIndex={0} hidden={tab !== "employees"}>
          {tab === "employees" && <div className="grid gap-4">
            <div><h2 className="text-xl font-black">Employee directory</h2><p className="mt-1 muted">Bank-core returns all employees without server-side search or pagination.</p></div>
            <div className="field">
              <label htmlFor="admin-employee-search">Search employees</label>
              <input id="admin-employee-search" type="search" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Name, email, role, status or linked user UUID" />
            </div>
            {employees.length === 0 && <p role="status" className="muted">Bank-core returned no employee records.</p>}
            {employees.length > 0 && visibleEmployees.length === 0 && <p role="status" className="muted">No employees match this search.</p>}
            {visibleEmployees.length > 0 && <ul className="grid gap-2" aria-label="Employee records">
              {visibleEmployees.map((employee, index) => {
                const linkedUser = employee.userId ? users.find((user) => user.userId === employee.userId) : undefined;
                return <li key={`${employee.userId ?? "unlinked"}-${employee.email}-${index}`}>
                  <button type="button" className={`w-full rounded-lg border p-3 text-left hover:border-teal-700 ${selectedEmployee === employee ? "border-teal-700 bg-teal-50" : "border-slate-200"}`} aria-label={`View ${employeeName(employee)} employee record`} aria-pressed={selectedEmployee === employee} onClick={() => { setSelectedEmployee(employee); setSelectedUser(null); setSelectedUsername(undefined); setEditorOpen(false); setNotice(undefined); setWarning(undefined); }}>
                    <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{employeeName(employee)}</span><span className="text-sm">{employee.roleName ?? "Role not returned"} · {employee.status ?? "Status not returned"}</span></span>
                    <span className="mt-1 block text-sm muted">{employee.email}{linkedUser ? ` · ${linkedUser.username}` : employee.userId ? " · Linked user not in directory" : " · No linked user UUID"}</span>
                  </button>
                </li>;
              })}
            </ul>}
          </div>}
        </div>
      </section>

      <section className="grid content-start gap-5" aria-label="Selected account or employee">
        {detailEmployee && <section className="card grid gap-4" aria-label="Employee details">
          <div><p className="text-sm font-bold uppercase tracking-wide text-teal-700">Employee record</p><h2 className="mt-1 text-2xl font-black">{employeeName(detailEmployee)}</h2></div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm muted">Employee UUID</dt><dd>Employee UUID is not returned by this list.</dd></div>
            <div><dt className="text-sm muted">Linked user UUID</dt><dd className="break-all font-mono">{detailEmployee.userId ?? "No linked user"}</dd></div>
            <div><dt className="text-sm muted">Email</dt><dd>{detailEmployee.email}</dd></div>
            <div><dt className="text-sm muted">Role</dt><dd>{detailEmployee.roleName ?? "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Employee status</dt><dd>{detailEmployee.status ?? "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Department</dt><dd>{detailEmployee.department || "Not assigned"}</dd></div>
            <div><dt className="text-sm muted">Hire date</dt><dd>{detailEmployee.hireDate ?? "Not recorded"}</dd></div>
            <div><dt className="text-sm muted">Manager employee UUID</dt><dd className="break-all font-mono">{detailEmployee.managerId ?? "Not assigned"}</dd></div>
          </dl>
          {detailEmployee.userId && users.some((user) => user.userId === detailEmployee.userId) && <button type="button" className="button secondary w-fit" onClick={() => {
            const user = users.find((entry) => entry.userId === detailEmployee.userId);
            if (user) {
              tabButtons.current.users?.focus();
              void selectUser(user);
            }
          }}>Open linked user account</button>}
        </section>}

        {selectedUser && <section className="card grid gap-4" aria-label="User account details">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-wide text-teal-700">User account</p><h2 className="mt-1 text-2xl font-black">{accountName(selectedUser)}</h2></div><button type="button" className="button secondary" onClick={() => void refreshSelectedUser()} disabled={userLoading || busy}>{userLoading ? "Refreshing…" : "Refresh user"}</button></div>
          {userLoading && <p role="status" className="muted">Loading the authoritative user record…</p>}
          {userError && <p role="alert" className="error-box">{userError}</p>}
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm muted">User UUID</dt><dd className="break-all font-mono">{selectedUser.userId}</dd></div>
            <div><dt className="text-sm muted">Username</dt><dd>{selectedUser.username}</dd></div>
            <div><dt className="text-sm muted">Email</dt><dd className="break-all">{selectedUser.email}</dd></div>
            <div><dt className="text-sm muted">Current role</dt><dd>{roleName(selectedUser)}</dd></div>
            <div><dt className="text-sm muted">Login active</dt><dd>{selectedUser.isActive === true ? "Yes" : selectedUser.isActive === false ? "No" : "Not returned"}</dd></div>
            <div><dt className="text-sm muted">Email verified</dt><dd>{selectedUser.emailVerified ? "Yes" : "No"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm muted">Customer record UUID</dt><dd>Customer record UUID is not returned by the Admin user directory. Customer records are a separate resource.</dd></div>
            {linkedEmployee && <div className="sm:col-span-2"><dt className="text-sm muted">Linked employee record</dt><dd>Linked by user UUID; employee UUID is not returned by the employee list.</dd></div>}
          </dl>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-bold">Account access and employee status are different.</p>
            <p className="mt-1">This form changes the role and employee status. The login active flag is read-only here. A linked employee must be ACTIVE to sign in.</p>
            <p className="mt-1">When a role or employee status change commits, bank-core revokes the affected user’s existing sessions. The user must sign in again. A revoked session receives HTTP 401 on its next protected request. A valid session without permission receives HTTP 403.</p>
          </div>

          {currentUsername === selectedUser.username && <p className="error-box" role="alert">This is your own user account. If your role or employee status changes, your current Admin session will be revoked and you must sign in again.</p>}
          {employeeIdentityConflictMessage && <p className="error-box" role="alert">{employeeIdentityConflictMessage}</p>}
          {userError === undefined && <button ref={editorTrigger} type="button" className="button w-fit" onClick={openRoleEditor} disabled={busy || Boolean(unresolved) || Boolean(employeeIdentityConflictMessage)}>Change role and employee access</button>}
          {selectedUser.isActive === false && <p className="muted text-sm">Bank-core has no Admin endpoint to activate or deactivate user logins; changing this user’s role does not change Login active.</p>}
          {notice && <p role="status" className="success-box">{notice}</p>}
          {warning && <div role="alert" className="error-box grid gap-3"><p>{warning}</p>{unresolved && <button type="button" className="button secondary w-fit" disabled={busy} onClick={() => void reconcile(unresolved)}>{reconciling ? "Checking state…" : "Check current user state"}</button>}</div>}

          {editorOpen && draft && <section ref={focusSection} tabIndex={-1} className="admin-role-editor grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-3 sm:p-4" aria-labelledby="admin-role-editor-title">
            <div>
              <h3 id="admin-role-editor-title" className="text-xl font-black">Role and Employee record</h3>
              <p className="mt-1 text-sm muted">Fields marked * are required for every role. For CUSTOMER, bank-core marks a linked Employee record INACTIVE and unlinks it.</p>
            </div>
            {formError && <div ref={focusSection} tabIndex={-1} role="alert" className="error-box">
              <p>{formError}</p>
              {Object.entries(formFieldErrors).filter(([field]) => !Object.hasOwn(fieldLabels, field)).map(([field, message]) => <p key={field}>{field}: {message}</p>)}
            </div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {roleField("firstName", { maxLength: 100 })}
              {roleField("lastName", { maxLength: 100 })}
              {roleField("email", { readOnly: true, hint: "Read-only. The role change uses this login email." })}
              {roleField("phone", { type: "tel", maxLength: 20 })}
              {roleField("address", { wide: true })}
              {roleField("roleName", { options: <>
                <option value="">Select a role from bank-core</option>
                {roles.map((role) => <option key={role.roleId} value={role.roleName}>{role.roleName}</option>)}
              </> })}
              {roleField("status", { options: <>
                <option value="">Select status</option>
                {employeeStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </> })}
              {roleField("gender", { options: <>
                <option value="">Select gender</option>
                {genders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
              </> })}
              {roleField("dateOfBirth", { type: "date" })}
              {roleField("department", { maxLength: 100, optional: true })}
              {roleField("managerId", {
                optional: true,
                options: <>
                  <option value="">No change / not assigned</option>
                  {managers.map((manager) => <option key={manager.employeeId} value={manager.employeeId}>{manager.firstName} {manager.lastName} · {manager.employeeId}</option>)}
                </>,
                hint: draft.managerId ? <>Selected UUID <span className="font-mono">{draft.managerId}</span></> : "Leaving Manager blank preserves an existing manager association."
              })}
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button ref={reviewTrigger} type="button" className="button" onClick={reviewRoleChange} disabled={busy || Boolean(unresolved)}>Review role change</button>
              <button type="button" className="button ghost" onClick={() => { setEditorOpen(false); setReviewOpen(false); editorTrigger.current?.focus(); }} disabled={busy}>Cancel</button>
            </div>
            {reviewOpen && <div ref={focusSection} tabIndex={-1} className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:p-4" role="region" aria-label="Confirm role change">
              <p className="font-bold">Confirm {roleName(selectedUser)} → {draft.roleName}</p>
              <p className="text-sm">The requested Employee status is {draft.status}. If the target role is CUSTOMER, bank-core will set a linked Employee record to INACTIVE and unlink it. If the role or employee status changes, bank-core revokes the user’s existing sessions and the user must sign in again.</p>
              {currentUsername === selectedUser.username && <p className="text-sm font-bold">This change applies to your own account. Sign in again after any change to your role or employee status.</p>}
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" className="button danger" onClick={() => void confirmRoleChange()} disabled={busy || Boolean(unresolved)}>{pending ? "Applying role change…" : reconciling ? "Checking current state…" : "Confirm role change"}</button>
                <button type="button" className="button ghost" onClick={() => { setReviewOpen(false); reviewTrigger.current?.focus(); }} disabled={busy}>Back to form</button>
              </div>
            </div>}
          </section>}
        </section>}

        {!selectedUser && !detailEmployee && <p className="card muted">Select a user or employee to inspect the fields bank-core returns.</p>}
      </section>
    </div>}
  </div>;
}
