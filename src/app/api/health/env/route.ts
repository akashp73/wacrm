import { NextResponse } from 'next/server'

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  // Required for webhook POST signature verification. If missing, every
  // inbound WhatsApp message is rejected with 401 and silently dropped.
  'META_APP_SECRET',
]

export async function GET() {
  const missing: string[] = []
  const present: string[] = []

  for (const name of REQUIRED_VARS) {
    if (process.env[name]) {
      present.push(name)
    } else {
      missing.push(name)
    }
  }

  return NextResponse.json({ missing, present })
}
