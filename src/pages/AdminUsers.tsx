import { useMemo, useState } from "react";
import { PencilLine, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { confirmAdminAction } from "@/lib/adminActionToast";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import { RoleBadge } from "@/components/sentinel/Badges";
import { LoadingBlock } from "@/components/sentinel/States";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AdminUser, Role } from "@/lib/types";

export default function AdminUsers() {
  const accounts = usePolling<AdminUser[]>(() => sentinel.users(), 30000, []);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userForm, setUserForm] = useState<{ username: string; password: string; role: Role }>({
    username: "",
    password: "",
    role: "admin",
  });
  const [savingUser, setSavingUser] = useState(false);

  const directoryUsers = accounts.data ?? [];
  const adminUsers = useMemo(() => directoryUsers.filter(account => account.role === "admin"), [directoryUsers]);
  const analystUsers = useMemo(() => directoryUsers.filter(account => account.role === "analyst"), [directoryUsers]);

  const resetUserForm = () => {
    setEditingUser(null);
    setUserForm({ username: "", password: "", role: "admin" });
  };

  const beginEditUser = (account: AdminUser) => {
    setEditingUser(account);
    setUserForm({ username: account.username, password: "", role: account.role });
  };

  const performSaveUser = async (username: string, password: string) => {
    setSavingUser(true);
    try {
      if (editingUser) {
        await sentinel.updateUser(editingUser.id, {
          username,
          role: userForm.role,
          ...(password ? { password } : {}),
        });
        toast.success("User updated");
      } else {
        await sentinel.createUser({ username, password, role: userForm.role });
        toast.success("User created");
      }
      await accounts.refresh();
      resetUserForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save user");
    } finally {
      setSavingUser(false);
    }
  };

  const saveUser = async () => {
    const username = userForm.username.trim();
    const password = userForm.password.trim();
    if (!username) {
      toast.error("Username is required");
      return;
    }
    if (!editingUser && !password) {
      toast.error("Password is required for new accounts");
      return;
    }

    confirmAdminAction({
      action: editingUser ? "update" : "create",
      target: `user ${username}`,
      description: editingUser
        ? "Admin action required: update this account."
        : "Admin action required: create this account.",
      onConfirm: () => performSaveUser(username, password),
    });
  };

  const removeUser = async (account: AdminUser) => {
    confirmAdminAction({
      action: "delete",
      target: `user ${account.username}`,
      description: "This cannot be undone.",
      onConfirm: async () => {
    try {
      await sentinel.deleteUser(account.id);
      toast.success("User deleted");
      await accounts.refresh();
      if (editingUser?.id === account.id) {
        resetUserForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete user");
    }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Access Management</h1>
          <p className="text-sm text-muted-foreground">Create, update, and remove admin or analyst accounts.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <MiniStat label="Total" value={directoryUsers.length} />
          <MiniStat label="Admins" value={adminUsers.length} />
          <MiniStat label="Analysts" value={analystUsers.length} />
        </div>
      </div>

      <section className="kbn-panel">
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{editingUser ? "Edit account" : "Create account"}</p>
                <p className="text-xs text-muted-foreground">
                  {editingUser ? `Editing ${editingUser.username}` : "Add a new admin or analyst account."}
                </p>
              </div>
              {editingUser && (
                <Button variant="ghost" size="sm" onClick={resetUserForm}>
                  <X className="mr-2 h-4 w-4" />Cancel
                </Button>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-user-name">Username</Label>
                <Input
                  id="admin-user-name"
                  value={userForm.username}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, username: event.target.value }))}
                  placeholder="e.g. admin.ops"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-user-pass">Password</Label>
                <Input
                  id="admin-user-pass"
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder={editingUser ? "Leave blank to keep current password" : "Enter a password"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={userForm.role} onValueChange={(value) => setUserForm((prev) => ({ ...prev, role: value as Role }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={saveUser} disabled={savingUser} className="gap-2">
                  {editingUser ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingUser ? "Update account" : "Create account"}
                </Button>
                <Button type="button" variant="outline" onClick={resetUserForm}>
                  Reset
                </Button>
              </div>
            </div>

            {accounts.error && (
              <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                {accounts.error}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-sm font-semibold">User Directory</h3>
                <p className="text-xs text-muted-foreground">Account IDs, roles, and creation times.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => accounts.refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />Refresh
              </Button>
            </div>

            {accounts.loading ? (
              <LoadingBlock className="m-4" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admin ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {directoryUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No admin or analyst accounts found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      directoryUsers.map((account) => {
                        const isLocked = typeof account.lockUntil === "number" && account.lockUntil > Date.now() / 1000;
                        return (
                          <TableRow key={account.id}>
                            <TableCell className="font-mono text-xs">{account.id}</TableCell>
                            <TableCell className="font-medium">{account.username}</TableCell>
                            <TableCell><RoleBadge role={account.role} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatUserTimestamp(account.createdAt)}</TableCell>
                            <TableCell>
                              <span className={isLocked ? "rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning" : "rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success"}>
                                {isLocked ? "Locked" : "Active"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => beginEditUser(account)} aria-label={`Edit ${account.username}`}>
                                  <PencilLine className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => removeUser(account)} aria-label={`Delete ${account.username}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function formatUserTimestamp(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, "PP p");
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-left">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
