import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/superadmin'
import { supabaseAdmin } from '@/lib/automations/admin-client'

type ActionType = 'activate_premium' | 'deactivate_premium' | 'suspend' | 'unsuspend'

export async function POST(request: Request) {
  const [isAdmin, supabase] = await Promise.all([isSuperAdmin(), createClient()])
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  if (!adminUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, userId } = await request.json() as { type: ActionType; userId: string }
  if (!type || !userId) return NextResponse.json({ error: 'type and userId are required' }, { status: 400 })

  const admin = supabaseAdmin()
  const now   = new Date().toISOString()

  if (type === 'activate_premium') {
    await admin.from('subscriptions').upsert({
      user_id:      userId,
      plan:         'premium',
      status:       'active',
      activated_by: adminUser.id,
      activated_at: now,
      updated_at:   now,
    }, { onConflict: 'user_id' })

    await admin.from('admin_logs').insert({
      admin_id:       adminUser.id,
      action:         'activate_premium',
      target_user_id: userId,
      details:        { activated_at: now },
    })
  } else if (type === 'deactivate_premium') {
    await admin.from('subscriptions').upsert({
      user_id:    userId,
      plan:       'free',
      status:     'active',
      updated_at: now,
    }, { onConflict: 'user_id' })

    await admin.from('admin_logs').insert({
      admin_id:       adminUser.id,
      action:         'deactivate_premium',
      target_user_id: userId,
      details:        {},
    })
  } else if (type === 'suspend') {
    // Ban for 100 years
    await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })

    await admin.from('admin_logs').insert({
      admin_id:       adminUser.id,
      action:         'suspend_user',
      target_user_id: userId,
      details:        { suspended_at: now },
    })
  } else if (type === 'unsuspend') {
    await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })

    await admin.from('admin_logs').insert({
      admin_id:       adminUser.id,
      action:         'unsuspend_user',
      target_user_id: userId,
      details:        { unsuspended_at: now },
    })
  } else {
    return NextResponse.json({ error: `Unknown action: ${type}` }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
