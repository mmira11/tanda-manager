import { describe, it, expect } from 'vitest'
import { buildSmsUrl, buildWhatsAppUrl, buildGroupSmsUrl } from '../utils/messaging'

describe('messaging', () => {
  it('buildSmsUrl targets correct number and includes name in body', () => {
    const url = buildSmsUrl('(510) 230-1571', 'Edy', '(209) 362-0911')
    expect(url).toMatch(/^sms:5102301571/)
    expect(url).toContain('Edy')
    expect(url).toContain('2093620911')
  })

  it('buildWhatsAppUrl prefixes US country code', () => {
    const url = buildWhatsAppUrl('(510) 230-1571', 'Edy', '(209) 362-0911')
    expect(url).toMatch(/^https:\/\/wa\.me\/15102301571/)
    expect(url).toContain('Edy')
  })

  it('strips all non-digits from phone numbers', () => {
    const url = buildSmsUrl('510-230-1571', 'Test', '209.362.0911')
    expect(url).toContain('5102301571')
    expect(url).toContain('2093620911')
  })

  it('buildGroupSmsUrl returns null with fewer than 2 valid phones', () => {
    expect(buildGroupSmsUrl([])).toBeNull()
    expect(buildGroupSmsUrl([{ phone: '5102301571' }])).toBeNull()
    expect(buildGroupSmsUrl([{ phone: '' }, { phone: '' }])).toBeNull()
  })

  it('buildGroupSmsUrl formats all numbers with +1 country code', () => {
    const participants = [
      { phone: '(510) 230-1571' },
      { phone: '(209) 362-0911' },
      { phone: '415-555-1234' },
    ]
    const url = buildGroupSmsUrl(participants)
    expect(url).toMatch(/^sms:/)
    expect(url).toContain('+15102301571')
    expect(url).toContain('+12093620911')
    expect(url).toContain('+14155551234')
  })

  it('buildGroupSmsUrl skips participants without a phone', () => {
    const participants = [
      { phone: '(510) 230-1571' },
      { phone: '' },
      { phone: '(209) 362-0911' },
    ]
    const url = buildGroupSmsUrl(participants)
    expect(url).toContain('+15102301571')
    expect(url).toContain('+12093620911')
    expect(url).not.toMatch(/\+\+/)
  })

  it('buildGroupSmsUrl appends encoded body when provided', () => {
    const participants = [{ phone: '5102301571' }, { phone: '2093620911' }]
    const url = buildGroupSmsUrl(participants, 'Hello group!')
    expect(url).toContain('body=')
    expect(url).toContain('Hello%20group')
  })
})
