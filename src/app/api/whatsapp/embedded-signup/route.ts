import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'
import { subscribeWabaToApp } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

// ============================================================
// Connect WhatsApp through Meta Embedded Signup.
//
// With the "WhatsApp Business app" feature (Coexistence) the number keeps
// working in the WhatsApp Business app on the phone while the CRM gets
// Cloud API access; Meta then lets us import the phone's contacts and up
// to 6 months of chat history once, and echoes every message the
// business sends from the phone.
//
// GET  → public config the browser needs to launch the popup.
// POST → { code, waba_id, phone_number_id?, label?, pipeline_id? }
//        exchanges the code for a business token, saves the number,
//        subscribes the WABA to our app and starts the contact +
//        history sync.
//
// Env: META_APP_ID, META_ES_CONFIG_ID (Facebook Login for Business
// configuration id) and the app's secret — META_ES_APP_SECRET, or the
// first entry of META_APP_SECRET.
// ============================================================

const GRAPH = 'https://graph.facebook.com/v21.0'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null
function supabaseAdmin() {
  if (!_admin) {
    _admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _admin
}

function appSecret(): string | null {
  const explicit = process.env.META_ES_APP_SECRET?.trim()
  if (explicit) return explicit
  const first = (process.env.META_APP_SECRET ?? '').split(',')[0]?.trim()
  return first || null
}

function embeddedSignupConfig() {
  const appId = process.env.META_APP_ID?.trim() || null
  const configId = process.env.META_ES_CONFIG_ID?.trim() || null
  return {
    enabled: !!(appId && configId && appSecret()),
    appId,
    configId,
    graphVersion: 'v21.0',
  }
}

export async function GET() {
  try {
    await requireRole('admin')
    const cfg = embeddedSignupConfig()
    return NextResponse.json({ enabled: cfg.enabled, appId: cfg.appId, configId: cfg.configId, graphVersion: cfg.graphVersion })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    return NextResponse.json({ enabled: false }, { status: 200 })
  }
}

async function graphJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number }
  }
  if (!res.ok || body.error) {
    throw new Error(body.error?.message || `Meta API error ${res.status}`)
  }
  return body
}

interface PhoneInfo {
  id: string
  display_phone_number?: string
  verified_name?: string
  is_on_biz_app?: boolean
  platform_type?: string
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const limit = checkRateLimit(`whatsapp-admin:${userId}`, RATE_LIMITS.whatsappAdmin)
    if (!limit.success) return rateLimitResponse(limit)

    const cfg = embeddedSignupConfig()
    const secret = appSecret()
    if (!cfg.enabled || !cfg.appId || !secret) {
      return NextResponse.json(
        { error: 'Embedded Signup is not configured on the server (META_APP_ID, META_ES_CONFIG_ID, app secret).' },
        { status: 400 },
      )
    }

    const body = (await request.json().catch(() => null)) as {
      code?: string
      waba_id?: string
      phone_number_id?: string
      label?: string
      pipeline_id?: string | null
    } | null
    if (!body?.code || !body.waba_id) {
      return NextResponse.json({ error: 'Missing code or waba_id from the signup flow.' }, { status: 400 })
    }
    const wabaId = String(body.waba_id).replace(/[^0-9]/g, '')

    // 1. Exchange the one-time code for a business integration token.
    const tokenRes = await graphJson(
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(cfg.appId)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(body.code)}`,
    )
    const accessToken = String(tokenRes.access_token ?? '')
    if (!accessToken) throw new Error('Meta did not return an access token.')
    const auth = { Authorization: `Bearer ${accessToken}` }

    // 2. Which number? Coexistence only reports the WABA, so list it.
    const list = await graphJson(
      `${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type&limit=50`,
      { headers: auth },
    )
    const numbers = ((list.data as PhoneInfo[]) ?? []).filter(Boolean)
    const phone =
      numbers.find((n) => n.id === body.phone_number_id) ??
      numbers.find((n) => n.is_on_biz_app) ??
      numbers[0]
    if (!phone) throw new Error('No phone number found on the connected WhatsApp Business Account.')

    // 3. One number belongs to one account.
    const { data: claimed } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone.id)
      .neq('account_id', accountId)
      .maybeSingle()
    if (claimed) {
      return NextResponse.json({ error: 'This number is already connected to another CRM workspace.' }, { status: 409 })
    }

    // 4. Deliver this WABA's webhooks to our app.
    let subscribedAt: string | null = null
    try {
      await subscribeWabaToApp({ wabaId, accessToken })
      subscribedAt = new Date().toISOString()
    } catch (e) {
      console.error('[embedded-signup] subscribed_apps failed:', e instanceof Error ? e.message : e)
    }

    // 5. Save (or refresh) the number. A coexistence number is already
    //    registered on WhatsApp — it must NOT be re-registered.
    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, verify_token')
      .eq('account_id', accountId)
      .eq('phone_number_id', phone.id)
      .maybeSingle()
    const { count } = await supabase
      .from('whatsapp_config')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)

    const label = (body.label ?? '').trim() || phone.verified_name || phone.display_phone_number || null
    const now = new Date().toISOString()
    const row = {
      phone_number_id: phone.id,
      waba_id: wabaId,
      access_token: encrypt(accessToken),
      status: 'connected',
      connected_at: now,
      registered_at: now,
      subscribed_apps_at: subscribedAt,
      last_registration_error: null,
      updated_at: now,
      label,
      ...(body.pipeline_id !== undefined ? { pipeline_id: body.pipeline_id || null } : {}),
      ...(body.pipeline_id ? { auto_create_deal: true } : {}),
    }

    let configId: string
    if (existing) {
      const { error } = await supabase.from('whatsapp_config').update(row).eq('id', existing.id)
      if (error) throw new Error(error.message)
      configId = existing.id
    } else {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: userId,
          ...row,
          // Webhook handshake token. Meta's app-level webhook keeps the
          // token it was set up with; any account's token passes.
          verify_token: encrypt(randomBytes(18).toString('base64url')),
          ...((count ?? 0) === 0 ? { is_default: true } : {}),
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      configId = data.id
    }

    // 6. Coexistence: pull the phone's contacts, then chat history. Each
    //    may be requested once, within 24h of onboarding. The results
    //    arrive as webhooks (smb_app_state_sync / history).
    const sync: Record<string, string> = {}
    if (phone.is_on_biz_app !== false) {
      for (const syncType of ['smb_app_state_sync', 'history']) {
        try {
          await graphJson(`${GRAPH}/${phone.id}/smb_app_data`, {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
          })
          sync[syncType] = 'requested'
        } catch (e) {
          sync[syncType] = e instanceof Error ? e.message : 'failed'
        }
      }
    }

    return NextResponse.json({
      success: true,
      config_id: configId,
      phone_number_id: phone.id,
      display_phone_number: phone.display_phone_number ?? null,
      verified_name: phone.verified_name ?? null,
      coexistence: phone.is_on_biz_app === true,
      webhook_subscribed: !!subscribedAt,
      sync,
    })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('[embedded-signup] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connecting WhatsApp failed.' },
      { status: 502 },
    )
  }
}
