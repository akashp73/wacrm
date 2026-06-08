import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const START_NODE = {
  id: 'start',
  type: 'trigger',
  position: { x: 80, y: 240 },
  data: { config: { trigger_type: 'message_received' }, label: 'Start' },
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bots')
    .select('id, name, status, trigger, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bots: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json().catch(() => ({}))

  const { data: bot, error } = await supabase
    .from('bots')
    .insert({
      user_id: user.id,
      name: name?.trim() || 'Untitled Bot',
      status: 'inactive',
      trigger: 'message_received',
      nodes: [START_NODE],
      edges: [],
    })
    .select('id, name, status, trigger, created_at')
    .single()

  if (error || !bot) return NextResponse.json({ error: error?.message }, { status: 500 })
  return NextResponse.json({ bot })
}
