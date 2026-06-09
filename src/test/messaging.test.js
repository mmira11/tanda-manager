import { describe, it, expect } from 'vitest'
import { buildSmsUrl, buildWhatsAppUrl } from '../utils/messaging'

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
})
