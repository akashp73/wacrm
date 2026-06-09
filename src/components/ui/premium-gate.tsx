import { createClient } from '@/lib/supabase/server'
import { Lock } from 'lucide-react'

interface PremiumGateProps {
  feature: string
  children: React.ReactNode
}

/**
 * Server component — wraps a page and shows a lock screen for free-plan users.
 * Usage: wrap in a route-level layout.tsx so the page file is untouched.
 */
export async function PremiumGate({ feature, children }: PremiumGateProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Superadmin always has access
  if (user?.email === process.env.SUPERADMIN_EMAIL) return <>{children}</>

  // Check subscription — fail open if subscriptions table doesn't exist yet (migration not run)
  let isPremium = false
  if (user) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error?.code === '42P01') return <>{children}</> // table doesn't exist → allow access
    isPremium = data?.plan === 'premium' && data?.status === 'active'
  }

  if (isPremium) return <>{children}</>

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-[18px] font-semibold text-foreground">{feature} is a Premium Feature</h2>
        <p className="text-[13px] text-muted-foreground max-w-sm">
          You are on the Free plan. Contact your admin to upgrade your account and unlock {feature}.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-[12px] text-muted-foreground">
        Contact <span className="font-medium text-foreground">{process.env.SUPERADMIN_EMAIL}</span> to activate Premium access.
      </div>
    </div>
  )
}
