"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import {
  PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, Badge,
  Avatar, AvatarFallback, UserActionsMenu, useLanguage, type AdminUser,
} from "@togo-framework/ui";
import { adminUsers } from "@/lib/admin-users";
import { setImpersonation } from "@/lib/impersonation";
import { trans } from "@/lib/i18n";

function Chips({ items, empty, mono }: { items: string[]; empty: string; mono?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => <Badge key={x} variant="secondary" className={mono ? "font-mono" : ""}>{x}</Badge>)}
    </div>
  );
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { language } = useLanguage();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await adminUsers.get(id));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    <div className="mx-auto max-w-4xl p-8">
      <button
        type="button"
        onClick={() => router.push("/admin/users")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {trans("admin.back_to_users", "Back to users")}
      </button>

      <PageHeader
        title={user?.email ?? (loading ? trans("common.loading", "Loading…") : trans("admin.user", "User"))}
        description={trans("admin.users_subtitle", "Accounts managed by the togo auth plugin")}
        actions={
          user ? (
            <UserActionsMenu
              user={user}
              language={language}
              asToolbar
              onEdit={async (input) => { await adminUsers.update(user.id!, input); await refresh(); }}
              onImpersonate={() => impersonate(user)}
              onResetPassword={({ password }) => adminUsers.resetPassword(user.id!, password)}
              onSendMagicLink={() => adminUsers.magicLink(user.id!)}
              onDelete={async () => { await adminUsers.remove(user.id!); router.push("/admin/users"); }}
            />
          ) : undefined
        }
      />

      {!user && !loading ? (
        <EmptyState className="py-16" title={trans("admin.user_not_found", "User not found")} icon={<Users className="h-7 w-7" />} />
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Avatar className="h-16 w-16"><AvatarFallback className="text-xl">{(user?.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium" dir="ltr">{user?.email}</div>
                <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">{user?.id}</div>
              </div>
              {user?.created_at ? (
                <div className="text-xs text-muted-foreground">
                  {trans("admin.joined", "Joined")} {new Date(user.created_at).toLocaleDateString()}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <div className="space-y-6 md:col-span-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />{trans("admin.roles", "Roles")}</CardTitle></CardHeader>
              <CardContent><Chips items={user?.roles ?? []} empty={trans("admin.no_roles", "No roles assigned")} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />{trans("admin.permissions", "Permissions")}</CardTitle></CardHeader>
              <CardContent><Chips items={user?.permissions ?? []} empty={trans("admin.no_perms", "No direct permissions")} mono /></CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
