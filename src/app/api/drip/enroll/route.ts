import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/drip/enroll
 * Body: { drip_campaign_id: string, contact_id: string }
 *
 * Enrolls a contact in a drip campaign starting from step 1.
 * next_send_at is set to now + step 1's delay.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { drip_campaign_id, contact_id } = body

  if (!drip_campaign_id || !contact_id) {
    return NextResponse.json({ error: 'drip_campaign_id and contact_id are required' }, { status: 400 })
  }

  // Verify campaign belongs to user's workspace
  const { data: campaign } = await supabase
    .from('drip_campaigns')
    .select('id, user_id')
    .eq('id', drip_campaign_id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Get first step's delay to compute next_send_at
  const { data: firstStep } = await supabase
    .from('drip_steps')
    .select('delay_value, delay_unit')
    .eq('drip_campaign_id', drip_campaign_id)
    .eq('step_order', 1)
    .maybeSingle()

  const delayMs = firstStep
    ? (firstStep.delay_unit === 'minutes' ? firstStep.delay_value * 60_000
      : firstStep.delay_unit === 'hours' ? firstStep.delay_value * 3_600_000
      : firstStep.delay_value * 86_400_000)
    : 0

  const next_send_at = new Date(Date.now() + delayMs).toISOString()

  const { error } = await supabase.from('drip_enrollments').upsert(
    {
      drip_campaign_id,
      contact_id,
      current_step: 1,
      status: 'active',
      enrolled_at: new Date().toISOString(),
      next_send_at,
    },
    { onConflict: 'drip_campaign_id,contact_id', ignoreDuplicates: false },
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, next_send_at })
}
