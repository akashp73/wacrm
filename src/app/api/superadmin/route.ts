import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/superadmin'
import { supabaseAdmin } from '@/lib/automations/admin-client'

export async function GET() {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = supabaseAdmin()

  // Fetch all auth users
  const { data: { users: authUsers }, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Fetch all profiles, subscriptions, whatsapp_config in parallel
  const [profilesRes, subsRes, waRes, logsRes] = await Promise.all([
    admin.from('profiles').select('user_id, full_name, email, role, created_at'),
    admin.from('subscriptions').select('user_id, plan, status, activated_at, expires_at'),
    admin.from('whatsapp_config').select('user_id, phone_number_id, waba_id, connected_at, status'),
    admin.from('admin_logs').select('id, action, target_user_id, admin_id, details, created_at').order('created_at', { ascending: false }).limit(100),
  ])

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p]))
  const subMap     = new Map((subsRes.data ?? []).map(s => [s.user_id, s]))
  const waMap      = new Map((waRes.data ?? []).map(w => [w.user_id, w]))

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Build enriched user list (only users with profiles = workspace owners)
  const users = authUsers
    .filter(u => profileMap.has(u.id))
    .map(u => {
      const profile = profileMap.get(u.id)!
      const sub     = subMap.get(u.id)
      const wa      = waMap.get(u.id)
      const isBanned = !!u.banned_until && new Date(u.banned_until) > new Date()
      return {
        id:           u.id,
        email:        u.email ?? profile.email,
        full_name:    profile.full_name,
        created_at:   u.created_at,
        last_sign_in: u.last_sign_in_at,
        is_new:       u.created_at >= sevenDaysAgo,
        suspended:    isBanned,
        banned_until: u.banned_until ?? null,
        plan:         sub?.plan ?? 'free',
        sub_status:   sub?.status ?? 'active',
        activated_at: sub?.activated_at ?? null,
        wa_connected:      !!wa?.phone_number_id,
        wa_phone_id:       wa?.phone_number_id ?? null,
        wa_waba_id:        wa?.waba_id ?? null,
        wa_connected_at:   wa?.connected_at ?? null,
        wa_status:         wa?.status ?? null,
      }
    })

  // Overview stats
  const stats = {
    total_signups:        users.length,
    new_this_week:        users.filter(u => u.is_new).length,
    premium:              users.filter(u => u.plan === 'premium' && u.sub_status === 'active').length,
    free:                 users.filter(u => u.plan !== 'premium' || u.sub_status !== 'active').length,
    wa_connected:         users.filter(u => u.wa_connected).length,
    wa_not_connected:     users.filter(u => !u.wa_connected).length,
    suspended:            users.filter(u => u.suspended).length,
  }

  // Attach admin email to each log entry
  const adminEmailMap = new Map(authUsers.map(u => [u.id, u.email]))
  const logs = (logsRes.data ?? []).map(l => ({
    ...l,
    admin_email:       l.admin_id ? (adminEmailMap.get(l.admin_id) ?? l.admin_id) : 'system',
    target_user_email: l.target_user_id ? (adminEmailMap.get(l.target_user_id) ?? (l.details as Record<string, unknown>)?.email ?? l.target_user_id) : null,
  }))

  return NextResponse.json({ stats, users, logs })
}
