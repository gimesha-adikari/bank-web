"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    // The service locates the employee row using the login email before applying this field.
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

function validateDraft(draft: RoleDraft, roles: AdminAccessRole[]): string | null {
  if (!draft.roleName || !roles.some((role) => role.roleName === draft.roleName)) return "Select a role returned by bank-core.";
  if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.email.trim() || !draft.phone.trim() || !draft.address.trim()) {
    return "First name, last name, email, phone and address are required by the role-change request.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return "Enter a valid login email address.";
  if (!employeeStatuses.includes(draft.status as EmployeeStatus)) return "Select a supported employee status.";
  if (!genders.includes(draft.gender as TellerGender)) return "Select a supported gender value.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dateOfBirth)) return "Enter the required date of birth.";
  return null;
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
  const linkedEmployee = selectedUser ? employees.find((employee) => employee.userId === selectedUser.userId) : undefined;
  const employeeEmailMismatch = Boolean(linkedEmployee && linkedEmployee.email.toLowerCase() !== selectedUser?.email.toLowerCase());

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
    if (!selectedUser || unresolved || employeeEmailMismatch) return;
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
    const invalid = validateDraft(draft, roles);
    if (invalid) {
      setFormError(invalid);
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
  const userEmployeeMismatchMessage = "This employee email differs from the login email. The current bank-core role-update service locates employees by login email, so this change is blocked to avoid creating or reassigning the wrong employee record.";
  const employeeEmailCollision = selectedUser && employees.find((employee) => employee.email.toLowerCase() === selectedUser.email.toLowerCase() && employee.userId !== selectedUser.userId);
  const employeeIdentityConflictMessage = employeeEmailMismatch
    ? userEmployeeMismatchMessage
    : employeeEmailCollision
      ? "An Employee record with this login email is linked to a different user UUID. Bank-core locates the Employee by email for this update, so the change is blocked to avoid reassigning another user's record."
      : undefined;
  return <>
    <SectionHeading eyebrow="Administrator workspace" title="User and access management">
      <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)} disabled={loading || busy}>
        {loading ? "Refreshing…" : "Refresh directories"}
      </button>
    </SectionHeading>

    <p className="card mb-5 text-sm">Bank-core is the authorization authority. These directories have no server-side search or pagination; searches below filter the loaded records locally. User status and Employee status are separate fields.</p>
    {loadError && <div className="error-box mb-5 grid gap-3" role="alert"><p>{loadError}</p><button type="button" className="button secondary w-fit" onClick={() => setReload((value) => value + 1)}>Try loading again</button></div>}
    {loading && <p role="status" className="card muted">Loading Admin user, role and employee directories…</p>}

    {!loading && !loadError && <div className="grid gap-5 xl:grid-cols-[minmax(21rem,0.85fr)_minmax(0,1.15fr)]">
      <section className="card grid content-start gap-4" aria-label="Admin directory">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose directory">
          <button type="button" role="tab" aria-selected={tab === "users"} className={`button ${tab === "users" ? "" : "secondary"}`} onClick={() => { setTab("users"); setSelectedEmployee(null); }}>Users</button>
          <button type="button" role="tab" aria-selected={tab === "employees"} className={`button ${tab === "employees" ? "" : "secondary"}`} onClick={() => { setTab("employees"); setSelectedEmployee(null); }}>Employees</button>
        </div>

        {tab === "users" && <>
          <div><h2 className="text-xl font-black">User directory</h2><p className="mt-1 muted">Search locally by username, email, role or user UUID.</p></div>
          <label htmlFor="admin-user-search" className="font-semibold">Search users</label>
          <input id="admin-user-search" className="field" type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Username, email, name, role or user UUID" />
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
        </>}

        {tab === "employees" && <>
          <div><h2 className="text-xl font-black">Employee directory</h2><p className="mt-1 muted">Bank-core returns all employees without server-side search or pagination.</p></div>
          <label htmlFor="admin-employee-search" className="font-semibold">Search employees</label>
          <input id="admin-employee-search" className="field" type="search" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Name, email, role, status or linked user UUID" />
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
        </>}
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
            if (user) void selectUser(user);
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
            <p className="mt-1">Bank-core has no Admin endpoint here to activate or deactivate the user login. The Employee status field only applies to the Employee record. Existing sessions can keep their earlier role claims until they expire; this role-change operation does not revoke sessions.</p>
          </div>

          {currentUsername === selectedUser.username && <p className="error-box" role="alert">You are changing your own account role. This request does not revoke your current session, which may continue to carry its existing Admin claim until expiry.</p>}
          {employeeIdentityConflictMessage && <p className="error-box" role="alert">{employeeIdentityConflictMessage}</p>}
          {userError === undefined && <button type="button" className="button w-fit" onClick={openRoleEditor} disabled={busy || Boolean(unresolved) || Boolean(employeeIdentityConflictMessage)}>Change role and employee access</button>}
          {selectedUser.isActive === false && <p className="muted text-sm">Bank-core has no Admin endpoint to activate or deactivate user logins; changing this user’s role does not change Login active.</p>}
          {notice && <p role="status" className="success-box">{notice}</p>}
          {warning && <div role="alert" className="error-box grid gap-3"><p>{warning}</p>{unresolved && <button type="button" className="button secondary w-fit" disabled={busy} onClick={() => void reconcile(unresolved)}>{reconciling ? "Checking state…" : "Check current user state"}</button>}</div>}

          {editorOpen && draft && <div className="grid gap-4 rounded-lg border border-slate-200 p-4" aria-label="Role change form">
            <div><h3 className="text-xl font-black">Role and Employee record</h3><p className="mt-1 text-sm muted">Bank-core requires every field below, even when the selected target role is CUSTOMER. For CUSTOMER it ignores these Employee fields and, if the user has a linked Employee record, marks it INACTIVE and unlinks it.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">First name<input className="field" maxLength={100} value={draft.firstName} onChange={(event) => setDraft((current) => current && ({ ...current, firstName: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Last name<input className="field" maxLength={100} value={draft.lastName} onChange={(event) => setDraft((current) => current && ({ ...current, lastName: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Login email<input className="field" type="email" value={draft.email} readOnly disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Phone<input className="field" maxLength={20} value={draft.phone} onChange={(event) => setDraft((current) => current && ({ ...current, phone: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Address<input className="field" value={draft.address} onChange={(event) => setDraft((current) => current && ({ ...current, address: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Target role<select className="field" value={draft.roleName} onChange={(event) => setDraft((current) => current && ({ ...current, roleName: event.target.value }))} disabled={busy}><option value="">Select a role from bank-core</option>{roles.map((role) => <option key={role.roleId} value={role.roleName}>{role.roleName}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Employee status<select className="field" value={draft.status} onChange={(event) => setDraft((current) => current && ({ ...current, status: event.target.value }))} disabled={busy}><option value="">Select status</option>{employeeStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Gender<select className="field" value={draft.gender} onChange={(event) => setDraft((current) => current && ({ ...current, gender: event.target.value }))} disabled={busy}><option value="">Select gender</option>{genders.map((gender) => <option key={gender} value={gender}>{gender}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Date of birth<input className="field" type="date" value={draft.dateOfBirth} onChange={(event) => setDraft((current) => current && ({ ...current, dateOfBirth: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Department<input className="field" maxLength={100} value={draft.department} onChange={(event) => setDraft((current) => current && ({ ...current, department: event.target.value }))} disabled={busy} /></label>
              <label className="grid gap-1 text-sm font-semibold">Manager employee UUID<select className="field" value={draft.managerId} onChange={(event) => setDraft((current) => current && ({ ...current, managerId: event.target.value }))} disabled={busy}><option value="">No change / not assigned</option>{managers.map((manager) => <option key={manager.employeeId} value={manager.employeeId}>{manager.firstName} {manager.lastName} · {manager.employeeId}</option>)}</select></label>
            </div>
            <p className="text-sm muted">Employee status does not deactivate the login. Leaving Manager blank preserves an existing manager association; bank-core has no clear-manager operation in this request.</p>
            {formError && <p role="alert" className="error-box">{formError}</p>}
            {Object.entries(formFieldErrors).map(([field, message]) => <p key={field} role="alert" className="error-box">{field}: {message}</p>)}
            <div className="flex flex-wrap gap-2"><button type="button" className="button" onClick={reviewRoleChange} disabled={busy || Boolean(unresolved)}>Review role change</button><button type="button" className="button ghost" onClick={() => { setEditorOpen(false); setReviewOpen(false); }} disabled={busy}>Cancel</button></div>
            {reviewOpen && <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4" role="region" aria-label="Confirm role change">
              <p className="font-bold">Confirm {roleName(selectedUser)} → {draft.roleName}</p>
              <p className="text-sm">The requested Employee status is {draft.status}. If the target role is CUSTOMER, bank-core will set a linked Employee record to INACTIVE and unlink it. Login active status is not changed. Existing sessions can keep their earlier role claims until expiry.</p>
              {currentUsername === selectedUser.username && <p className="text-sm font-bold">This is your own user account. Your current Admin session may continue with its current role claim.</p>}
              <div className="flex flex-wrap gap-2"><button type="button" className="button danger" onClick={() => void confirmRoleChange()} disabled={busy || Boolean(unresolved)}>{pending ? "Applying role change…" : reconciling ? "Checking current state…" : "Confirm role change"}</button><button type="button" className="button ghost" onClick={() => setReviewOpen(false)} disabled={busy}>Back to form</button></div>
            </div>}
          </div>}
        </section>}

        {!selectedUser && !detailEmployee && <p className="card muted">Select a user or employee to inspect the fields bank-core returns.</p>}
      </section>
    </div>}
  </>;
}
