"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Users, Wifi, WifiOff, Crown, User, ShieldAlert,
  Search, RefreshCw, CheckCircle2, XCircle, Clock,
  Activity,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface SuperAdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_sign_in: string | null;
  is_new: boolean;
  suspended: boolean;
  plan: "free" | "premium";
  sub_status: string;
  wa_connected: boolean;
  wa_phone_id: string | null;
  wa_waba_id: string | null;
  wa_connected_at: string | null;
}

interface Stats {
  total_signups: number;
  new_this_week: number;
  premium: number;
  free: number;
  wa_connected: number;
  wa_not_connected: number;
  suspended: number;
}

interface AdminLog {
  id: string;
  action: string;
  admin_email: string;
  target_user_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

type FilterType = "all" | "free" | "premium" | "wa_connected" | "wa_not_connected" | "new_this_week" | "suspended";

// ─── Helpers ────────────────────────────────────────────────────

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function actionLabel(action: string) {
  switch (action) {
    case "new_signup":         return "New signup";
    case "activate_premium":   return "Activated Premium";
    case "deactivate_premium": return "Deactivated Premium";
    case "suspend_user":       return "Suspended user";
    case "unsuspend_user":     return "Unsuspended user";
    default: return action;
  }
}

// ─── Stat card ──────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-[12px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────

export default function SuperAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<{ stats: Stats; users: SuperAdminUser[]; logs: AdminLog[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeTab, setActiveTab] = useState<"users" | "whatsapp" | "logs">("users");

  // Guard — redirect if not superadmin
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.email !== process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL) {
      // We compare against the public env var for the client-side guard;
      // the API enforces the real check server-side.
      fetch("/api/superadmin").then(r => { if (r.status === 403) router.replace("/dashboard"); });
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin");
      if (res.status === 403) { router.replace("/dashboard"); return; }
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const doAction = async (type: string, userId: string, label: string) => {
    setActioning(`${type}-${userId}`);
    try {
      const res = await fetch("/api/superadmin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, userId }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error ?? "Action failed"); return; }
      toast.success(label);
      await fetchData();
    } catch {
      toast.error("Network error");
    } finally {
      setActioning(null);
    }
  };

  // Filtered + searched users
  const visible = (data?.users ?? []).filter(u => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all"             ? true :
      filter === "free"            ? (u.plan !== "premium" || u.sub_status !== "active") :
      filter === "premium"         ? (u.plan === "premium" && u.sub_status === "active") :
      filter === "wa_connected"    ? u.wa_connected :
      filter === "wa_not_connected"? !u.wa_connected :
      filter === "new_this_week"   ? u.is_new :
      filter === "suspended"       ? u.suspended : true;
    return matchSearch && matchFilter;
  });

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all",             label: "All" },
    { id: "free",            label: "Free" },
    { id: "premium",         label: "Premium" },
    { id: "wa_connected",    label: "WA Connected" },
    { id: "wa_not_connected",label: "WA Not Connected" },
    { id: "new_this_week",   label: "New This Week" },
    { id: "suspended",       label: "Suspended" },
  ];

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-foreground" />
          <h1 className="text-[16px] font-semibold text-foreground">Super Admin</h1>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">

