import { createClient } from '@/lib/supabase/server'

/** Returns true only when the currently logged-in user's email matches SUPERADMIN_EMAIL. */
export async function isSuperAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return false
  return user.email === process.env.SUPERADMIN_EMAIL
}

/** Throws a 401 NextResponse-compatible object if the caller is not the superadmin. */
export async function requireSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) {
    throw new Error('Forbidden')
  }
}
