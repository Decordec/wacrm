// Test double for ./config-resolver.
//
// Most route/lib tests predate multi-number support (migration 061) and
// fake the database with a hand-rolled builder that answers
// `from('whatsapp_config').select().eq('account_id', …).single()` with a
// single config row. This double resolves numbers exactly that way, so
// those fakes keep driving the "which number" decision without each
// test re-implementing `.order()` / `.limit()`. The real resolver has
// its own unit tests in config-resolver.test.ts.
//
// Use from a test file with:
//   vi.mock('@/lib/whatsapp/config-resolver', () => import('@/lib/whatsapp/config-resolver.test-double'))

import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any> & { id: string; account_id: string; phone_number_id: string; access_token: string };

async function singleConfig(db: Db, accountId: string, select: string): Promise<Row | null> {
  const q = db.from('whatsapp_config').select(select).eq('account_id', accountId);
  // Fakes implement either .single() or .maybeSingle().
  const { data, error } = await (typeof q.single === 'function' ? q.single() : q.maybeSingle());
  if (error || !data) return null;
  return data as unknown as Row;
}

export async function getDefaultWhatsAppConfig(db: Db, accountId: string, select = '*') {
  return singleConfig(db, accountId, select);
}

export async function getWhatsAppConfigById(db: Db, accountId: string, _configId: string, select = '*') {
  return singleConfig(db, accountId, select);
}

export async function getWhatsAppConfigOrDefault(
  db: Db,
  accountId: string,
  _configId: string | null | undefined,
  select = '*'
) {
  return singleConfig(db, accountId, select);
}

export async function getWhatsAppConfigForConversation(
  db: Db,
  accountId: string,
  _conversationId: string | null | undefined,
  select = '*'
) {
  return singleConfig(db, accountId, select);
}

export async function countWhatsAppConfigs(db: Db, accountId: string) {
  return (await singleConfig(db, accountId, 'id')) ? 1 : 0;
}
