import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Untyped view of the Supabase client for tables that exist in production but are
 * missing from the generated `types.ts` (e.g. `call_coaching`, which has no creating
 * migration in this repo - see supabase/migrations/DRIFT-REPORT.md).
 * Prefer the typed `supabase` client everywhere else.
 */
export const supabaseUntyped = supabase as unknown as SupabaseClient;
