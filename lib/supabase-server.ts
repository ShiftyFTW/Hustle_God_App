import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client scoped to the authenticated user's token
 * extracted from the request Authorization header. This makes RLS
 * policies evaluate as the signed-in user rather than the bare anon
 * role (which now has zero data access).
 *
 * Returns null if no valid token is present, so the caller can
 * short-circuit with a 401.
 */
export function createUserClient(req: NextRequest): SupabaseClient | null {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}
