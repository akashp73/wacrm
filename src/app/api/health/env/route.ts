import { NextResponse } from 'next/server'

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
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
