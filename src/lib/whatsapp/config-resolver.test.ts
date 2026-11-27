import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  countWhatsAppConfigs,
  getDefaultWhatsAppConfig,
  getWhatsAppConfigById,
  getWhatsAppConfigForConversation,
  getWhatsAppConfigOrDefault,
} from './config-resolver';

type Row = Record<string, unknown>;

/**
 * Minimal in-memory Supabase: honours eq / order / limit / maybeSingle
 * and count, which is all the resolver uses.
 */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let countMode = false;
      const q = {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          countMode = !!opts?.head;
          return q;
        },
        eq(col: string, val: unknown) {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        order(col: string, opts: { ascending: boolean }) {
          rows.sort((a, b) => {
            const x = a[col] as string | boolean;
            const y = b[col] as string | boolean;
            if (x === y) return 0;
            return (x > y ? 1 : -1) * (opts.ascending ? 1 : -1);
          });
          return q;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return q;
        },
        async maybeSingle() {
          if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (v: unknown) => unknown) {
          return resolve(
            countMode
              ? { count: rows.length, data: null, error: null }
              : { data: rows, error: null }
          );
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const decordec = {
  id: 'cfg-decordec',
  account_id: 'acct-1',
  label: 'Decordec',
  phone_number_id: 'pn-1',
  access_token: 'enc-1',
  is_default: true,
  created_at: '2026-11-27T10:00:00Z',
};
const rmc = {
  id: 'cfg-rmc',
  account_id: 'acct-1',
  label: 'RMC',
  phone_number_id: 'pn-2',
  access_token: 'enc-2',
  is_default: false,
  created_at: '2026-11-27T09:00:00Z',
};
const otherAccount = {
  id: 'cfg-other',
  account_id: 'acct-2',
  phone_number_id: 'pn-9',
  access_token: 'enc-9',
  is_default: true,
  created_at: '2026-11-01T00:00:00Z',
};

describe('config-resolver', () => {
  it('returns the flagged default even when another number is older', async () => {
    const db = fakeDb({ whatsapp_config: [rmc, decordec, otherAccount] });
    expect((await getDefaultWhatsAppConfig(db, 'acct-1'))?.id).toBe('cfg-decordec');
  });

  it('falls back to the oldest number when none is flagged', async () => {
    const db = fakeDb({
      whatsapp_config: [
        { ...decordec, is_default: false },
        { ...rmc, is_default: false },
      ],
    });
    expect((await getDefaultWhatsAppConfig(db, 'acct-1'))?.id).toBe('cfg-rmc');
  });

  it('returns null when the account has no number', async () => {
    const db = fakeDb({ whatsapp_config: [otherAccount] });
    expect(await getDefaultWhatsAppConfig(db, 'acct-1')).toBeNull();
  });

  it('honours an explicit number only inside the account', async () => {
    const db = fakeDb({ whatsapp_config: [decordec, rmc, otherAccount] });
    expect((await getWhatsAppConfigById(db, 'acct-1', 'cfg-rmc'))?.id).toBe('cfg-rmc');
    expect(await getWhatsAppConfigById(db, 'acct-1', 'cfg-other')).toBeNull();
    // A foreign id never leaks another account's number — it falls back
    // to this account's default.
    expect((await getWhatsAppConfigOrDefault(db, 'acct-1', 'cfg-other'))?.id).toBe(
      'cfg-decordec'
    );
  });

  it('sends a conversation on the number it runs on', async () => {
    const db = fakeDb({
      whatsapp_config: [decordec, rmc],
      conversations: [
        { id: 'conv-rmc', account_id: 'acct-1', whatsapp_config_id: 'cfg-rmc' },
        { id: 'conv-old', account_id: 'acct-1', whatsapp_config_id: null },
      ],
    });
    expect((await getWhatsAppConfigForConversation(db, 'acct-1', 'conv-rmc'))?.id).toBe(
      'cfg-rmc'
    );
    // Threads from before migration 061 use the default number.
    expect((await getWhatsAppConfigForConversation(db, 'acct-1', 'conv-old'))?.id).toBe(
      'cfg-decordec'
    );
  });

  it('counts the account’s numbers', async () => {
    const db = fakeDb({ whatsapp_config: [decordec, rmc, otherAccount] });
    expect(await countWhatsAppConfigs(db, 'acct-1')).toBe(2);
  });
});
