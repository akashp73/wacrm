import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

interface InNode {
  id: string
  type?: string
  data?: { node_type?: string; config?: Record<string, unknown>; label?: string }
  position?: { x: number; y: number }
}
interface InEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string | null
  label?: string | null
}

function normalizeNode(n: InNode) {
  const type = n.data?.node_type ?? n.type ?? 'send_message'
  return {
    id: n.id,
    type,
    position: n.position ?? { x: 100, y: 100 },
    data: {
      config: n.data?.config ?? {},
      label: n.data?.label ?? '',
    },
  }
}

function normalizeEdge(e: InEdge) {
  return {
    id: e.id ?? `${e.source}-${e.target}-${e.sourceHandle ?? 'output'}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? 'output',
    label: e.label ?? null,
  }
}

/** Derive the `trigger` column (used for fast lookups by the runner) from the Start node's config. */
function deriveTrigger(nodes: ReturnType<typeof normalizeNode>[]): 'message_received' | 'webhook' {
  const start = nodes.find(n => n.id === 'start' || n.type === 'trigger')
  const cfg = (start?.data?.config ?? {}) as Record<string, unknown>
  return cfg.trigger_type === 'webhook' ? 'webhook' : 'message_received'
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: bot, error } = await supabase
    .from('bots')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !bot) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ bot })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const update: Record<string, unknown> = {}

  if (typeof body.name === 'string') update.name = body.name.trim() || 'Untitled Bot'
  if (body.status === 'active' || body.status === 'inactive') update.status = body.status
  if (typeof body.is_active === 'boolean') update.status = body.is_active ? 'active' : 'inactive'

  if (Array.isArray(body.nodes)) {
    const nodes = (body.nodes as InNode[]).map(normalizeNode)
    update.nodes = nodes
    update.trigger = deriveTrigger(nodes)
  }
  if (Array.isArray(body.edges)) {
    update.edges = (body.edges as InEdge[]).map(normalizeEdge)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true })
  }

  const { data: bot, error } = await supabase
    .from('bots')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !bot) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  return NextResponse.json({ bot })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('bots').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
