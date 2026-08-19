import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Shield, ShieldAlert, Coins, Plus, UserCircle } from "lucide-react";
import { Badge, SubmitButton, TextInput, Panel } from "@/components/ui";
import { SectionHeader } from "@/components/dashboard-kit";
import { formatDate } from "@/lib/format";
import type { AdminUser } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Action = { path: string; method?: "POST" | "PUT" | "PATCH" | "DELETE"; body?: Record<string, unknown> };

function Select({ name, options, defaultValue, testId }: { name: string; options: {label: string, value: string}[]; defaultValue?: string; testId?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} data-testid={testId} className="h-10 w-full rounded-md border border-line bg-panel-strong px-3 text-sm text-foreground outline-none transition focus:border-accent">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ActionFormDialog({
  title, description, trigger, onSubmit, danger, children, pending, testId
}: {
  title: string;
  description: string;
  trigger: React.ReactNode;
  onSubmit: (f: FormData) => void;
  danger?: boolean;
  children?: React.ReactNode;
  pending?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content data-testid={`dialog-${testId || 'action'}`} className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-lg border border-line bg-panel p-6 shadow-[var(--shadow-soft)]">
          <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">{description}</Dialog.Description>
          <form data-testid={`form-${testId || 'action'}`} className="mt-4 grid gap-4" onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
            setOpen(false);
          }}>
            {children}
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className="rounded-md border border-line bg-panel-strong px-3 py-2 text-sm font-medium hover:bg-line/50 transition">Cancel</button>
              </Dialog.Close>
              <SubmitButton tone={danger ? "danger" : "primary"} disabled={pending}>Confirm</SubmitButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatPlan(key: string) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function PlanDisplay({ user }: { user: AdminUser }) {
  const sub = user.subscriptions?.[0];
  const override = user.access_plan_overrides?.find(o => o.active);
  
  if (override) {
    return (
      <div className="flex flex-col" data-testid={`plan-override-${user.id}`}>
        <span className="font-semibold text-accent">{formatPlan(override.plan_key)}</span>
        <span className="text-[10px] text-muted uppercase tracking-wider">Override Active</span>
      </div>
    );
  }
  
  if (sub) {
    return (
      <div className="flex flex-col" data-testid={`plan-stripe-${user.id}`}>
        <span className="font-semibold text-foreground">{formatPlan(sub.plan_key)}</span>
        <span className="text-[10px] text-muted uppercase tracking-wider">Stripe &middot; {sub.status}</span>
      </div>
    );
  }
  
  return <span className="text-muted text-[13px]" data-testid={`plan-free-${user.id}`}>Free Flight</span>;
}

function RoleBadge({ role }: { role: string }) {
  if (role === "owner") return <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning" data-testid="role-owner"><ShieldAlert size={10} /> Owner</span>;
  if (role === "admin") return <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent" data-testid="role-admin"><Shield size={10} /> Admin</span>;
  return <span className="inline-flex items-center gap-1 rounded bg-line/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted" data-testid="role-user"><UserCircle size={10} /> User</span>;
}

function UserControls({ user, ledger, owner, run, pending }: { user: AdminUser, ledger: any[], owner: boolean, run: (a: Action) => void, pending: boolean }) {
  const btnClass = "inline-flex h-8 items-center justify-center rounded border border-line bg-panel px-3 text-xs font-medium text-foreground hover:border-accent hover:text-accent transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-line disabled:hover:text-foreground";
  
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 p-2" data-testid={`controls-${user.id}`}>
      {/* Credit Ops */}
      <div className="space-y-4">
         <div>
           <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-2 mb-3">
             <Coins size={13} /> Credit Operations
           </h4>
           <div className="flex gap-2">
             <ActionFormDialog
               testId={`credits-${user.id}`}
               title="Adjust Pilot Credits"
               description={`Modify credit balance for ${user.email}.`}
               trigger={<button className={btnClass} data-testid={`btn-adjust-credits-${user.id}`}>Adjust Balance</button>}
               onSubmit={(f) => run({ path: `/admin/users/${user.id}/credits`, method: "POST", body: { amount: Number(f.get("amount")), reason: f.get("reason"), idempotencyKey: crypto.randomUUID() } })}
               pending={pending}
             >
                <TextInput name="amount" type="number" required placeholder="Amount (e.g. 500 or -100)" data-testid="input-credit-amount" />
                <TextInput name="reason" required placeholder="Audit justification" data-testid="input-credit-reason" />
             </ActionFormDialog>
           </div>
         </div>
         
         <details className="group">
           <summary className="text-xs text-accent cursor-pointer font-medium hover:underline flex items-center gap-1 select-none" data-testid={`ledger-toggle-${user.id}`}>
             Credit Ledger ({ledger.length} entries)
           </summary>
           <div className="mt-2 max-h-40 overflow-y-auto rounded border border-line/50 bg-panel p-2 shadow-inner">
             {ledger.length === 0 ? (
               <p className="text-[11px] text-muted">No credit history.</p>
             ) : (
               <ul className="space-y-1">
                 {ledger.map((l, i) => (
                   <li key={i} className="flex justify-between text-[11px] border-b border-line/30 pb-1 last:border-0 last:pb-0" data-testid={`ledger-entry-${user.id}-${i}`}>
                     <span className="text-muted">{formatDate(l.created_at)}</span>
                     <span className={l.amount > 0 ? "text-ok font-mono" : l.amount < 0 ? "text-danger font-mono" : "text-foreground font-mono"}>
                       {l.amount > 0 ? "+" : ""}{l.amount}
                     </span>
                     <span className="text-muted truncate max-w-[120px]" title={l.reason_code}>{l.reason_code}</span>
                   </li>
                 ))}
               </ul>
             )}
           </div>
         </details>
      </div>
      
      {/* Platform Owner Ops */}
      <div className="space-y-3 border-t xl:border-t-0 xl:border-l border-line/50 pt-4 xl:pt-0 xl:pl-6">
         <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-2 mb-3">
           <ShieldAlert size={13} className={owner ? "text-warning" : "text-muted"} /> 
           Owner Lifecycle Controls
           {!owner && <span className="ml-1 rounded bg-line/60 px-1.5 py-0.5 text-[9px] text-foreground font-bold tracking-wider" data-testid={`locked-${user.id}`}>LOCKED</span>}
         </h4>
         {!owner && <p className="text-[11px] text-muted/80">These actions require platform owner authority.</p>}
         
         <div className="flex flex-wrap gap-2">
            <ActionFormDialog
              testId={`role-${user.id}`}
              title="Change Authority Role"
              description="Modify administrative access for this identity."
              trigger={<button disabled={!owner} className={btnClass} data-testid={`btn-set-role-${user.id}`}>Set Role</button>}
              onSubmit={(f) => run({ path: `/admin/users/${user.id}/role`, method: "PATCH", body: { role: f.get("role"), reason: f.get("reason") } })}
              pending={pending}
            >
              <Select name="role" defaultValue={user.platform_role} options={[{label: "User", value: "user"}, {label: "Administrator", value: "admin"}, {label: "Platform Owner", value: "owner"}]} />
              <TextInput name="reason" required placeholder="Audit reason" />
            </ActionFormDialog>

            <ActionFormDialog
              testId={`plan-${user.id}`}
              title="Override Access Plan"
              description="Force a billing tier active, bypassing Stripe."
              trigger={<button disabled={!owner} className={btnClass} data-testid={`btn-set-plan-${user.id}`}>Set Plan</button>}
              onSubmit={(f) => {
                const pk = f.get("planKey");
                if (pk === "remove") {
                  run({ path: `/admin/users/${user.id}/access-plan`, method: "DELETE", body: { reason: f.get("reason") } });
                } else {
                  run({ path: `/admin/users/${user.id}/access-plan`, method: "PUT", body: { planKey: pk, reason: f.get("reason") } });
                }
              }}
              pending={pending}
            >
              <Select name="planKey" defaultValue={user.access_plan_overrides?.find(o => o.active)?.plan_key || "remove"} options={[
                {label: "No Override (Revert to Stripe)", value: "remove"},
                {label: "Free Flight", value: "free_flight"},
                {label: "Co-Pilot", value: "co_pilot"},
                {label: "Ace Pilot", value: "ace_pilot"},
                {label: "Squadron", value: "squadron"}
              ]} />
              <TextInput name="reason" required placeholder="Audit reason" />
            </ActionFormDialog>

            <ActionFormDialog
              testId={`status-${user.id}`}
              danger={!user.account_disabled_at}
              title={user.account_disabled_at ? "Enable Account" : "Disable Account"}
              description={user.account_disabled_at ? "Restore access." : "Immediately revoke access."}
              trigger={
                <button disabled={!owner} className={cn(btnClass, user.account_disabled_at ? "hover:border-ok hover:text-ok text-ok/80" : "hover:border-danger hover:text-danger text-danger/80")} data-testid={`btn-toggle-status-${user.id}`}>
                  {user.account_disabled_at ? "Enable Access" : "Disable Access"}
                </button>
              }
              onSubmit={(f) => run({ path: `/admin/users/${user.id}/${user.account_disabled_at ? "enable" : "disable"}`, method: "POST", body: { reason: f.get("reason") } })}
              pending={pending}
            >
              <TextInput name="reason" required placeholder="Audit reason" />
            </ActionFormDialog>

            <ActionFormDialog
              testId={`delete-${user.id}`}
              danger
               title="Remove Account"
               description="Revoke Supabase access and anonymize the personal profile. Billing and audit records are retained for operational integrity."
               trigger={<button disabled={!owner} className={cn(btnClass, "text-danger/80 hover:border-danger hover:text-danger bg-danger/10")} data-testid={`btn-delete-${user.id}`}>Remove Account</button>}
              onSubmit={(f) => run({ path: `/admin/users/${user.id}`, method: "DELETE", body: { reason: f.get("reason") } })}
              pending={pending}
            >
               <TextInput name="reason" required minLength={3} placeholder="Removal reason" />
            </ActionFormDialog>
         </div>
      </div>
    </div>
  );
}

