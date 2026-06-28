"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageHeader,
  UserManagementTable,
  UserActionsMenu,
  AddUserButton,
  useLanguage,
  type AdminUser,
} from "@togo-framework/ui";
import { adminUsers } from "@/lib/admin-users";
import { setImpersonation } from "@/lib/impersonation";
import { trans } from "@/lib/i18n";

export default function AdminUsersPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      setUsers(await adminUsers.list());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function impersonate(u: AdminUser) {
    const r = await adminUsers.impersonate(u.id!);
    setImpersonation({
      id: u.id ?? r.identity?.id ?? "",
      email: u.email ?? r.identity?.email ?? "",
      token: r.token,
    });
    router.push("/admin");
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        title={trans("admin.users", "Users")}
        description={trans("admin.users_subtitle", "Accounts managed by the togo auth plugin")}
        actions={<AddUserButton language={language} onSubmit={async (input) => { await adminUsers.create(input); await refresh(); }} />}
      />

      {err && <p className="my-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}

      <div className="mt-6">
        <UserManagementTable
          users={users ?? []}
          loading={users === null}
          language={language}
          onRowClick={(u) => u.id && router.push(`/admin/users/${u.id}`)}
          emptyTitle={trans("admin.no_users", "No users")}
          emptyDescription={trans("admin.no_users_desc", "New sign-ups and accounts created here will appear in this list.")}
          renderActions={(u) => (
            <UserActionsMenu
              user={u}
              language={language}
              onEdit={async (input) => { await adminUsers.update(u.id!, input); await refresh(); }}
              onImpersonate={() => impersonate(u)}
              onResetPassword={({ password }) => adminUsers.resetPassword(u.id!, password)}
              onSendMagicLink={() => adminUsers.magicLink(u.id!)}
              onDelete={async () => { await adminUsers.remove(u.id!); await refresh(); }}
            />
          )}
        />
      </div>
    </div>
  );
}
