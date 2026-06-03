'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Download } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';

// ─── Theme-aware chart colors ─────────────────────────────────

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return {
    grid:    dark ? '#222222' : '#F3F4F6',
    tick:    dark ? '#6B7280' : '#9CA3AF',
    tooltip: {
      bg:     dark ? '#111111' : '#FFFFFF',
      border: dark ? '#222222' : '#E5E7EB',
      text:   dark ? '#F5F5F5' : '#111111',
      label:  dark ? '#6B7280' : '#9CA3AF',
    },
  };
}

// ─── KPI card ─────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  change?: number; // % vs previous period
}

function KPICard({ label, value, sub, change }: KPICardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-[28px] font-bold text-foreground tabular-nums leading-none">{value}</p>
      {sub && <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>}
      {change !== undefined && (
        <div className={`mt-2 flex items-center gap-1 text-[12px] font-medium ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {Math.abs(change)}% vs prev period
        </div>
      )}
    </div>
  );
}

// ─── Date range picker ────────────────────────────────────────

type Range = '7d' | '30d' | '90d';

function rangeToISO(r: Range): string {
  const days = r === '7d' ? 7 : r === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function DateRangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {(['7d', '30d', '90d'] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
            value === r
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground hover:bg-muted'
          }`}
        >
          {r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'Last 90 days'}
        </button>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card">
      <p className="text-[13px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────

function OverviewTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const { grid, tick, tooltip } = useChartColors();
  const [data, setData] = useState({
    msgSent: 0, msgRecv: 0, contacts: 0, dealsWon: 0, dealValue: 0, broadcasts: 0, broadcastReach: 0,
  });
  const [msgSeries, setMsgSeries] = useState<{ date: string; sent: number; received: number }[]>([]);
  const [contactSeries, setContactSeries] = useState<{ date: string; count: number }[]>([]);
  const [tagCounts, setTagCounts] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    const since = rangeToISO(range);
    (async () => {
      setLoading(true);
      const [msgs, contacts, deals, bcast, tagRows] = await Promise.all([
        supabase.from('messages').select('sender_type, created_at').gte('created_at', since),
        supabase.from('contacts').select('created_at').eq('user_id', ownerId).gte('created_at', since),
        supabase.from('deals').select('value, status').eq('user_id', ownerId).eq('status', 'won').gte('created_at', since),
        supabase.from('broadcasts').select('id, total_recipients').eq('user_id', ownerId).gte('created_at', since),
        supabase.from('contact_tags').select('tag_id, tags(name)'),
      ]);

      const sent = (msgs.data ?? []).filter(m => m.sender_type === 'agent');
      const recv = (msgs.data ?? []).filter(m => m.sender_type === 'customer');
      setData({
        msgSent: sent.length, msgRecv: recv.length,
        contacts: contacts.data?.length ?? 0,
        dealsWon: deals.data?.length ?? 0,
        dealValue: (deals.data ?? []).reduce((s, d) => s + Number(d.value ?? 0), 0),
        broadcasts: bcast.data?.length ?? 0,
        broadcastReach: (bcast.data ?? []).reduce((s, b) => s + (b.total_recipients ?? 0), 0),
      });

      // Daily message series
      const msgBuckets: Record<string, { sent: number; received: number }> = {};
      (msgs.data ?? []).forEach(m => {
        const day = m.created_at.slice(0, 10);
        if (!msgBuckets[day]) msgBuckets[day] = { sent: 0, received: 0 };
        if (m.sender_type === 'agent') msgBuckets[day].sent++;
        else msgBuckets[day].received++;
      });
      setMsgSeries(Object.entries(msgBuckets).map(([date, v]) => ({ date, ...v })));

      // Daily contacts
      const cBuckets: Record<string, number> = {};
      (contacts.data ?? []).forEach(c => {
        const day = c.created_at.slice(0, 10);
        cBuckets[day] = (cBuckets[day] ?? 0) + 1;
      });
      setContactSeries(Object.entries(cBuckets).map(([date, count]) => ({ date, count })));

      // Top tags
      const tc: Record<string, { name: string; count: number }> = {};
      (tagRows.data ?? []).forEach((r: any) => {
        const name = r.tags?.name ?? 'Unknown';
        if (!tc[r.tag_id]) tc[r.tag_id] = { name, count: 0 };
        tc[r.tag_id].count++;
      });
      setTagCounts(Object.values(tc).sort((a, b) => b.count - a.count).slice(0, 10));
      setLoading(false);
    })();
  }, [ownerId, range]);

  const tooltipStyle = {
    contentStyle: { background: tooltip.bg, border: `1px solid ${tooltip.border}`, borderRadius: 8, fontSize: 12, color: tooltip.text },
    labelStyle: { color: tooltip.label },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Messages Sent"  value={data.msgSent}      sub={`${data.msgRecv} received`} />
        <KPICard label="New Contacts"   value={data.contacts}     sub="joined this period" />
        <KPICard label="Deals Closed"   value={data.dealsWon}     sub={`₹${data.dealValue.toLocaleString('en-IN')}`} />
        <KPICard label="Broadcasts"     value={data.broadcasts}   sub={`${data.broadcastReach} total reach`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Messages Over Time</CardTitle></CardHeader>
          <CardContent>
            {msgSeries.length === 0 ? <Empty label="No message data yet" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={msgSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="date" tick={{ fill: tick, fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, color: tick }} />
                  <Line type="monotone" dataKey="sent" stroke="#111111" strokeWidth={2} dot={false} name="Sent" />
                  <Line type="monotone" dataKey="received" stroke="#9CA3AF" strokeWidth={2} dot={false} name="Received" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">New Contacts Daily</CardTitle></CardHeader>
          <CardContent>
            {contactSeries.length === 0 ? <Empty label="No contact data yet" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={contactSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="date" tick={{ fill: tick, fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" fill="#111111" radius={[3, 3, 0, 0]} name="Contacts" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {tagCounts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Top Tags by Contact Count</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tagCounts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: tick, fontSize: 11 }} tickLine={false} width={90} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="count" fill="#111111" radius={[0, 3, 3, 0]} name="Contacts" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Broadcasts tab ────────────────────────────────────────────

function BroadcastsTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const { grid, tick, tooltip } = useChartColors();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    supabase.from('broadcasts')
      .select('name, sent_count, delivered_count, read_count, replied_count, failed_count, total_recipients, created_at')
      .eq('user_id', ownerId).gte('created_at', rangeToISO(range))
      .order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [ownerId, range]);

  const tooltipStyle = {
    contentStyle: { background: tooltip.bg, border: `1px solid ${tooltip.border}`, borderRadius: 8, fontSize: 12, color: tooltip.text },
    labelStyle: { color: tooltip.label },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return <Empty label="No broadcast campaigns in this period" />;

  const chartData = rows.slice(0, 8).map(r => ({
    name: r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name,
    sent: r.sent_count, delivered: r.delivered_count, read: r.read_count,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Read Rate by Campaign</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="name" tick={{ fill: tick, fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: tick }} />
              <Bar dataKey="sent" fill="#D1D5DB" name="Sent" stackId="a" />
              <Bar dataKey="delivered" fill="#6B7280" name="Delivered" stackId="b" />
              <Bar dataKey="read" fill="#111111" name="Read" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Campaign', 'Sent', 'Delivered', 'Read', 'Replied', 'Failed', 'Read %', 'Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const readRate = r.sent_count > 0 ? Math.round((r.read_count / r.sent_count) * 100) : 0;
              return (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground max-w-[160px] truncate">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.sent_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.delivered_count}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{r.read_count}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.replied_count}</td>
                  <td className="px-4 py-3 text-red-500">{r.failed_count}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${readRate > 50 ? 'text-emerald-600' : readRate > 20 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {readRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Deals tab ─────────────────────────────────────────────────

function DealsTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const { grid, tick, tooltip } = useChartColors();
  const [stageData, setStageData] = useState<{ name: string; value: number; count: number }[]>([]);
  const [winLoss, setWinLoss] = useState({ won: 0, lost: 0 });
  const [revSeries, setRevSeries] = useState<{ date: string; value: number }[]>([]);
  const [kpi, setKpi] = useState({ avgSize: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoading(true);
      const [deals, stages, pipelines] = await Promise.all([
        supabase.from('deals').select('stage_id, value, status, created_at').eq('user_id', ownerId).gte('created_at', rangeToISO(range)),
        supabase.from('pipeline_stages').select('id, name, position'),
        supabase.from('pipelines').select('id').eq('user_id', ownerId),
      ]);
      const pipelineIds = (pipelines.data ?? []).map((p: any) => p.id);
      const stagesForUser = (stages.data ?? []).filter((s: any) => {
        return true; // stages joined via pipeline
      });

      const byStage: Record<string, { name: string; value: number; count: number }> = {};
      stagesForUser.forEach((s: any) => { byStage[s.id] = { name: s.name, value: 0, count: 0 }; });

      let won = 0, lost = 0, totalVal = 0;
      (deals.data ?? []).forEach((d: any) => {
        if (d.status === 'won') { won++; totalVal += Number(d.value ?? 0); }
        if (d.status === 'lost') lost++;
        if (byStage[d.stage_id]) { byStage[d.stage_id].value += Number(d.value ?? 0); byStage[d.stage_id].count++; }
      });

      const wonDeals = (deals.data ?? []).filter((d: any) => d.status === 'won');
      const revBuckets: Record<string, number> = {};
      wonDeals.forEach((d: any) => {
        const day = d.created_at.slice(0, 10);
        revBuckets[day] = (revBuckets[day] ?? 0) + Number(d.value ?? 0);
      });

      setStageData(Object.values(byStage).filter(s => s.count > 0));
      setWinLoss({ won, lost });
      setRevSeries(Object.entries(revBuckets).map(([date, value]) => ({ date, value })));
      setKpi({ avgSize: won > 0 ? Math.round(totalVal / won) : 0, total: won });
      setLoading(false);
    })();
  }, [ownerId, range]);

  const tooltipStyle = {
    contentStyle: { background: tooltip.bg, border: `1px solid ${tooltip.border}`, borderRadius: 8, fontSize: 12, color: tooltip.text },
    labelStyle: { color: tooltip.label },
  };
  const COLORS = ['#111111', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB'];

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KPICard label="Deals Won" value={kpi.total} />
        <KPICard label="Avg Deal Size" value={`₹${kpi.avgSize.toLocaleString('en-IN')}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {stageData.length > 0 ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Pipeline by Stage</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="name" tick={{ fill: tick, fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Value']} />
                  <Bar dataKey="value" fill="#111111" radius={[3, 3, 0, 0]} name="Value (₹)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : <Empty label="No pipeline data yet" />}

        {(winLoss.won > 0 || winLoss.lost > 0) ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Win / Loss Ratio</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center">
              <PieChart width={200} height={200}>
                <Pie data={[{ name: 'Won', value: winLoss.won }, { name: 'Lost', value: winLoss.lost }]}
                  cx={100} cy={100} innerRadius={55} outerRadius={85} dataKey="value">
                  <Cell fill="#111111" />
                  <Cell fill="#E5E7EB" />
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </CardContent>
          </Card>
        ) : <Empty label="No closed deals yet" />}
      </div>

      {revSeries.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Revenue Over Time (Won Deals)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis dataKey="date" tick={{ fill: tick, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                <Area type="monotone" dataKey="value" stroke="#111111" fill="#F3F4F6" strokeWidth={2} name="Revenue (₹)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Contacts tab ──────────────────────────────────────────────

function ContactsTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const { grid, tick, tooltip } = useChartColors();
  const [series, setSeries] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    supabase.from('contacts').select('created_at').eq('user_id', ownerId).gte('created_at', rangeToISO(range)).order('created_at')
      .then(({ data }) => {
        const b: Record<string, number> = {};
        (data ?? []).forEach((c: any) => { const d = c.created_at.slice(0, 10); b[d] = (b[d] ?? 0) + 1; });
        setSeries(Object.entries(b).map(([date, count]) => ({ date, count })));
        setLoading(false);
      });
  }, [ownerId, range]);

  const tooltipStyle = {
    contentStyle: { background: tooltip.bg, border: `1px solid ${tooltip.border}`, borderRadius: 8, fontSize: 12, color: tooltip.text },
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">New Contacts Over Time</CardTitle></CardHeader>
      <CardContent>
        {series.length === 0 ? <Empty label="No contact data for this period" /> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="date" tick={{ fill: tick, fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: tick, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="count" stroke="#111111" fill="#F3F4F6" strokeWidth={2} name="New contacts" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Conversations tab ────────────────────────────────────────

function ConversationsTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const { tooltip } = useChartColors();
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    supabase.from('conversations').select('status').eq('user_id', ownerId).gte('created_at', rangeToISO(range))
      .then(({ data }) => {
        const c = { open: 0, pending: 0, closed: 0 };
        (data ?? []).forEach((r: any) => { c[r.status as keyof typeof c]++; });
        setStatusData([{ name: 'Open', value: c.open }, { name: 'Pending', value: c.pending }, { name: 'Closed', value: c.closed }]);
        setLoading(false);
      });
  }, [ownerId, range]);

  const tooltipStyle = {
    contentStyle: { background: tooltip.bg, border: `1px solid ${tooltip.border}`, borderRadius: 8, fontSize: 12, color: tooltip.text },
  };
  const COLORS = ['#111111', '#F59E0B', '#9CA3AF'];
  const total = statusData.reduce((s, d) => s + d.value, 0);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (total === 0) return <Empty label="No conversation data for this period" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {statusData.map((s, i) => (
          <KPICard key={s.name} label={s.name} value={s.value} sub={total > 0 ? `${Math.round(s.value / total * 100)}% of total` : ''} />
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[13px] font-medium text-muted-foreground">Conversation Status Breakdown</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center">
          <PieChart width={300} height={280}>
            <Pie data={statusData} cx={150} cy={130} outerRadius={110} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
              {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Activity tab ──────────────────────────────────────────────

function ActivityTab({ range }: { range: Range }) {
  const supabase = createClient();
  const { ownerId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const PAGE = 25;

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    supabase.from('activity_log').select('*').eq('user_id', ownerId)
      .gte('created_at', rangeToISO(range)).order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [ownerId, range, page]);

  const ICON_MAP: Record<string, string> = {
    contact: '👤', conversation: '💬', message: '📨', deal: '💼', broadcast: '📢', automation: '⚡', drip: '💧', tag: '🏷️',
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return <Empty label="No activity logged yet. Activity appears here once actions are performed." />;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="divide-y divide-border">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
            <span className="text-[16px] mt-0.5 shrink-0">{ICON_MAP[r.entity_type] ?? '📌'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-foreground">
                <span className="font-medium capitalize">{r.action?.replace(/_/g, ' ')}</span>
                {r.metadata?.deal_title && <span className="text-muted-foreground"> — {r.metadata.deal_title}</span>}
                {r.metadata?.from && r.metadata?.to && (
                  <span className="text-muted-foreground"> {r.metadata.from} → {r.metadata.to}</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
      {rows.length === PAGE + 1 && (
        <div className="border-t border-border p-3 text-center">
          <button onClick={() => setPage(p => p + 1)} className="text-[13px] font-medium text-foreground hover:underline">
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

const TABS = ['overview', 'conversations', 'contacts', 'broadcasts', 'deals', 'activity'] as const;
type Tab = typeof TABS[number];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('30d');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-foreground">Reports</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Analytics and activity across your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted transition-colors">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto flex-wrap rounded-xl border border-border bg-card">
          {[
            { value: 'overview',       label: 'Overview' },
            { value: 'conversations',  label: 'Conversations' },
            { value: 'contacts',       label: 'Contacts' },
            { value: 'broadcasts',     label: 'Broadcasts' },
            { value: 'deals',          label: 'Deals' },
            { value: 'activity',       label: 'Activity Feed' },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="text-[12px] text-muted-foreground data-active:bg-muted data-active:text-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"      className="mt-4"><OverviewTab range={range} /></TabsContent>
        <TabsContent value="conversations" className="mt-4"><ConversationsTab range={range} /></TabsContent>
        <TabsContent value="contacts"      className="mt-4"><ContactsTab range={range} /></TabsContent>
        <TabsContent value="broadcasts"    className="mt-4"><BroadcastsTab range={range} /></TabsContent>
        <TabsContent value="deals"         className="mt-4"><DealsTab range={range} /></TabsContent>
        <TabsContent value="activity"      className="mt-4"><ActivityTab range={range} /></TabsContent>
      </Tabs>
    </div>
  );
}
