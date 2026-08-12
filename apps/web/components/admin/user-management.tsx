"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, KeyRound, PencilLine, Plus, Search, Trash2 } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createAdminUser, deleteAdminUser, fetchAdminBranches, fetchAdminPermissions, fetchAdminUsers, updateAdminUser } from "@/lib/admin-client";
import type { AdminUser, Branch } from "@/lib/types";
import { cn } from "@/lib/utils";

type UserFormState = {
  username: string;
  password: string;
  roleCode: "SUPER_ADMIN" | "POS_STAFF" | "";
  branchId: string;
  permissionKeys: string[];
};

const emptyForm: UserFormState = {
  username: "",
  password: "",
  roleCode: "POS_STAFF",
  branchId: "",
  permissionKeys: []
};

const roleOptions: Array<{ value: UserFormState["roleCode"]; label: string; description: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin", description: "Full platform access." },
  { value: "POS_STAFF", label: "Staff", description: "Only the selected tabs and POS access." }
];

function formatRelativeDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: "Asia/Karachi",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<Array<{ key: string; label: string; routePrefix: string; permissionGroup: string; sortOrder: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);

  async function loadUsers() {
    try {
      setError("");
      const nextUsers = await fetchAdminUsers({ search: search.trim() || undefined });
      setUsers(nextUsers);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBranches() {
    try {
      const data = await fetchAdminBranches();
      setBranches(data.branches);
      setForm((current) => ({ ...current, branchId: current.branchId || data.primaryBranchId || data.branches[0]?.id || "" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load branches.");
    }
  }

  async function loadPermissions() {
    try {
      setPermissions(await fetchAdminPermissions());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load permissions.");
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [search]);

  useEffect(() => {
    void loadBranches();
    void loadPermissions();
  }, []);

  const counts = useMemo(() => {
    return {
      active: users.filter((user) => user.isActive).length,
      staff: users.filter((user) => user.roleCode === "POS_STAFF").length,
      admins: users.filter((user) => user.roleCode === "SUPER_ADMIN").length
    };
  }, [users]);

  function openCreate() {
    setEditingUser(null);
    setForm({ ...emptyForm, branchId: branches[0]?.id ?? "" });
    setPermissionDraft([]);
    setPermissionsOpen(false);
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: "",
      roleCode: user.roleCode === "CUSTOMER" ? "POS_STAFF" : user.roleCode,
      branchId: user.branchId ?? branches[0]?.id ?? "",
      permissionKeys: user.permissionKeys ?? []
    });
    setPermissionDraft(user.permissionKeys ?? []);
    setPermissionsOpen(false);
  }

  function openPermissionPicker() {
    setPermissionDraft(form.permissionKeys);
    setPermissionsOpen(true);
  }

  function cancelPermissionPicker() {
    setPermissionDraft(form.permissionKeys);
    setPermissionsOpen(false);
  }

  function savePermissionPicker() {
    setForm((current) => ({ ...current, permissionKeys: permissionDraft }));
    setPermissionsOpen(false);
  }

  async function submitUser() {
    setSaving(true);
    setError("");
    try {
      if (!form.username.trim() || !form.roleCode) {
        throw new Error("Username and role are required.");
      }

      if (!editingUser && !form.password.trim()) {
        throw new Error("Password is required for new accounts.");
      }

      if (form.roleCode !== "SUPER_ADMIN" && !form.branchId) {
        throw new Error("Select a branch for this user.");
      }

      if (editingUser) {
        await updateAdminUser(editingUser.id, {
          username: form.username,
          roleCode: form.roleCode,
          branchId: form.roleCode === "SUPER_ADMIN" ? "" : form.branchId,
          permissionKeys: form.roleCode === "SUPER_ADMIN" ? [] : form.permissionKeys,
          ...(form.password.trim() ? { password: form.password } : {})
        });
        setNotice("User updated.");
      } else {
        await createAdminUser({
          username: form.username,
          password: form.password,
          roleCode: form.roleCode,
          branchId: form.roleCode === "SUPER_ADMIN" ? "" : form.branchId,
          permissionKeys: form.roleCode === "SUPER_ADMIN" ? [] : form.permissionKeys
        });
        setNotice("User created.");
      }

      setForm(emptyForm);
      setEditingUser(null);
      setPermissionsOpen(false);
      await loadUsers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(user: AdminUser) {
    const confirmed = window.confirm(`Deactivate ${user.name}? They will no longer be able to sign in.`);
    if (!confirmed) return;

    setError("");
    try {
      await deleteAdminUser(user.id);
      setNotice("User deactivated.");
      await loadUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to deactivate user.");
    }
  }

  return (
    <div className="space-y-6">
      {notice ? <AdminToast message={notice} variant="success" onClose={() => setNotice("")} /> : null}
      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} className={notice ? "top-20" : "top-4"} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Accounts</p>
          <p className="mt-2 text-3xl font-black text-pocket-navy">{users.length}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Managed admin and staff accounts.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Active</p>
          <p className="mt-2 text-3xl font-black text-pocket-navy">{counts.active}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">Accounts currently able to sign in.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Staff</p>
          <p className="mt-2 text-3xl font-black text-pocket-navy">{counts.staff}</p>
          <p className="mt-2 text-sm text-pocket-navy/60">POS staff with limited access.</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">User control</p>
            <h2 className="mt-2 text-2xl font-black text-pocket-navy">Manage admin and staff accounts</h2>
            <p className="mt-1 text-sm text-pocket-navy/60">Add users, update roles, and deactivate accounts without touching customer records.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/40" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search name, username, or phone"
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{editingUser ? "Edit user" : "Create user"}</p>
              <h3 className="mt-2 text-xl font-black text-pocket-navy">{editingUser ? editingUser.name : "New account"}</h3>
            </div>
            {editingUser ? (
              <Button variant="ghost" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Role</label>
              <select
                value={form.roleCode}
                onChange={(event) => setForm((current) => ({ ...current, roleCode: event.target.value as UserFormState["roleCode"] }))}
                className="h-11 w-full rounded-xl border border-pocket-navy/10 bg-white px-3 text-sm"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Username"
                autoComplete="off"
                spellCheck={false}
              />
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingUser ? "Leave blank to keep password" : "Password"}
                autoComplete="new-password"
              />
            </div>
            {form.roleCode === "POS_STAFF" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Branch</label>
                  <select
                    value={form.branchId}
                    onChange={(event) => setForm((current) => ({ ...current, branchId: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-pocket-navy/10 bg-white px-3 text-sm"
                  >
                    <option value="">Select branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Allowed sections</label>
                  <button
                    type="button"
                    onClick={openPermissionPicker}
                    className="flex h-11 w-full items-center justify-between rounded-xl border border-pocket-navy/10 bg-white px-3 text-left text-sm text-pocket-navy"
                  >
                    <span className="truncate">{form.permissionKeys.length ? `${form.permissionKeys.length} sections selected` : "Select sections"}</span>
                    <ChevronDown className="h-4 w-4 text-pocket-navy/50" />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void submitUser()} disabled={saving}>
                <KeyRound className="h-4 w-4" />
                {saving ? "Saving..." : editingUser ? "Update user" : "Create user"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setForm(emptyForm)}>
                Reset
              </Button>
            </div>
          </div>
        </Card>

        {permissionsOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/40 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="permission-picker-title">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-panel" onClick={(event) => event.stopPropagation()}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Staff access</p>
                <h2 id="permission-picker-title" className="mt-2 text-2xl font-black text-pocket-navy">Choose allowed sections</h2>
                <p className="mt-1 text-sm text-pocket-navy/60">POS includes the terminal, queue, POS orders, editing, deletion, and receipts.</p>
              </div>
              <div className="mt-5 grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {permissions.map((permission) => {
                  const selected = permissionDraft.includes(permission.key);
                  return (
                    <label key={permission.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-pocket-navy/10 px-3 py-3 text-sm font-semibold text-pocket-navy hover:bg-pocket-cream">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setPermissionDraft((current) => selected ? current.filter((key) => key !== permission.key) : [...current, permission.key])}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span>{permission.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={cancelPermissionPicker}>Cancel</Button>
                <Button type="button" onClick={savePermissionPicker}>Save</Button>
              </div>
            </div>
          </div>
        ) : null}

        <Card className="overflow-hidden">
          <div className="border-b border-pocket-navy/10 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Accounts</p>
          </div>
          <div className="max-h-[72vh] overflow-auto">
            {loading ? (
              <div className="p-5 text-sm text-pocket-navy/60">Loading users...</div>
            ) : users.length ? (
              <div className="divide-y divide-pocket-navy/10">
                {users.map((user) => (
                  <div key={user.id} className={cn("grid gap-4 px-5 py-4 md:grid-cols-[1.1fr_0.8fr_0.7fr_auto] md:items-center", !user.isActive && "bg-red-50/60")}>
                    <div>
                      <p className="font-semibold text-pocket-navy">{user.name}</p>
                      <p className="text-sm text-pocket-navy/60">@{user.username}</p>
                      {user.phone ? <p className="text-sm text-pocket-navy/60">{user.phone}</p> : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-pocket-navy">{user.roleLabel}</p>
                      <p className="text-xs text-pocket-navy/60">{user.isActive ? "Active" : "Disabled"}</p>
                      {user.roleCode === "SUPER_ADMIN" ? (
                        <p className="mt-1 text-xs text-pocket-navy/60">All branches</p>
                      ) : user.branchName ? (
                        <p className="mt-1 text-xs text-pocket-navy/60">{user.branchName}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-pocket-navy/60">
                        {user.roleCode === "SUPER_ADMIN" ? "All sections" : user.permissions?.length ? user.permissions.map((permission) => permission.label).join(", ") : "No sections assigned"}
                      </p>
                    </div>
                    <div className="text-sm text-pocket-navy/60">
                      <p>{user.lastLoginAt ? formatRelativeDate(user.lastLoginAt) : "Never logged in"}</p>
                      <p className="mt-1 text-xs">Created {formatRelativeDate(user.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(user)}>
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => void removeUser(user)}>
                        <Trash2 className="h-4 w-4" />
                        Deactivate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 text-sm text-pocket-navy/60">No users match the current search.</div>
            )}
          </div>
        </Card>
      </div>

      <div className="text-xs text-pocket-navy/60">
        Staff accounts are restricted to the routes you allow them to use. This screen only manages admin-side login accounts.
      </div>
    </div>
  );
}
