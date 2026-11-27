// ============================================================
// Which WhatsApp number does this send go out on?
//
// Since migration 061 an account can connect several numbers. Every
// outbound path used to load "the" config with
// `.eq('account_id', …).single()`, which errors as soon as a second row
// exists. These helpers are the single place that decides:
//
//   - a conversation sends on the number it runs on
//     (`conversations.whatsapp_config_id`), falling back to the
//     account's default number for threads created before 061;
//   - anything without a conversation (public API, contact page,
//     template sync) uses the account's default number;
//   - an explicit config id (broadcasts, settings) is honoured only if
//     it belongs to the account.
//
// "Default" = the row flagged `is_default`, else the oldest row, so an
// account with a single number never has to think about it.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// The helpers only use the query builder, so any Supabase client
// (RLS-scoped user client or service role) works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WhatsAppConfigRow = Record<string, any> & {
  id: string;
  account_id: string;
  phone_number_id: string;
  access_token: string;
};

/** The account's default number, or null when none is connected. */
export async function getDefaultWhatsAppConfig(
  db: Db,
  accountId: string,
  select = '*'
): Promise<WhatsAppConfigRow | null> {
  // Fast path: the flagged default (at most one per account — partial
  // unique index from migration 061).
  const { data: flagged, error: flaggedErr } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .eq('is_default', true)
    .maybeSingle();
  if (!flaggedErr && flagged) return flagged as unknown as WhatsAppConfigRow;

  // No flagged row (e.g. a number saved before 061 that missed the
  // backfill): fall back to the oldest number.
  const { data, error } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.error('[config-resolver] default config lookup failed:', error.message);
    return null;
  }
  return ((data as unknown as WhatsAppConfigRow[] | null)?.[0] ?? null);
}

/** A specific number, only if it belongs to the account. */
export async function getWhatsAppConfigById(
  db: Db,
  accountId: string,
  configId: string,
  select = '*'
): Promise<WhatsAppConfigRow | null> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .eq('id', configId)
    .maybeSingle();
  if (error) {
    console.error('[config-resolver] config lookup failed:', error.message);
    return null;
  }
  return (data as unknown as WhatsAppConfigRow | null) ?? null;
}

/**
 * The explicit number when one is given (and it belongs to the
 * account), otherwise the default number.
 */
export async function getWhatsAppConfigOrDefault(
  db: Db,
  accountId: string,
  configId: string | null | undefined,
  select = '*'
): Promise<WhatsAppConfigRow | null> {
  if (configId) {
    const row = await getWhatsAppConfigById(db, accountId, configId, select);
    if (row) return row;
  }
  return getDefaultWhatsAppConfig(db, accountId, select);
}

/**
 * The number a conversation runs on. Falls back to the default number
 * when the thread predates 061 or its number was deleted.
 */
export async function getWhatsAppConfigForConversation(
  db: Db,
  accountId: string,
  conversationId: string | null | undefined,
  select = '*'
): Promise<WhatsAppConfigRow | null> {
  let configId: string | null = null;
  if (conversationId) {
    const { data } = await db
      .from('conversations')
      .select('whatsapp_config_id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    configId = (data as { whatsapp_config_id?: string | null } | null)?.whatsapp_config_id ?? null;
  }
  return getWhatsAppConfigOrDefault(db, accountId, configId, select);
}

/**
 * The number that owns a WhatsApp Business Account (templates live on
 * the WABA, not the number). Falls back to the default number when the
 * WABA is unknown — e.g. a template saved before migration 062.
 */
export async function getWhatsAppConfigForWaba(
  db: Db,
  accountId: string,
  wabaId: string | null | undefined,
  select = '*'
): Promise<WhatsAppConfigRow | null> {
  if (wabaId) {
    const { data, error } = await db
      .from('whatsapp_config')
      .select(select)
      .eq('account_id', accountId)
      .eq('waba_id', wabaId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (!error) {
      const row = (data as unknown as WhatsAppConfigRow[] | null)?.[0];
      if (row) return row;
    }
  }
  return getDefaultWhatsAppConfig(db, accountId, select);
}

/** Every number on the account, default first. */
export async function listWhatsAppConfigs(
  db: Db,
  accountId: string,
  select = '*'
): Promise<WhatsAppConfigRow[]> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select(select)
    .eq('account_id', accountId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[config-resolver] config list failed:', error.message);
    return [];
  }
  return (data as unknown as WhatsAppConfigRow[] | null) ?? [];
}

/** How many numbers the account has connected. */
export async function countWhatsAppConfigs(db: Db, accountId: string): Promise<number> {
  const { count } = await db
    .from('whatsapp_config')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  return count ?? 0;
}
