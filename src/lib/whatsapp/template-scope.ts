// ============================================================
// Which templates can a given number send?
//
// Templates live on a WhatsApp Business Account (WABA). Since migration
// 062 `message_templates.waba_id` records it, so with several numbers
// connected (possibly in different business portfolios) the pickers
// only offer templates that exist in the sending number's WABA.
// Rows without a WABA (drafts, pre-062 rows) stay visible everywhere.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/**
 * The WABA of the given number, or of the account's default number when
 * no number is given. Null when it can't be resolved — callers then
 * show every template rather than none.
 */
export async function resolveNumberWaba(
  supabase: Db,
  whatsappConfigId: string | null | undefined,
): Promise<string | null> {
  const base = supabase.from('whatsapp_config').select('waba_id');
  const { data } = whatsappConfigId
    ? await base.eq('id', whatsappConfigId).maybeSingle()
    : await base.eq('is_default', true).maybeSingle();
  return (data as { waba_id?: string | null } | null)?.waba_id ?? null;
}

/** PostgREST `or` filter limiting templates to one WABA (plus unscoped rows). */
export function wabaTemplateFilter(wabaId: string): string {
  // WABA ids are numeric strings; strip anything else so the value can't
  // break out of the filter expression.
  const safe = wabaId.replace(/[^0-9A-Za-z_-]/g, '');
  return `waba_id.is.null,waba_id.eq.${safe}`;
}
