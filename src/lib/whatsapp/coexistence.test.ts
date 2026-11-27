import { describe, expect, it } from 'vitest'
import {
  digits,
  isCoexistenceField,
  isFromCustomer,
  mapHistoryStatus,
  previewFor,
  stateSyncName,
} from './coexistence'

describe('coexistence helpers', () => {
  it('recognises the three phone-side webhook fields only', () => {
    expect(isCoexistenceField('history')).toBe(true)
    expect(isCoexistenceField('smb_app_state_sync')).toBe(true)
    expect(isCoexistenceField('smb_message_echoes')).toBe(true)
    expect(isCoexistenceField('messages')).toBe(false)
    expect(isCoexistenceField(undefined)).toBe(false)
  })

  it('normalises phone formats', () => {
    expect(digits('+91 98913-32337')).toBe('919891332337')
  })

  it('tells customer messages from business ones in a history thread', () => {
    const thread = { id: '919000000001' }
    expect(isFromCustomer({ id: 'a', timestamp: '1', type: 'text', from: '+919000000001' }, thread)).toBe(true)
    expect(isFromCustomer({ id: 'b', timestamp: '1', type: 'text', from: '919891332337', to: '919000000001' }, thread)).toBe(false)
    // No sender at all: business-sent messages carry `to`.
    expect(isFromCustomer({ id: 'c', timestamp: '1', type: 'text', to: '919000000001' }, thread)).toBe(false)
    expect(isFromCustomer({ id: 'd', timestamp: '1', type: 'text' }, thread)).toBe(true)
  })

  it('uses BSUIDs when the phone is withheld', () => {
    const thread = { id: '', context: { user_id: 'IN.123' } }
    expect(isFromCustomer({ id: 'a', timestamp: '1', type: 'text', from_user_id: 'IN.123' }, thread)).toBe(true)
    expect(isFromCustomer({ id: 'b', timestamp: '1', type: 'text', from_user_id: 'IN.999' }, thread)).toBe(false)
  })

  it('maps history statuses onto the messages.status values', () => {
    expect(mapHistoryStatus('READ', false)).toBe('read')
    expect(mapHistoryStatus('played', false)).toBe('read')
    expect(mapHistoryStatus('DELIVERED', false)).toBe('delivered')
    expect(mapHistoryStatus('ERROR', false)).toBe('failed')
    expect(mapHistoryStatus('PENDING', false)).toBe('sending')
    expect(mapHistoryStatus(undefined, false)).toBe('sent')
    expect(mapHistoryStatus('READ', true)).toBe('delivered')
  })

  it('picks the best contact name and inbox preview', () => {
    expect(stateSyncName({ contact: { full_name: ' Asha Rao ', first_name: 'Asha' } })).toBe('Asha Rao')
    expect(stateSyncName({ contact: { first_name: 'Asha' } })).toBe('Asha')
    expect(previewFor('image', null)).toBe('📷 Photo')
    expect(previewFor('text', 'hello')).toBe('hello')
  })
})
