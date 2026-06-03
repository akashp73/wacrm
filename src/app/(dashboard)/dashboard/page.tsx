"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import {
  MessageSquare, Users, Send, LayoutTemplate,
  ArrowUpRight, Lock, CheckCircle2, Circle, Wallet,
} from "lucide-react";

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

const SETUP_STEPS = [
  { label: "Apply for WhatsApp Business API" },
  { label: "Complete KYC verification" },
  { label: "Customize your profile" },
  { label: "Send your first message" },
];

function SetupCard() {
  const done = 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-foreground">
            Setup WhatsApp Business Account
          </p>
          <span className="text-[12px] text-muted-foreground font-medium">
            {done} of {SETUP_STEPS.length}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: "0%" }} />
        </div>
      </div>
      <div className="divide-y divide-border">
        {SETUP_STEPS.map((step, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-[13px] text-foreground">{step.label}</span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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

// ─── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const [counts, setCounts] = useState({ inbox: 0, broadcasts: 0, contacts: 0, templates: 0 });

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
          <SetupCard />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
              ACROSS YOUR WORKSPACE
            </p>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {stats.map((s) => <StatCard key={s.label} item={s} />)}
            </div>
          </div>
        </div>

        {/* Right — wallet */}
        <div className="w-[280px] shrink-0 hidden lg:block">
          <WalletCard />
        </div>
      </div>
    </div>
  );
}
