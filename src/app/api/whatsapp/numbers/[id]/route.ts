import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * PATCH /api/whatsapp/numbers/:id
 *
 * Update a connected number's CRM settings — label, pipeline,
 * auto-create-deal, default — without re-verifying its Meta
 * credentials (that's POST /api/whatsapp/config). Admin only, same as
 * every other whatsapp_config write.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    const patch: Record<string, unknown> = {}
    if (typeof body.label === 'string') patch.label = body.label.trim().slice(0, 60) || null
    if (body.pipeline_id === null || body.pipeline_id === '') patch.pipeline_id = null
    else if (typeof body.pipeline_id === 'string') patch.pipeline_id = body.pipeline_id
    if (typeof body.auto_create_deal === 'boolean') patch.auto_create_deal = body.auto_create_deal
    const makeDefault = body.is_default === true

    if (Object.keys(patch).length === 0 && !makeDefault) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data: row } = await supabase
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', accountId)
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'Number not found' }, { status: 404 })

    // A pipeline must belong to the same account.
    if (typeof patch.pipeline_id === 'string') {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('account_id', accountId)
        .eq('id', patch.pipeline_id)
        .maybeSingle()
      if (!pipeline) return NextResponse.json({ error: 'Pipeline not found' }, { status: 400 })
    }

    if (makeDefault) {
      // Clear the old default first: at most one per account (partial
      // unique index from migration 061).
      await supabase
        .from('whatsapp_config')
        .update({ is_default: false })
        .eq('account_id', accountId)
        .eq('is_default', true)
        .neq('id', id)
      patch.is_default = true
    }

    patch.updated_at = new Date().toISOString()
    const { error } = await supabase
      .from('whatsapp_config')
      .update(patch)
      .eq('account_id', accountId)
      .eq('id', id)
    if (error) {
      console.error('[whatsapp/numbers] update failed:', error.message)
      return NextResponse.json({ error: 'Failed to update number' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
