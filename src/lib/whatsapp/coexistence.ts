// ============================================================
// WhatsApp Business app "Coexistence"
//
// A number onboarded through Embedded Signup with
// featureType "whatsapp_business_app_onboarding" stays live in the
// WhatsApp Business app on the phone AND gets Cloud API access. Three
// webhook fields then carry what happens on the phone side:
//
//   history             — up to 6 months of past chats, sent once after
//                         onboarding when we request a history sync
//   smb_app_state_sync  — the phone's contact list (add / edit / remove)
//   smb_message_echoes  — messages the business sends from the phone
//                         app, so the CRM thread shows both sides
//
// This module holds the payload shapes and the pure mapping rules; the
// webhook route does the database work with its existing contact /
// conversation helpers.
// ============================================================

export const COEXISTENCE_FIELDS = new Set([
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
])

export function isCoexistenceField(field: string | undefined): boolean {
  return !!field && COEXISTENCE_FIELDS.has(field)
}

/** A message inside a history thread or an echo. Mirrors WhatsAppMessage. */
export interface CoexMessage {
  from?: string
  from_user_id?: string
  from_parent_user_id?: string
  to?: string
  to_user_id?: string
  to_parent_user_id?: string
  id: string
  timestamp: string
  type: string
  history_context?: { status?: string }
  // Type-specific body (text, image, document, …) — same keys as an
  // inbound message, so the webhook's content parser handles it.
  [key: string]: unknown
}

export interface HistoryThread {
  /** The customer's WhatsApp number. */
  id: string
  context?: {
    wa_id?: string
    user_id?: string
    parent_user_id?: string
    username?: string
  }
  messages?: CoexMessage[]
}

export interface HistoryChunk {
  metadata?: { phase?: string | number; chunk_order?: string | number; progress?: string | number }
  threads?: HistoryThread[]
  errors?: Array<{ code?: number; title?: string; message?: string }>
}

export interface StateSyncItem {
  type?: string
  action?: string
  contact?: {
    full_name?: string
    first_name?: string
    phone_number?: string
    user_id?: string
    parent_user_id?: string
    username?: string
  }
  metadata?: { timestamp?: string }
}

/** Meta error when the business declined to share chat history. */
export const HISTORY_DECLINED_CODE = 2593109

/** Digits only — Meta mixes "+91…" and "91…" across payloads. */
export function digits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Was this history message written by the customer (true) or by the
 * business from the phone (false)? The thread id is the customer's
 * number; anything not from it came from the business.
 */
export function isFromCustomer(message: CoexMessage, thread: HistoryThread): boolean {
  const customer = digits(thread.context?.wa_id ?? thread.id)
  if (message.from && customer) return digits(message.from) === customer
  if (message.from_user_id && thread.context?.user_id) {
    return message.from_user_id === thread.context.user_id
  }
  // No sender info: Meta sets `to` only on business-sent messages.
  return !message.to
}

/**
 * messages.status allows sending / sent / delivered / read / failed.
 * History statuses arrive upper- or lower-case and include values like
 * PLAYED or PENDING; map them onto that set.
 */
export function mapHistoryStatus(raw: string | undefined, fromCustomer: boolean): string {
  if (fromCustomer) return 'delivered'
  switch ((raw ?? '').toLowerCase()) {
    case 'read':
    case 'played':
      return 'read'
    case 'delivered':
      return 'delivered'
    case 'error':
    case 'failed':
      return 'failed'
    case 'pending':
    case 'sending':
      return 'sending'
    default:
      return 'sent'
  }
}

/** Contact name from a state-sync entry, best label first. */
export function stateSyncName(item: StateSyncItem): string {
  const c = item.contact ?? {}
  return (c.full_name || c.first_name || c.username || '').trim()
}

/**
 * Short text for the conversation list preview, for messages whose
 * content parser returns no text (media without caption etc.).
 */
export function previewFor(type: string, text: string | null): string {
  if (text && text.trim()) return text.slice(0, 200)
  const labels: Record<string, string> = {
    image: '📷 Photo',
    video: '🎥 Video',
    audio: '🎤 Audio',
    document: '📄 Document',
    sticker: 'Sticker',
    location: '📍 Location',
  }
  return labels[type] ?? 'Message'
}
