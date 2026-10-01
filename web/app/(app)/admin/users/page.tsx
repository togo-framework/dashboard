"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2 } from "lucide-react";
import {
  PageHeader, AdminUsers, ErrorState, Badge, Button, ConfirmButton, CopyButton, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, toast,
  type ManagedUser, type ManagedRole,
} from "@fadymondy/nasaq/web";
import { adminUsers, AdminError, type AdminUser, type AdminLinkResult } from "@/lib/admin-users";
import { setImpersonation } from "@/lib/impersonation";
import { auth } from "@/lib/auth";
import { trans } from "@/lib/i18n";

const errorOf = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });

function toManaged(u: AdminUser): ManagedUser {
  return {
    id: String(u.id),
    name: u.email.split("@")[0],
    email: u.email,
    roles: u.roles?.length ? u.roles : ["user"],
    status: "active",
    verified: true,
    createdAt: u.created_at ?? new Date(0).toISOString(),
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [meEmail, setMeEmail] = useState<string>();
  const [open, setOpen] = useState<ManagedUser | null>(null);
  const [link, setLink] = useState<{ title: string; url: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await adminUsers.list());
      setError(null);
    } catch (e) {
      if (e instanceof AdminError && (e.status === 404 || e.status === 501)) setAvailable(false);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    auth.me().then((m) => setMeEmail(m?.email));
  }, [reload]);

  const managed = useMemo(() => users.map(toManaged), [users]);
  const roles = useMemo<ManagedRole[]>(() => {
    const ids = new Set(["admin", "user", ...users.flatMap((u) => u.roles ?? [])]);
    return [...ids].map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));
  }, [users]);
  const currentUserId = managed.find((u) => u.email === meEmail)?.id;

  // A link the backend could not email is shown so the admin can pass it on.
  function deliver(r: AdminLinkResult, title: string) {
    if (r.emailed) toast.success(trans("admin.email_sent", "Email sent"));
    else if (r.link) setLink({ title, url: r.link });
  }

  if (!available) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={trans("admin.users", "Users")} />
        <ErrorState
          title={trans("admin.api_unavailable", "Admin API unavailable")}
          description={trans("admin.api_unavailable_desc", "Install the auth backend with `togo install togo-framework/auth`.")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={trans("admin.users", "Users")}
        description={trans("admin.users_subtitle", "Accounts managed by the togo auth plugin")}
      />

      <AdminUsers
        users={managed}
        roles={roles}
        currentUserId={currentUserId}
        loading={loading}
        error={error}
        onRetry={reload}
        onAddUser={async (v) => {
          try {
            const { id } = await adminUsers.create({ email: v.email, roles: v.roles });
            toast.success(trans("admin.user_created", "User created"));
            if (v.sendInvite && id) deliver(await adminUsers.magicLink(id), trans("admin.invite_link", "Invite link"));
            await reload();
          } catch (e) { return errorOf(e); }
        }}
        onResetPassword={async (u) => {
          try { deliver(await adminUsers.resetPassword(u.id), trans("admin.reset_link", "Password reset link")); }
          catch (e) { return errorOf(e); }
        }}
        onImpersonate={async (u) => {
          try {
            const r = await adminUsers.impersonate(u.id);
            setImpersonation({ id: u.id, email: u.email, token: r.token });
            router.push("/admin");
          } catch (e) { return errorOf(e); }
        }}
        onUpdateRoles={async (u, next) => {
          try {
            await adminUsers.update(u.id, { roles: next });
            toast.success(trans("admin.roles_updated", "Roles updated"));
            await reload();
          } catch (e) { return errorOf(e); }
        }}
        onOpenUser={setOpen}
      />

      {/* Actions AdminUsers has no slot for: details, magic link, delete. */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open?.name}</DialogTitle>
            <DialogDescription dir="ltr">{open?.email}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {open?.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => open && router.push(`/admin/users/${open.id}`)}>
              {trans("admin.view_details", "View details")}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!open) return;
                try { deliver(await adminUsers.magicLink(open.id), trans("admin.magic_link", "Magic link")); setOpen(null); }
                catch (e) { toast.error(errorOf(e).error); }
              }}
            >
              <Link2 /> {trans("admin.send_magic_link", "Send magic link")}
            </Button>
            {open && open.id !== currentUserId && (
              <ConfirmButton
                title={`${trans("admin.delete", "Delete")} ${open.email}?`}
                description={trans("admin.delete_user_desc", "The account and its sessions are removed. This cannot be undone.")}
                confirmLabel={trans("admin.delete", "Delete")}
                onConfirm={async () => {
                  try {
                    await adminUsers.remove(open.id);
                    toast.success(trans("admin.user_deleted", "User deleted"));
                    setOpen(null);
                    await reload();
                  } catch (e) { toast.error(errorOf(e).error); }
                }}
              >
                <Trash2 /> {trans("admin.delete", "Delete")}
              </ConfirmButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
