import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, activated_at, expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  // No row = free plan by default
  const plan   = data?.plan   ?? 'free'
  const status = data?.status ?? 'active'
  const isPremium = plan === 'premium' && status === 'active'

  // Superadmin is always premium
  const isSuperAdmin = user.email === process.env.SUPERADMIN_EMAIL

  return NextResponse.json({
    plan:        isSuperAdmin ? 'premium' : plan,
    status,
    is_premium:  isSuperAdmin || isPremium,
    activated_at: data?.activated_at ?? null,
    expires_at:   data?.expires_at ?? null,
  })
}
