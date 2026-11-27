import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchAllInChunks, fetchAllPages } from '@/lib/supabase/paged-query';
import type { Contact } from '@/types';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv';

export interface CsvAudienceRow {
  phone: string;
  name?: string;
}

export interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: CsvAudienceRow[];
  excludeTagIds?: string[];
  /**
   * Brand scoping: only contacts that have a conversation on this
   * WhatsApp number (Decordec, RMC, Saze Home …). Null/undefined = no
   * restriction. Ignored for CSV uploads, which are an explicit list.
   */
  brandConfigId?: string | null;
}

export function fetchBrandContactIds(
  db: SupabaseClient,
  whatsappConfigId: string,
): Promise<Set<string>> {
  return withContext('brand contacts', async () => {
    const rows = await fetchAllPages<{ contact_id: string }>((from, to) =>
      db
        .from('conversations')
        .select('contact_id')
        .eq('whatsapp_config_id', whatsappConfigId)
        .order('id')
        .range(from, to),
    );
    return new Set(rows.map((row) => row.contact_id).filter(Boolean));
  });
}

function intersect(a: Set<string>, b: Set<string> | null): Set<string> {
  if (!b) return a;
  const out = new Set<string>();
  for (const id of a) if (b.has(id)) out.add(id);
  return out;
}

async function withContext<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch ${label}: ${message}`);
  }
}

export function fetchTaggedContactIds(
  db: SupabaseClient,
  tagIds: readonly string[],
): Promise<Set<string>> {
  return withContext('contact tags', async () => {
    const rows = await fetchAllInChunks<{ contact_id: string }, string>(
      tagIds,
      (slice, from, to) =>
        db
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', slice)
          .order('id')
          .range(from, to),
    );
    return new Set(rows.map((row) => row.contact_id));
  });
}

export function fetchCustomFieldContactIds(
  db: SupabaseClient,
  filter: CustomFieldFilter,
): Promise<Set<string>> {
  return withContext('custom field matches', async () => {
    const { fieldId, operator, value } = filter;
    const rows = await fetchAllPages<{ contact_id: string }>((from, to) => {
      let query = db
        .from('contact_custom_values')
        .select('contact_id')
        .eq('custom_field_id', fieldId);
      if (operator === 'is') query = query.eq('value', value);
      else if (operator === 'is_not') query = query.neq('value', value);
      else query = query.ilike('value', `%${value}%`);
      return query.order('id').range(from, to);
    });
    return new Set(rows.map((row) => row.contact_id));
  });
}

export function fetchContactsByIds(
  db: SupabaseClient,
  ids: readonly string[],
): Promise<Contact[]> {
  return withContext('contacts', () =>
    fetchAllInChunks<Contact, string>(ids, (slice, from, to) =>
      db.from('contacts').select('*').in('id', slice).order('id').range(from, to),
    ),
  );
}

export function fetchAllContacts(db: SupabaseClient): Promise<Contact[]> {
  return withContext('contacts', () =>
    fetchAllPages<Contact>((from, to) =>
      db.from('contacts').select('*').order('id').range(from, to),
    ),
  );
}

async function fetchExcludedIds(
  db: SupabaseClient,
  audience: AudienceConfig,
): Promise<Set<string>> {
  if (!audience.excludeTagIds || audience.excludeTagIds.length === 0) {
    return new Set();
  }
  return fetchTaggedContactIds(db, audience.excludeTagIds);
}

function hasCustomFieldFilter(
  audience: AudienceConfig,
): audience is AudienceConfig & { customField: CustomFieldFilter } {
  return Boolean(audience.customField?.fieldId);
}

async function fetchAudienceContactIds(
  db: SupabaseClient,
  audience: AudienceConfig,
): Promise<Set<string> | null> {
  if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
    return fetchTaggedContactIds(db, audience.tagIds);
  }
  if (audience.type === 'custom_field' && hasCustomFieldFilter(audience)) {
    return fetchCustomFieldContactIds(db, audience.customField);
  }
  return null;
}

export async function resolveAudienceContacts(
  db: SupabaseClient,
  audience: AudienceConfig,
  resolveCsv: (rows: CsvAudienceRow[]) => Promise<Contact[]>,
): Promise<Contact[]> {
  const excluded = await fetchExcludedIds(db, audience);
  const keep = (contact: Contact) => !excluded.has(contact.id);

  if (audience.type === 'csv') {
    if (!audience.csvContacts) return [];
    return (await resolveCsv(audience.csvContacts)).filter(keep);
  }

  const brand = audience.brandConfigId
    ? await fetchBrandContactIds(db, audience.brandConfigId)
    : null;

  if (audience.type === 'all') {
    if (!brand) return (await fetchAllContacts(db)).filter(keep);
    const wantedBrand = [...brand].filter((id) => !excluded.has(id));
    return wantedBrand.length ? fetchContactsByIds(db, wantedBrand) : [];
  }

  const rawIds = await fetchAudienceContactIds(db, audience);
  if (!rawIds) return [];
  const ids = intersect(rawIds, brand);
  const wanted = [...ids].filter((id) => !excluded.has(id));
  if (wanted.length === 0) return [];
  return fetchContactsByIds(db, wanted);
}

export async function countAudience(
  db: SupabaseClient,
  audience: AudienceConfig,
): Promise<number | null> {
  if (audience.type === 'csv') {
    return audience.csvContacts && audience.csvContacts.length > 0
      ? audience.csvContacts.length
      : null;
  }

  const brand = audience.brandConfigId
    ? await fetchBrandContactIds(db, audience.brandConfigId)
    : null;

  if (audience.type === 'all' && brand) {
    const excluded = await fetchExcludedIds(db, audience);
    let size = 0;
    for (const id of brand) if (!excluded.has(id)) size++;
    return size;
  }

  if (audience.type === 'all') {
    const { count, error } = await db
      .from('contacts')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(`Failed to count contacts: ${error.message}`);
    const total = count ?? 0;
    const excluded = await fetchExcludedIds(db, audience);
    return Math.max(0, total - excluded.size);
  }

  if (audience.type === 'custom_field' && !audience.customField?.value) {
    return null;
  }

  const rawIds = await fetchAudienceContactIds(db, audience);
  if (!rawIds) return null;
  const ids = intersect(rawIds, brand);
  const excluded = await fetchExcludedIds(db, audience);
  let size = 0;
  for (const id of ids) if (!excluded.has(id)) size++;
  return size;
}
