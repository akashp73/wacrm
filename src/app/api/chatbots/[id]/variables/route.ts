import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id: chatbot_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, var_type } = await request.json()

  const { data, error } = await supabase
    .from('chatbot_variables')
    .insert({ chatbot_id, name, var_type })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ variable: data })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: chatbot_id } = await params
  const { name } = await request.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('chatbot_variables').delete()
    .eq('chatbot_id', chatbot_id).eq('name', name)

  return NextResponse.json({ success: true })
}
