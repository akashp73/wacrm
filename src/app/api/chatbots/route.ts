import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chatbots')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chatbots: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, folder } = await request.json()

  const { data: bot, error: botErr } = await supabase
    .from('chatbots')
    .insert({ user_id: user.id, name: name || 'Untitled Bot', folder: folder || null })
    .select()
    .single()

  if (botErr || !bot) return NextResponse.json({ error: botErr?.message }, { status: 500 })

  // Seed a trigger node
  await supabase.from('chatbot_nodes').insert({
    chatbot_id: bot.id,
    node_type: 'trigger',
    label: 'Start',
    config: { trigger_type: 'new_message', channel: 'whatsapp' },
    position_x: 100,
    position_y: 200,
  })

  return NextResponse.json({ chatbot: bot })
}