function UserRow({ user, ledger, owner, run, pending }: { user: AdminUser, ledger: any[], owner: boolean, run: (a: Action) => void, pending: boolean }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <>
      <tr className="hover:bg-panel-strong transition-colors cursor-pointer group" onClick={() => setExpanded(!expanded)} data-testid={`row-user-${user.id}`}>
        <td className="p-3">
           <p className="font-semibold text-foreground text-[13px]">{user.display_name || "Unknown"}</p>
           <p className="font-mono text-[11px] text-muted mt-0.5">{user.email}</p>
        </td>
        <td className="p-3">
           <RoleBadge role={user.platform_role} />
        </td>
        <td className="p-3">
           <PlanDisplay user={user} />
        </td>
        <td className="p-3">
            {user.account_removed_at ? <Badge tone="danger">Removed</Badge> : user.account_disabled_at ? <Badge tone="danger">Disabled</Badge> : <Badge tone="ok">Active</Badge>}
        </td>
        <td className="p-3 text-right">
           <button 
             className="text-[10px] font-bold uppercase tracking-widest text-muted group-hover:text-accent transition"
             data-testid={`btn-expand-${user.id}`}
             onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
           >
             {expanded ? "Close" : "Manage"}
           </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-panel-strong/40">
          <td colSpan={5} className="p-0 border-b border-line shadow-inner">
             <UserControls user={user} ledger={ledger} owner={owner} run={run} pending={pending} />
          </td>
        </tr>
      )}
    </>
  );
}

