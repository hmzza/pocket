import { AdminShell } from "@/components/admin/admin-shell";
import { UserManagement } from "@/components/admin/user-management";

export default function AdminUsersPage() {
  return (
    <AdminShell title="Users" description="Manage admin and staff logins, roles, and account status.">
      <UserManagement />
    </AdminShell>
  );
}
