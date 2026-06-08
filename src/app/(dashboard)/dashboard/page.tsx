"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import {
  MessageSquare, Users, Send, LayoutTemplate,
  ArrowUpRight, Lock, CheckCircle2, Circle, Wallet,
  CalendarClock,
} from "lucide-react";
import type { PlanStep } from "@/types";

// ─── Stat card ───────────────────────────────────────────────

interface StatItem {
  label: string;
  href: string;
  icon: React.ElementType;
  count: number;
  sub: string;
}

function StatCard({ item }: { item: StatItem }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium">
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
        </div>
        <Link href={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="text-3xl font-bold text-foreground tabular-nums">{item.count}</p>
      <p className="text-[12px] text-muted-foreground mt-1">{item.sub}</p>
    </div>
  );
}

// ─── Setup card ──────────────────────────────────────────────

interface SetupStep {
  label: string;
  done: boolean;
}

function SetupCard({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-foreground">
            Setup WhatsApp Business Account
          </p>
          <span className="text-[12px] text-muted-foreground font-medium">
            {done} of {steps.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="divide-y divide-border">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 text-[13px] text-foreground">{step.label}</span>
            {!step.done && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Wallet card ──────────────────────────────────────────────

function WalletCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Wallet</span>
        </div>
        <button className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
          Manage <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {[
          { label: "CREDITS AVAILABLE", value: "₹0.00", desc: "Top up to send messages" },
          { label: "PLAN",              value: "Free",  desc: "Upgrade to unlock higher volumes" },
          { label: "CREDITS USED",      value: "₹0.00", desc: "This billing period" },
        ].map((row) => (
          <div key={row.label} className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
              {row.label}
            </p>
            <p className="text-[15px] font-bold text-foreground">{row.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{row.desc}</p>
          </div>
        ))}
      </div>
      <button className="w-full rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors">
        View plans
      </button>
    </div>
  );
}

// ─── Plan deadline reminders ─────────────────────────────────

interface PlanReminder {
  id: string;
  planId: string;
  planName: string;
  label: string;
  date: string;
  daysRemaining: number;
  kind: "plan" | "step";
}

const REMINDER_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ReminderCard({ reminder }: { reminder: PlanReminder }) {
  const urgent = reminder.daysRemaining <= 1;
  return (
    <Link
      href="/planning"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{reminder.label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
          {reminder.kind === "plan" ? "Plan execution date" : `Step · ${reminder.planName}`}
          {" — "}
          {new Date(reminder.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          urgent ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"
        }`}
      >
        {reminder.daysRemaining === 0 ? "Today" : reminder.daysRemaining === 1 ? "Tomorrow" : `${reminder.daysRemaining}d left`}
      </span>
    </Link>
  );
}

function RemindersSection({ reminders }: { reminders: PlanReminder[] }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" />
        UPCOMING PLAN DEADLINES
      </p>
      {reminders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-[13px] text-muted-foreground">No plan deadlines in the next {REMINDER_WINDOW_DAYS} days.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => <ReminderCard key={r.id} reminder={r} />)}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const [counts, setCounts] = useState({ inbox: 0, broadcasts: 0, contacts: 0, templates: 0 });
  const [reminders, setReminders] = useState<PlanReminder[]>([]);
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { label: "Apply for WhatsApp Business API", done: false },
    { label: "Complete KYC verification", done: false },
    { label: "Customize your profile", done: false },
    { label: "Send your first message", done: false },
  ]);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const [conv, bcast, contacts, tmpl] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", ownerId),
        supabase.from("broadcasts").select("id", { count: "exact", head: true }).eq("user_id", ownerId),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", ownerId),
        supabase.from("message_templates").select("id", { count: "exact", head: true }).eq("user_id", ownerId),
      ]);
      setCounts({ inbox: conv.count ?? 0, broadcasts: bcast.count ?? 0, contacts: contacts.count ?? 0, templates: tmpl.count ?? 0 });
    })();
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, name, execution_date, steps")
        .eq("user_id", ownerId);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const horizon = new Date(startOfToday.getTime() + REMINDER_WINDOW_DAYS * MS_PER_DAY);

      const inWindow = (dateStr: string | null) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime()) || d < startOfToday || d > horizon) return null;
        return Math.round((d.getTime() - startOfToday.getTime()) / MS_PER_DAY);
      };

      const list: PlanReminder[] = [];
      for (const plan of data ?? []) {
        const planDays = inWindow(plan.execution_date);
        if (planDays !== null) {
          list.push({
            id: `plan-${plan.id}`,
            planId: plan.id,
            planName: plan.name,
            label: plan.name,
            date: plan.execution_date as string,
            daysRemaining: planDays,
            kind: "plan",
          });
        }
        for (const step of (plan.steps ?? []) as PlanStep[]) {
          const stepDays = inWindow(step.date);
          if (stepDays !== null) {
            list.push({
              id: `step-${plan.id}-${step.name}-${step.date}`,
              planId: plan.id,
              planName: plan.name,
              label: step.name,
              date: step.date,
              daysRemaining: stepDays,
              kind: "step",
            });
          }
        }
      }
      list.sort((a, b) => a.date.localeCompare(b.date));
      setReminders(list);
    })();
  }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      const [config, profile, outbound] = await Promise.all([
        supabase.from("whatsapp_config").select("phone_number_id, status").eq("user_id", ownerId).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("user_id", ownerId).maybeSingle(),
        supabase.from("messages").select("id", { count: "exact", head: true }).in("sender_type", ["agent", "bot"]),
      ]);
      setSetupSteps([
        { label: "Apply for WhatsApp Business API", done: !!config.data?.phone_number_id },
        { label: "Complete KYC verification", done: config.data?.status === "connected" },
        { label: "Customize your profile", done: !!profile.data?.full_name?.trim() },
        { label: "Send your first message", done: (outbound.count ?? 0) > 0 },
      ]);
    })();
  }, [ownerId]);

  const stats: StatItem[] = [
    { label: "Inbox",      href: "/inbox",                   icon: MessageSquare, count: counts.inbox,      sub: "Total conversations" },
    { label: "Broadcasts", href: "/broadcasts",              icon: Send,          count: counts.broadcasts, sub: "Campaigns created" },
    { label: "Contacts",   href: "/contacts",                icon: Users,         count: counts.contacts,   sub: "People in audience" },
    { label: "Templates",  href: "/settings?tab=templates",  icon: LayoutTemplate,count: counts.templates,  sub: "Message templates" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold text-foreground leading-tight">Home</h1>
        <p className="text-[14px] text-muted-foreground mt-1">Your workspace at a glance.</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left */}
        <div className="flex-1 min-w-0 space-y-6">
          <SetupCard steps={setupSteps} />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
              ACROSS YOUR WORKSPACE
            </p>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {stats.map((s) => <StatCard key={s.label} item={s} />)}
            </div>
          </div>
          <RemindersSection reminders={reminders} />
        </div>

        {/* Right — wallet */}
        <div className="w-[280px] shrink-0 hidden lg:block">
          <WalletCard />
        </div>
      </div>
    </div>
  );
}