export function UsersPanel({
  users,
  ledger,
  owner,
  run,
  pending,
  className
}: {
  users: AdminUser[];
  ledger: any[];
  owner: boolean;
  run: (a: Action) => void;
  pending: boolean;
  className?: string;
}) {
  return (
    <Panel className={cn("flex flex-col gap-4 overflow-hidden", className)} data-testid="panel-users">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-1">
          <SectionHeader title="Users and Access" eyebrow="Fleet Roster" />
           <ActionFormDialog
             testId="invite-user"
             title="Invite User"
             description="Provision a new platform identity. They will receive an email."
             trigger={
                <button disabled={!owner} className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background-deep transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45" data-testid="btn-invite-user">
                 <Plus size={16} /> Add User
               </button>
             }
             onSubmit={(f) => run({ path: "/admin/users", method: "POST", body: { email: f.get("email"), displayName: f.get("displayName"), role: f.get("role"), reason: f.get("reason") } })}
             pending={pending}
          >
            <TextInput name="email" type="email" required placeholder="Target email address" data-testid="input-invite-email" />
            <TextInput name="displayName" placeholder="Display name (Optional)" data-testid="input-invite-name" />
            <Select name="role" options={[{label: "User", value: "user"}, {label: "Administrator", value: "admin"}, {label: "Platform Owner", value: "owner"}]} testId="select-invite-role" />
            <TextInput name="reason" required placeholder="Audit reason for invitation" data-testid="input-invite-reason" />
          </ActionFormDialog>
           {!owner ? <p className="text-xs text-muted" data-testid="status-invite-locked">User invitations and lifecycle changes require platform-owner access.</p> : null}
       </div>
       
       <div className="overflow-x-auto rounded-xl border border-line bg-panel-strong shadow-[var(--shadow-soft)]">
         <table className="w-full text-left text-sm" data-testid="table-users">
           <thead className="bg-panel text-muted border-b border-line">
             <tr>
               <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">Identity</th>
               <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">Role</th>
               <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">Billing & Access</th>
               <th className="p-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
               <th className="p-3 font-semibold uppercase tracking-wider text-[10px] text-right">Controls</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-line">
             {users.map(user => (
               <UserRow key={user.id} user={user} ledger={ledger.filter(l => l.user_id === user.id)} owner={owner} run={run} pending={pending} />
             ))}
             {users.length === 0 && (
               <tr>
                 <td colSpan={5} className="p-8 text-center text-muted text-sm">
                   No users found in roster.
                 </td>
               </tr>
             )}
           </tbody>
         </table>
       </div>
    </Panel>
  );
}