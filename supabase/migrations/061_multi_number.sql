-- ============================================================
-- 061: several WhatsApp numbers per account
--
-- Until now an account could connect exactly one number
-- (UNIQUE(account_id) on whatsapp_config, migration 017) and a contact
-- had exactly one conversation (UNIQUE(account_id, contact_id),
-- migration 036). This migration lets one account run several numbers
-- side by side, each with its own label and its own sales pipeline:
--
--   1. whatsapp_config loses UNIQUE(account_id) and gains
--        label            — display name shown in the inbox ("Decordec")
--        is_default       — the number used when nothing else decides
--                           (public API sends, contact-page sends,
--                           template sync); at most one per account
--        pipeline_id      — the pipeline this number's leads belong to
--        auto_create_deal — when true, the first inbound message of a
--                           new conversation opens a deal in that
--                           pipeline's first stage
--   2. conversations gain whatsapp_config_id (the number the thread runs
--      on). A contact now has one conversation PER NUMBER, so the 036
--      unique index widens to (account_id, contact_id, whatsapp_config_id).
--   3. broadcasts gain whatsapp_config_id (the number they send from).
--
-- Existing rows are backfilled onto the account's (single) number, so
-- an account that never adds a second number behaves exactly as before.
-- Idempotent: safe to re-run.
-- ============================================================

-- ---- 1. whatsapp_config ------------------------------------------------

ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS auto_create_deal BOOLEAN NOT NULL DEFAULT FALSE;

-- Every account that already has a number: make its oldest number the
-- default (unless one is already marked).
UPDATE whatsapp_config w
SET is_default = TRUE
WHERE w.id = (
    SELECT w2.id FROM whatsapp_config w2
    WHERE w2.account_id = w.account_id
    ORDER BY w2.created_at ASC NULLS LAST, w2.id ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_config w3
    WHERE w3.account_id = w.account_id AND w3.is_default
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_one_default
  ON whatsapp_config(account_id) WHERE is_default;

-- ---- 2. conversations --------------------------------------------------

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;

UPDATE conversations c
SET whatsapp_config_id = w.id
FROM whatsapp_config w
WHERE w.account_id = c.account_id
  AND w.is_default
  AND c.whatsapp_config_id IS NULL;

-- One conversation per (account, contact, number). NULLs stay distinct
-- on purpose: a thread whose number was deleted (ON DELETE SET NULL)
-- must not block deleting a second number the same contact talked to.
-- The app always stamps a number on new conversations.
DROP INDEX IF EXISTS idx_conversations_account_contact;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_number
  ON conversations(account_id, contact_id, whatsapp_config_id);

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config
  ON conversations(whatsapp_config_id);

-- The 036 merge helper collapsed duplicates per (account, contact). With
-- several numbers those are no longer duplicates, so it now groups per
-- number as well.
CREATE OR REPLACE FUNCTION public.merge_duplicate_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group    RECORD;
  v_survivor UUID;
  v_losers   UUID[];
  v_all      UUID[];
  v_merged   INTEGER := 0;
BEGIN
  FOR v_group IN
    SELECT account_id,
           contact_id,
           whatsapp_config_id,
           array_agg(id ORDER BY created_at ASC, id ASC) AS ids,
           COALESCE(SUM(unread_count), 0)                AS total_unread
    FROM conversations
    WHERE whatsapp_config_id IS NOT NULL
    GROUP BY account_id, contact_id, whatsapp_config_id
    HAVING count(*) > 1
  LOOP
    v_all      := v_group.ids;
    v_survivor := v_all[1];
    v_losers   := v_all[2:array_length(v_all, 1)];

    UPDATE messages          SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE message_reactions SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE deals             SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE flow_runs         SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE notifications     SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);
    UPDATE ai_usage_log      SET conversation_id = v_survivor WHERE conversation_id = ANY(v_losers);

    UPDATE conversations c
    SET unread_count      = v_group.total_unread,
        last_message_text = lm.content_text,
        last_message_at   = lm.created_at,
        updated_at        = NOW()
    FROM (
      SELECT content_text, created_at
      FROM messages
      WHERE conversation_id = v_survivor
      ORDER BY created_at DESC
      LIMIT 1
    ) lm
    WHERE c.id = v_survivor;

    UPDATE conversations
    SET unread_count = v_group.total_unread,
        updated_at   = NOW()
    WHERE id = v_survivor
      AND NOT EXISTS (SELECT 1 FROM messages WHERE conversation_id = v_survivor);

    DELETE FROM conversations WHERE id = ANY(v_losers);
    v_merged := v_merged + COALESCE(array_length(v_losers, 1), 0);
  END LOOP;

  RETURN v_merged;
END;
$$;

ALTER FUNCTION public.merge_duplicate_conversations() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_duplicate_conversations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_conversations() TO service_role;

-- ---- 3. broadcasts -----------------------------------------------------

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;

UPDATE broadcasts b
SET whatsapp_config_id = w.id
FROM whatsapp_config w
WHERE w.account_id = b.account_id
  AND w.is_default
  AND b.whatsapp_config_id IS NULL;
