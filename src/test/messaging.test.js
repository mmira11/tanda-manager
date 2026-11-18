import { describe, it, expect } from 'vitest'
import { buildSmsUrl, buildWhatsAppUrl, buildGroupSmsUrl, buildReminderBody, buildTimedReminderSmsUrl, buildTimedReminderWhatsAppUrl, buildNudgeSmsUrl, buildNudgeBody } from '../utils/messaging'

describe('messaging', () => {
  it('buildSmsUrl targets correct number and includes name in body', () => {
    const url = buildSmsUrl('(555) 010-0001', 'Ada', '(555) 010-0002', '2026-06-12', 80)
    expect(url).toMatch(/^sms:5550100001\?&body=/)
    expect(url).toContain('Ada')
    expect(url).toContain('5550100002')
  })

  it('buildWhatsAppUrl prefixes US country code', () => {
    const url = buildWhatsAppUrl('(555) 010-0001', 'Ada', '(555) 010-0002')
    expect(url).toMatch(/^https:\/\/wa\.me\/15550100001/)
    expect(url).toContain('Ada')
  })

  it('hides WhatsApp links for a phone that is not 10 or 11 digits', () => {
    expect(buildWhatsAppUrl('12345', 'Rosa', '(555) 010-0002', '2026-06-12', 100)).toBeNull()
    expect(buildTimedReminderWhatsAppUrl('22345678901', 'Rosa', '(555) 010-0002', '6pm', 100)).toBeNull()
    expect(buildTimedReminderSmsUrl('12345', 'Rosa', '(555) 010-0002', '12pm', 100)).toBeNull()
  })

  it('strips all non-digits from phone numbers', () => {
    const url = buildSmsUrl('555-010-0001', 'Test', '555.010.0002')
    expect(url).toContain('5550100001')
    expect(url).toContain('5550100002')
  })

  it('buildGroupSmsUrl returns null with fewer than 2 valid phones', () => {
    expect(buildGroupSmsUrl([])).toBeNull()
    expect(buildGroupSmsUrl([{ phone: '5550100001' }])).toBeNull()
    expect(buildGroupSmsUrl([{ phone: '' }, { phone: '' }])).toBeNull()
  })

  it('buildGroupSmsUrl formats all numbers with +1 country code', () => {
    const participants = [
      { phone: '(555) 010-0001' },
      { phone: '(555) 010-0002' },
      { phone: '555-010-0003' },
    ]
    const url = buildGroupSmsUrl(participants)
    expect(url).toMatch(/^sms:/)
    expect(url).toContain('+15550100001')
    expect(url).toContain('+15550100002')
    expect(url).toContain('+15550100003')
  })

  it('buildGroupSmsUrl skips participants without a phone', () => {
    const participants = [
      { phone: '(555) 010-0001' },
      { phone: '' },
      { phone: '(555) 010-0002' },
    ]
    const url = buildGroupSmsUrl(participants)
    expect(url).toContain('+15550100001')
    expect(url).toContain('+15550100002')
    expect(url).not.toMatch(/\+\+/)
  })

  it('buildGroupSmsUrl appends encoded body when provided', () => {
    const participants = [{ phone: '5550100001' }, { phone: '5550100002' }]
    const url = buildGroupSmsUrl(participants, 'Hello group!')
    expect(url).toMatch(/\?&body=/)
    expect(url).toContain('Hello%20group')
  })

  it('buildReminderBody includes round number, date, and organizer phone', () => {
    const body = buildReminderBody(3, 'Fri, Jun 12', '(555) 010-0002', 80)
    expect(body).toContain('Round 3')
    expect(body).toContain('Fri, Jun 12')
    expect(body).toContain('(555) 010-0002')
    expect(body).toContain('$80')
    expect(body).toContain('Zelle')
  })

  it('buildReminderBody falls back to "the organizer" when phone is empty', () => {
    const body = buildReminderBody(1, 'Fri, Jun 12', '', 40)
    expect(body).toContain('the organizer')
    expect(body).not.toContain('undefined')
  })

  it('uses el organizador in the Spanish reminder and nudge', () => {
    expect(buildReminderBody(1, 'vie, 12 de jun', '', 40, 'es')).toContain('el organizador')
    const body = buildNudgeBody({ name: 'Rosa', amount: 100, zelle: '  ' })
    expect(body).toContain('the organizer')
    expect(body).toContain('el organizador')
  })

  it('uses the cycle contribution instead of a fixed amount', () => {
    expect(buildReminderBody(1, 'Fri, Jun 12', '5550100009', 150)).toContain('$150')
    expect(decodeURIComponent(buildWhatsAppUrl('5550100001', 'Ana', '5550100000', '2026-06-12', 87.5)))
      .toContain('$87.50')
  })

  it('builds a bilingual nudge and skips a blank phone', () => {
    expect(buildNudgeSmsUrl('', { name: 'Rosa', amount: 100, zelle: 'familia.demo' })).toBeNull()
    expect(buildNudgeSmsUrl('555-0100', { name: 'Rosa', amount: 100, zelle: 'familia.demo' })).toBeNull()
    expect(buildNudgeSmsUrl('22345678901', { name: 'Rosa', amount: 100, zelle: 'familia.demo' })).toBeNull()
    const url = buildNudgeSmsUrl('(555) 010-0104', { name: 'Rosa', amount: 100, zelle: 'familia.demo', when: 'Fri, Jun 12' })
    const body = decodeURIComponent(url.split('body=')[1])
    expect(url).toMatch(/^sms:\+15550100104\?&body=/)
    expect(body).toContain('Rosa')
    expect(body).toContain('$100')
    expect(body).toContain('familia.demo')
    expect(body).toContain('Hola')
    expect(body).not.toContain('5550100104')
  })

  it('puts the en-US date in the English half and the es-US date in the Spanish half', () => {
    const body = buildNudgeBody({
      name: 'Rosa',
      amount: 100,
      zelle: 'familia.demo',
      whenEn: 'Fri, Jun 12',
      whenEs: 'vie, 12 de jun',
    })
    const [english, spanish] = body.split(' / ')
    expect(english).toContain('Fri, Jun 12')
    expect(english).not.toContain('vie')
    expect(spanish).toContain('vie, 12 de jun')
    expect(spanish).not.toContain('Fri')
  })

  it('labels the evening reminder at 6 PM, when the organizer sends it', () => {
    const url = buildTimedReminderSmsUrl('5550100001', 'Ada', '5550100002', '6pm', 40)
    expect(url).toMatch(/\?&body=/)
    const body = decodeURIComponent(url.split('body=')[1])
    expect(body).toContain('6 PM')
    expect(body).not.toContain('8 PM')
    expect(body).toContain('$40')
    expect(body).not.toContain('5550100001')
  })
})

