import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

/**
 * GET /api/whatsapp/numbers
 *
 * Every WhatsApp number connected to the caller's account (migration
 * 061), default first. Secrets (access / verify tokens) are never
 * returned. Any member can list them — the inbox and broadcast screens
 * need the labels; changing them requires admin (see ./[id]).
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('whatsapp_config')
      .select(
        'id, label, phone_number_id, waba_id, status, is_default, pipeline_id, auto_create_deal, registered_at, subscribed_apps_at, last_registration_error, connected_at, created_at',
      )
      .eq('account_id', accountId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[whatsapp/numbers] list failed:', error.message)
      return NextResponse.json({ error: 'Failed to load numbers' }, { status: 500 })
    }
    return NextResponse.json({ numbers: data ?? [] })
  } catch (error) {
    return toErrorResponse(error)
  }
}
