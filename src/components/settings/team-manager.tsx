'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Loader2, Trash2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { TeamMember, TeamMemberRole } from '@/types';

const ROLE_LABEL: Record<TeamMemberRole, string> = {
  admin:  'Admin',
  agent:  'Agent',
  viewer: 'Viewer',
};

const ROLE_DESCRIPTIONS: Record<TeamMemberRole, string> = {
  admin:  'Full access including settings',
  agent:  'Inbox, contacts, broadcasts, pipelines',
  viewer: 'Read-only across all pages',
};

const STATUS_STYLE: Record<string, string> = {
  active:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const canManage = (role: string) => role === 'owner' || role === 'admin';

export function TeamManager() {
  const supabase = createClient();
  const { user, memberRole } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>('agent');

  useEffect(() => {
    if (!user) return;
    fetchMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchMembers() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('owner_user_id', user.id)
      .order('invited_at', { ascending: false });
    if (error) toast.error('Failed to load team members');
    setMembers(data ?? []);
    setLoading(false);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Invite failed'); return; }
      toast.success(`Invite sent to ${inviteEmail.trim()}`);
      setInviteOpen(false);
      setInviteEmail(''); setInviteName(''); setInviteRole('agent');
      await fetchMembers();
    } catch { toast.error('Network error'); }
    finally { setSaving(false); }
  }

  async function handleRoleChange(memberId: string, newRole: TeamMemberRole) {
    const { error } = await supabase
      .from('team_members').update({ role: newRole })
      .eq('id', memberId).eq('owner_user_id', user!.id);
    if (error) { toast.error('Failed to update role'); return; }
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
    toast.success('Role updated');
  }

  async function handleRemove() {
    if (!removeTarget || !user) return;
    setRemoving(true);
    const { error } = await supabase
      .from('team_members').delete()
      .eq('id', removeTarget.id).eq('owner_user_id', user.id);
    if (error) { toast.error('Failed to remove member'); }
    else {
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      toast.success('Member removed'); setRemoveTarget(null);
    }
    setRemoving(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const manage = canManage(memberRole);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">Team members</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {members.length}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Invite your team to collaborate on conversations and contacts.
          </p>
        </div>
        {manage && (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Invite member
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-[14px] font-semibold text-foreground">No team members yet</p>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-xs">
            Invite people to collaborate in this workspace.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {manage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                        {(m.member_name || m.member_email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground leading-none">
                          {m.member_name || m.member_email}
                        </p>
                        {m.member_name && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.member_email}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {manage ? (
                      <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v as TeamMemberRole)}>
                        <SelectTrigger className="h-7 w-28 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['admin', 'agent', 'viewer'] as TeamMemberRole[]).map((r) => (
                            <SelectItem key={r} value={r} className="text-[12px]">{ROLE_LABEL[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[m.status] ?? ''}`}>
                      {m.status === 'active' ? 'Active' : 'Pending'}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : '—'}
                  </TableCell>
                  {manage && (
                    <TableCell className="text-right">
                      <button
                        onClick={() => setRemoveTarget(m)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors ml-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              They'll receive an email to join your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-[13px]">Email address <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Name (optional)</Label>
              <Input
                placeholder="Jane Smith"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px]">Role</Label>
              <div className="space-y-1.5">
                {(['admin', 'agent', 'viewer'] as TeamMemberRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`w-full flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      inviteRole === r
                        ? 'border-foreground bg-muted/60'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors ${
                      inviteRole === r ? 'border-foreground bg-foreground' : 'border-muted-foreground'
                    }`} />
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{ROLE_LABEL[r]}</p>
                      <p className="text-[11px] text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove <strong>{removeTarget?.member_name || removeTarget?.member_email}</strong>? They'll lose workspace access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button onClick={handleRemove} disabled={removing} className="bg-destructive text-white hover:bg-destructive/90">
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