describe('texts to members are bilingual', () => {
  it('sends English then Spanish in one-tap SMS and WhatsApp reminders', () => {
    const sms = decodeURIComponent(buildSmsUrl('(555) 010-0001', 'Ada', '(555) 010-0002', '2026-06-12', 80))
    expect(sms).toMatch(/Hi Ada, friendly reminder/)
    expect(sms).toMatch(/Hola Ada, te recordamos/)
    expect(sms).toMatch(/viernes/)
    const wa = decodeURIComponent(buildWhatsAppUrl('(555) 010-0001', 'Ada', '(555) 010-0002', '2026-06-12', 80))
    expect(wa).toMatch(/Hi Ada/)
    expect(wa).toMatch(/Hola Ada/)
  })

  it('timed 12 PM and 6 PM reminders carry both languages', () => {
    const noon = decodeURIComponent(buildTimedReminderSmsUrl('(555) 010-0001', 'Ada', '(555) 010-0002', '12pm', 80))
    const last = decodeURIComponent(buildTimedReminderWhatsAppUrl('(555) 010-0001', 'Ada', '(555) 010-0002', '6pm', 80))
    expect(noon).toMatch(/closes TODAY at 6 PM[\s\S]*cierra HOY a las 6 PM/)
    expect(last).toMatch(/last call[\s\S]*último aviso/)
  })
})
