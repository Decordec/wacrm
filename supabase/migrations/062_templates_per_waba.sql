-- ============================================================
-- 062: message templates per WhatsApp Business Account
--
-- Templates belong to a WABA on Meta's side. With several numbers on
-- one account (migration 061) — possibly in different WABAs / business
-- portfolios (e.g. Decordec, RMC, Saze Home) — the catalog must know
-- which WABA each template lives in, so the template picker only offers
-- templates the sending number can actually use.
-- ============================================================

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS waba_id TEXT;

-- Backfill: existing templates came from the account's default number.
UPDATE message_templates t
   SET waba_id = c.waba_id
  FROM whatsapp_config c
 WHERE t.waba_id IS NULL
   AND c.account_id = t.account_id
   AND c.is_default
   AND c.waba_id IS NOT NULL;

-- The same name/language may now exist once per WABA.
DROP INDEX IF EXISTS message_templates_account_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_waba_name_language_key
  ON message_templates (account_id, COALESCE(waba_id, ''), name, language);

CREATE INDEX IF NOT EXISTS idx_message_templates_waba
  ON message_templates (account_id, waba_id);
