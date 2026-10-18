/** Row of the `audit_log` table (exists in production, absent from the generated Supabase types). */
export interface AuditLogEntry {
  id: string;
  record_id: string;
  action: string;
  changed_at: string;
  changed_by_email?: string | null;
  changed_fields?: string[] | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}
