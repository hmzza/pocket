"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, PencilLine, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createAdminUser, deleteAdminUser, fetchAdminUsers, updateAdminUser } from "@/lib/admin-client";
import type { AdminUser } from "@/lib/types";
import { cn } from "@/lib/utils";

type UserFormState = {
  name: string;
  username: string;
  phone: string;
  password: string;
  roleCode: AdminUser["roleCode"] | "";
  isActive: boolean;
  canAccessAdmin: boolean;
  canAccessPos: boolean;
};

const emptyForm: UserFormState = {
  name: "",
  username: "",
  phone: "",
  password: "",
  roleCode: "POS_STAFF",
  isActive: true,
  canAccessAdmin: false,
  canAccessPos: true
};

const roleOptions: Array<{ value: UserFormState["roleCode"]; label: string; description: string }> = [
  { value: "SUPER_ADMIN", label: "Super Admin", description: "Full platform access." },
  { value: "ADMIN", label: "Admin", description: "Manage website, orders, finances, inventory." },
  { value: "POS_STAFF", label: "Staff", description: "Orders, expenses, inventory, today's dashboard." }
];

function formatRelativeDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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

  useEffect(() => {
    void loadUsers();
  }, [search]);

  const counts = useMemo(() => {
    return {
      active: users.filter((user) => user.isActive).length,
      staff: users.filter((user) => user.roleCode === "POS_STAFF").length,
      admins: users.filter((user) => user.roleCode !== "POS_STAFF").length
    };
  }, [users]);

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm);
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setForm({
      name: user.name,
      username: user.username,
      phone: user.phone ?? "",
      password: "",
      roleCode: user.roleCode,
      isActive: user.isActive,
      canAccessAdmin: user.canAccessAdmin,
      canAccessPos: user.canAccessPos
    });
  }

  async function submitUser() {
    setSaving(true);
    setError("");
    try {
      if (!form.name.trim() || !form.username.trim() || !form.roleCode) {
        throw new Error("Name, username, and role are required.");
      }

      if (!editingUser && !form.password.trim()) {
        throw new Error("Password is required for new accounts.");
      }

      if (!form.canAccessAdmin && !form.canAccessPos) {
        throw new Error("Select at least one access option.");
      }

      if (editingUser) {
        await updateAdminUser(editingUser.id, {
          name: form.name,
          username: form.username,
          phone: form.phone,
          roleCode: form.roleCode,
          isActive: form.isActive,
          canAccessAdmin: form.canAccessAdmin,
          canAccessPos: form.canAccessPos,
          ...(form.password.trim() ? { password: form.password } : {})
        });
        setNotice("User updated.");
      } else {
        await createAdminUser({
          name: form.name,
          username: form.username,
          phone: form.phone,
          password: form.password,
          roleCode: form.roleCode,
          isActive: form.isActive,
          canAccessAdmin: form.canAccessAdmin,
          canAccessPos: form.canAccessPos
        });
        setNotice("User created.");
      }

      setForm(emptyForm);
      setEditingUser(null);
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
            <Button type="button" onClick={openCreate}>
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Full name" />
              <Input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Username"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingUser ? "Leave blank to keep password" : "Password"}
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="flex items-end gap-2 rounded-xl border border-pocket-navy/10 bg-pocket-cream px-3 py-2">
                <input
                  id="user-active"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <label htmlFor="user-active" className="text-sm font-semibold text-pocket-navy">
                  Account active
                </label>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-pocket-navy/10 bg-white px-3 py-3 text-sm font-semibold text-pocket-navy">
                <input
                  type="checkbox"
                  checked={form.canAccessAdmin}
                  onChange={(event) => setForm((current) => ({ ...current, canAccessAdmin: event.target.checked }))}
                />
                Admin dashboard access
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-pocket-navy/10 bg-white px-3 py-3 text-sm font-semibold text-pocket-navy">
                <input
                  type="checkbox"
                  checked={form.canAccessPos}
                  onChange={(event) => setForm((current) => ({ ...current, canAccessPos: event.target.checked }))}
                />
                POS access
              </label>
            </div>
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
                      <p className="mt-1 text-xs text-pocket-navy/60">
                        {user.canAccessAdmin ? "Admin" : "No admin"} · {user.canAccessPos ? "POS" : "No POS"}
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
