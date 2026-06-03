import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [bot, nodes, edges, variables] = await Promise.all([
    supabase.from('chatbots').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('chatbot_nodes').select('*').eq('chatbot_id', id).order('created_at'),
    supabase.from('chatbot_edges').select('*').eq('chatbot_id', id),
    supabase.from('chatbot_variables').select('*').eq('chatbot_id', id).order('created_at'),
  ])

  if (bot.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    chatbot: bot.data,
    nodes: nodes.data ?? [],
    edges: edges.data ?? [],
    variables: variables.data ?? [],
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { nodes, edges, ...botFields } = body

  // Update bot metadata
  if (Object.keys(botFields).length > 0) {
    await supabase.from('chatbots').update(botFields).eq('id', id).eq('user_id', user.id)
  }

  // Sync nodes & edges if provided
  if (nodes !== undefined) {
    await supabase.from('chatbot_nodes').delete().eq('chatbot_id', id)
    if (nodes.length > 0) {
      await supabase.from('chatbot_nodes').insert(
        nodes.map((n: Record<string, unknown>) => ({
          id: n.id,
          chatbot_id: id,
          node_type: n.node_type ?? n.type,
          label: (String(n.label ?? ((n.data as Record<string,unknown>)?.label) ?? '')),
          config: n.config ?? n.data ?? {},
          position_x: (n.position as { x: number })?.x ?? 100,
          position_y: (n.position as { y: number })?.y ?? 100,
        }))
      )
    }
  }

  if (edges !== undefined) {
    await supabase.from('chatbot_edges').delete().eq('chatbot_id', id)
    if (edges.length > 0) {
      await supabase.from('chatbot_edges').insert(
        edges.map((e: Record<string, string>) => ({
          chatbot_id: id,
          source_node_id: e.source,
          target_node_id: e.target,
          source_handle: e.sourceHandle ?? null,
          label: e.label ?? null,
        }))
      )
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('chatbots').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ success: true })
}
