import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET — load current agent config for the authenticated user */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ agent: data })
}

/** POST — upsert agent config */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Never let user override user_id
  delete body.id
  delete body.user_id
  delete body.created_at
  delete body.updated_at

  const { data, error } = await supabase
    .from('ai_agents')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}
