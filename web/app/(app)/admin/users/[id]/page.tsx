"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ShieldCheck, KeyRound, ArrowLeft, Link2, Trash2, UserCog } from "lucide-react";
import {
  PageHeader, Card, CardHeader, CardTitle, CardContent, EmptyState, LoadingState, Badge, Avatar,
  Button, ConfirmButton, CopyButton, Input, toast,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@fadymondy/nasaq/web";
import { adminUsers, type AdminUser, type AdminLinkResult } from "@/lib/admin-users";
import { setImpersonation, useImpersonation } from "@/lib/impersonation";
import { ForbiddenState } from "@/components/forbidden-state";
import { isForbidden, isUnauthorized, messageOf } from "@/lib/http-error";
import { trans } from "@/lib/i18n";
import { ImpersonationBlocked } from "@/components/impersonation-blocked";

function Chips({ items, empty, mono }: { items: string[]; empty: string; mono?: boolean }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => <Badge key={x} variant="neutral" className={mono ? "font-mono" : ""}>{x}</Badge>)}
    </div>
  );
}

function AdminUserDetailPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [link, setLink] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    adminUsers.get(id).then((u) => { if (live) setUser(u); }).catch((e: unknown) => {
      if (!live) return;
      setUser(null);
      if (isUnauthorized(e)) router.replace("/login");
      else if (isForbidden(e)) setForbidden(true);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, router]);

  const fail = (e: unknown) => {
    if (isForbidden(e)) setForbidden(true);
    else toast.error(messageOf(e));
  };

  // Reset and magic links are refused (403) for an administrator target unless the server sets
  // AUTH_IMPERSONATE_ADMINS. The caller is still a signed-in administrator, so this is a
  // per-action refusal, not a forbidden page.
  const failLink = (e: unknown) => {
    if (isForbidden(e)) toast.error(trans("admin.link_refused", "The server refuses this for an administrator account."));
    else fail(e);
  };

  // A link the backend could not email is shown so the admin can pass it on.
  function deliver(r: AdminLinkResult, title: string) {
    if (r.emailed) toast.success(trans("admin.email_sent", "Email sent"));
    else if (r.link) setLink({ title, url: r.link });
  }

  async function impersonate(u: AdminUser) {
    try {
      const r = await adminUsers.impersonate(u.id!);
      setImpersonation({
        id: u.id ?? r.identity?.id ?? "",
        email: u.email ?? r.identity?.email ?? "",
        token: r.token,
        expiresAt: r.expires_at,
      });
      router.push("/admin");
    } catch (e) { fail(e); }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="rtl:rotate-180" /> {trans("admin.back_to_users", "Back to users")}
        </Button>
      </div>

      <PageHeader
        title={user?.email ?? (loading ? trans("common.loading", "Loading…") : trans("admin.user", "User"))}
        description={trans("admin.users_subtitle", "Accounts managed by the togo auth plugin")}
        actions={
          user ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => impersonate(user)}><UserCog />{trans("admin.impersonate", "Impersonate")}</Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try { deliver(await adminUsers.resetPassword(user.id!), trans("admin.reset_link", "Password reset link")); }
                  catch (e) { failLink(e); }
                }}
              >
                <KeyRound />{trans("admin.reset_password", "Reset password")}
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try { deliver(await adminUsers.magicLink(user.id!), trans("admin.magic_link", "Magic link")); }
                  catch (e) { failLink(e); }
                }}
              >
                <Link2 />{trans("admin.send_magic_link", "Send magic link")}
              </Button>
              <ConfirmButton
                title={`${trans("admin.delete", "Delete")} ${user.email}?`}
                description={trans("admin.delete_user_desc", "The account and its sessions are removed. This cannot be undone.")}
                confirmLabel={trans("admin.delete", "Delete")}
                onConfirm={async () => {
                  try { await adminUsers.remove(user.id!); router.push("/admin/users"); }
                  catch (e) { fail(e); }
                }}
              >
                <Trash2 />{trans("admin.delete", "Delete")}
              </ConfirmButton>
            </div>
          ) : undefined
        }
      />

      {forbidden ? (
        <ForbiddenState />
      ) : loading && !user ? (
        <LoadingState />
      ) : !user ? (
        <EmptyState className="py-16" title={trans("admin.user_not_found", "User not found")} icon={Users} />
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent className="flex flex-col items-center gap-3 text-center">
              <Avatar name={user.email} size="lg" />
              <div className="min-w-0">
                <div className="truncate font-medium" dir="ltr">{user.email}</div>
                <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">{user.id}</div>
              </div>
              {user.created_at ? (
                <div className="text-xs text-muted-foreground">
                  {trans("admin.joined", "Joined")} {new Date(user.created_at).toLocaleDateString()}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-6 md:col-span-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4" />{trans("admin.roles", "Roles")}</CardTitle></CardHeader>
              <CardContent><Chips items={user.roles ?? []} empty={trans("admin.no_roles", "No roles assigned")} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" />{trans("admin.permissions", "Permissions")}</CardTitle></CardHeader>
              <CardContent><Chips items={user.permissions ?? []} empty={trans("admin.no_perms", "No direct permissions")} mono /></CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={!!link} onOpenChange={(o) => { if (!o) setLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{link?.title}</DialogTitle>
            <DialogDescription>{trans("admin.share_link", "Mail is not configured, so share this link yourself.")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={link?.url ?? ""} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={link?.url ?? ""} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const imp = useImpersonation();
  if (imp) return <ImpersonationBlocked title={trans("admin.users", "Users")} />;
  return <AdminUserDetailPageInner params={params}/>;
}
