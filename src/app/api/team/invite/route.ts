import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * POST /api/team/invite
 * Body: { email, name?, role }
 *
 * 1. Inserts a team_members row (status=pending).
 * 2. Sends a Supabase magic-link invite via the service-role admin API.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, name, role } = await request.json()

  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 })
  }
  if (!['admin', 'agent', 'viewer'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Insert team_members row
  const { error: insertError } = await supabase
    .from('team_members')
    .upsert(
      {
        owner_user_id: user.id,
        member_email: email.toLowerCase().trim(),
        member_name: name?.trim() || null,
        role,
        status: 'pending',
        invited_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id,member_email', ignoreDuplicates: false },
    )

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'This email has already been invited' }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Send invite email via Supabase admin API (requires service role key)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    )
    await admin.auth.admin.inviteUserByEmail(email.toLowerCase().trim(), {
      data: {
        invited_by: user.email,
        role,
        workspace_owner_id: user.id,
      },
    })
  }

  return NextResponse.json({ success: true })
}
