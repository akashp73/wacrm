"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  MessageCircle,
  Clock,
  Users,
  PhoneCall,
  Loader2,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Automation } from "@/types"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message",
  "out_of_office",
  "lead_qualifier",
  "follow_up_reminder",
]

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
}

export default function AutomationsPage() {
  const router = useRouter()
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAutomations([]); return; }
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      setAutomations((data ?? []) as Automation[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations")
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      // Roll back on error.
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev,
      )
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to update")
      return
    }
    toast.success(next ? "Automation activated" : "Automation paused")
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to duplicate")
      return
    }
    toast.success("Automation duplicated")
    load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? "Failed to delete")
      return
    }
    toast.success("Automation deleted")
    setPendingDelete(null)
    load()
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`)
  }

  if (error) {
    const isMissingTable = error.toLowerCase().includes('relation') || error.toLowerCase().includes('does not exist') || error.toLowerCase().includes('42p01')
    return (
      <div className="space-y-5 p-2">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Automations</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Build workflows that react to WhatsApp® events automatically.</p>
        </div>

        <div className={`rounded-xl border p-5 space-y-3 ${isMissingTable ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          <div className="flex items-start gap-3">
            <span className="text-xl">{isMissingTable ? '⚠️' : '❌'}</span>
            <div>
              <p className={`text-[14px] font-semibold ${isMissingTable ? 'text-amber-800' : 'text-red-800'}`}>
                {isMissingTable ? 'Automations table not found in database' : 'Failed to load automations'}
              </p>
              <p className={`text-[12px] mt-1 ${isMissingTable ? 'text-amber-700' : 'text-red-600'}`}>
                {isMissingTable
                  ? 'The automations tables need to be created. Go to Supabase Dashboard → SQL Editor and run migrations 006–007.'
                  : error}
              </p>
            </div>
          </div>

          {isMissingTable && (
            <div className="flex gap-2 pt-1">
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-[12px] font-semibold text-white hover:bg-amber-800 transition-colors">
                Open Supabase SQL Editor ↗
              </a>
              <Button variant="outline" size="sm" onClick={() => { setError(null); load(); }}>
                Retry
              </Button>
            </div>
          )}

          {!isMissingTable && (
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setError(null); load(); }}>
                <Loader2 className="h-3.5 w-3.5 mr-1" /> Retry
              </Button>
              <p className="text-[11px] text-red-500 self-center">
                If Supabase was just waking up, wait a few seconds and retry.
              </p>
            </div>
          )}
        </div>

        {/* Still show the create button so user isn't stuck */}
        <Button onClick={() => { setError(null); router.push('/automations/new') }}
          className="bg-foreground text-background hover:bg-foreground/90">
          <Plus className="h-4 w-4" /> Try Creating an Automation
        </Button>
      </div>
    )
  }

  if (automations === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground" />
      </div>
    )
  }

  const showTemplates = automations.length < 3

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build workflows that react to WhatsApp® events automatically.
          </p>
        </div>
        <Button
          onClick={() => router.push("/automations/new")}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" />
          Create Automation
        </Button>
      </div>

      {showTemplates && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground/70">Quick-start templates</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const t = AUTOMATION_TEMPLATES[slug]
              const Icon = TEMPLATE_ICON[slug]
              return (
                <button
                  key={slug}
                  onClick={() => startFromTemplate(slug)}
                  className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/50 hover:bg-card/80"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/10 text-foreground group-hover:bg-foreground/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/10">
            <Zap className="h-6 w-6 text-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">No automations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a template above or create one from scratch.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleActive(a, next)}
              onEdit={() => router.push(`/automations/${a.id}/edit`)}
              onDuplicate={() => duplicate(a)}
              onLogs={() => router.push(`/automations/${a.id}/logs`)}
              onDelete={() => setPendingDelete(a)}
            />
          ))}
        </ul>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete automation</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="text-foreground">{pendingDelete?.name}</span> and its execution
              history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
}: {
  automation: Automation
  onToggle: (next: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onLogs: () => void
  onDelete: () => void
}) {
  const meta = triggerMeta(automation.trigger_type)
  return (
    <li className="rounded-xl border border-border bg-card transition-colors hover:border-border">
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-foreground/10"
          aria-hidden
        >
          <Zap className="h-5 w-5 text-foreground" />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="active">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{automation.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                meta.pillClass,
              )}
            >
              {meta.label}
            </span>
            <span className="tabular-nums">
              {automation.execution_count} run{automation.execution_count === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>last {formatRelative(automation.last_executed_at)}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? "Deactivate" : "Activate"}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className="h-4 w-4" />
                View Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}