        {/* ── Section 1: Overview stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total signups"     value={stats?.total_signups    ?? 0} icon={Users}    color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300" />
          <StatCard label="New this week"     value={stats?.new_this_week    ?? 0} icon={Clock}    color="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
          <StatCard label="Premium accounts"  value={stats?.premium          ?? 0} icon={Crown}    color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300" />
          <StatCard label="Free accounts"     value={stats?.free             ?? 0} icon={User}     color="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" />
          <StatCard label="WA connected"      value={stats?.wa_connected     ?? 0} icon={Wifi}     color="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300" />
          <StatCard label="WA not connected"  value={stats?.wa_not_connected ?? 0} icon={WifiOff}  color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300" />
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 border-b border-border">
          {(["users", "whatsapp", "logs"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "logs" ? "Activity Log" : tab === "whatsapp" ? "WhatsApp Tracker" : "All Users"}
            </button>
          ))}
        </div>

        {/* ── Section 2: All Users Table ── */}
        {activeTab === "users" && (
          <div className="space-y-3">
            {/* Search + filter bar */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name or email…"
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-56"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {FILTERS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                      filter === f.id
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["Name / Email", "Signed Up", "Plan", "WhatsApp", "Last Active", "Actions"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users match your filter.</td>
                      </tr>
                    )}
                    {visible.map(u => {
                      const isPremium = u.plan === "premium" && u.sub_status === "active";
                      const key = (type: string) => `${type}-${u.id}`;
                      return (
                        <tr key={u.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${u.is_new ? "bg-violet-50/40 dark:bg-violet-950/20" : ""}`}>
                          {/* Name / Email */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                                {(u.full_name ?? u.email).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{u.full_name ?? "—"}</p>
                                <p className="text-muted-foreground">{u.email}</p>
                              </div>
                              {u.is_new && <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200 px-1.5 py-px text-[10px] font-semibold">NEW</span>}
                              {u.suspended && <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 px-1.5 py-px text-[10px] font-semibold">SUSPENDED</span>}
                            </div>
                          </td>
                          {/* Signed up */}
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(u.created_at)}</td>
                          {/* Plan */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isPremium ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" : "bg-muted text-muted-foreground"}`}>
                              {isPremium ? <Crown className="h-3 w-3" /> : <User className="h-3 w-3" />}
                              {isPremium ? "Premium" : "Free"}
                            </span>
                          </td>
                          {/* WhatsApp */}
                          <td className="px-4 py-3">
                            {u.wa_connected
                              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Connected</span>
                              : <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Not connected</span>
                            }
                          </td>
                          {/* Last active */}
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(u.last_sign_in)}</td>
                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              {!isPremium ? (
                                <button
                                  disabled={!!actioning}
                                  onClick={() => doAction("activate_premium", u.id, `Premium activated for ${u.email}`)}
                                  className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                >
                                  {actioning === key("activate_premium") ? "…" : "Activate Premium"}
                                </button>
                              ) : (
                                <button
                                  disabled={!!actioning}
                                  onClick={() => doAction("deactivate_premium", u.id, `Premium deactivated for ${u.email}`)}
                                  className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
                                >
                                  {actioning === key("deactivate_premium") ? "…" : "Deactivate Premium"}
                                </button>
                              )}
                              {!u.suspended ? (
                                <button
                                  disabled={!!actioning}
                                  onClick={() => { if (confirm(`Suspend ${u.email}?`)) doAction("suspend", u.id, `Suspended ${u.email}`); }}
                                  className="rounded-md bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                                >
                                  {actioning === key("suspend") ? "…" : "Suspend"}
                                </button>
                              ) : (
                                <button
                                  disabled={!!actioning}
                                  onClick={() => doAction("unsuspend", u.id, `Unsuspended ${u.email}`)}
                                  className="rounded-md bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors dark:bg-green-950 dark:text-green-300"
                                >
                                  {actioning === key("unsuspend") ? "…" : "Unsuspend"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Showing {visible.length} of {data?.users.length ?? 0} users
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3: WhatsApp Activation Tracker ── */}
        {activeTab === "whatsapp" && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["User", "Phone Number ID", "WABA ID", "Connected On", "Status"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.users ?? []).map(u => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{u.full_name ?? "—"}</p>
                        <p className="text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{u.wa_phone_id ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{u.wa_waba_id ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmt(u.wa_connected_at)}</td>
                      <td className="px-4 py-3">
                        {u.wa_connected
                          ? <span className="flex items-center gap-1 text-green-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
                          : <span className="text-muted-foreground">Not set up</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 4: Activity Log ── */}
        {activeTab === "logs" && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="text-[13px] font-semibold text-foreground">Last 100 admin actions</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["When", "Action", "By", "Target User"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.logs ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No actions logged yet.</td></tr>
                  )}
                  {(data?.logs ?? []).map(log => (
                    <tr key={log.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${log.action === "new_signup" ? "bg-violet-50/40 dark:bg-violet-950/20" : ""}`}>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmt(log.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          log.action === "new_signup"         ? "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200" :
                          log.action === "activate_premium"   ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" :
                          log.action === "suspend_user"       ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" :
                          log.action === "unsuspend_user"     ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{log.admin_email}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{log.target_user_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
