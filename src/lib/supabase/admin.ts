import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client for trusted server code only (Stripe webhook, plan price sync). Bypasses RLS. */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
