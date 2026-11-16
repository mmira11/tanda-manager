import { formatMoney } from './money'

function stripPhone(phone) {
  return phone.replace(/\D/g, '')
}

function formatPhoneDisplay(phone) {
  const d = stripPhone(phone)
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  return phone
}

export function isValidUsPhone(phone) {
  const digits = stripPhone(String(phone || ''))
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

export function organizerFallback(lang = 'en') {
  return lang === 'es' ? 'el organizador' : 'the organizer'
}

// `?&body=` opens the draft on both iOS and Android. `?body=` is dropped on iOS.
export function smsLink(to, body) {
  if (!to) return null
  if (body == null || body === '') return `sms:${to}`
  return `sms:${to}?&body=${encodeURIComponent(body)}`
}

function formatPhoneForSms(phone) {
  if (!isValidUsPhone(phone)) return null
  const digits = stripPhone(phone)
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

export function buildGroupSmsUrl(participants, body = '') {
  const numbers = participants
    .map(p => formatPhoneForSms(p.phone))
    .filter(Boolean)
  if (numbers.length < 2) return null
  return smsLink(numbers.join(','), body)
}

function getCollectDayName(collectDate) {
  if (!collectDate) return 'collection day'
  return new Date(collectDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

export function buildSmsUrl(recipientPhone, recipientName, organizerPhone, collectDate, amount) {
  if (!isValidUsPhone(recipientPhone)) return null
  const orgNum = stripPhone(organizerPhone)
  const day = getCollectDayName(collectDate)
  return smsLink(stripPhone(recipientPhone),
    `Hi ${recipientName}, friendly reminder that Tanda collection is this ${day}. Please send ${formatMoney(amount)} to ${orgNum} via Zelle. Thank you!`
  )
}

export function buildReminderBody(roundNum, formattedDate, organizerPhone, amount, lang = 'en') {
  const org = organizerPhone?.trim() || organizerFallback(lang)
  const money = formatMoney(amount)
  if (lang === 'es') {
    return `Recordatorio: la recolección de la Ronda ${roundNum} de la tanda es el ${formattedDate}. Envía ${money} por Zelle a ${org}. ¡Gracias!`
  }
  return `Reminder: Tanda Round ${roundNum} collection is on ${formattedDate}. Please send ${money} to ${org} via Zelle. Thank you!`
}

export function buildWhatsAppUrl(recipientPhone, recipientName, organizerPhone, collectDate, amount) {
  const to = '1' + stripPhone(recipientPhone)
  const orgNum = stripPhone(organizerPhone)
  const day = getCollectDayName(collectDate)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this ${day}. Please send ${formatMoney(amount)} to ${orgNum} via Zelle. Thank you!`
  )
  return `https://wa.me/${to}?text=${body}`
}

function timedReminderBody(name, orgPhone, type, amount) {
  const org = formatPhoneDisplay(orgPhone)
  if (type === '12pm') {
    return `Hi ${name}, friendly reminder that Tanda collection closes TODAY at 6 PM. Please send ${formatMoney(amount)} via Zelle to ${org} before the cutoff. Gracias! 🙏`
  }
  return `Hi ${name}, last call — Tanda collection closes at 6 PM tonight. Please send ${formatMoney(amount)} via Zelle to ${org} now. Gracias! 🙏`
}

export function buildTimedReminderSmsUrl(recipientPhone, recipientName, organizerPhone, type, amount) {
  if (!isValidUsPhone(recipientPhone)) return null
  return smsLink(stripPhone(recipientPhone), timedReminderBody(recipientName, organizerPhone, type, amount))
}

export function buildNudgeBody({ name, amount, zelle, when }) {
  const who = name?.trim() || 'there'
  const saved = zelle?.trim()
  const destEn = saved || organizerFallback('en')
  const destEs = saved || organizerFallback('es')
  const money = formatMoney(amount)
  const date = when ? ` (${when})` : ''
  return `Hi ${who}, please send ${money} by Zelle to ${destEn}${date}. Thank you! / Hola ${who}, por favor envía ${money} por Zelle a ${destEs}${date}. ¡Gracias!`
}

export function buildNudgeSmsUrl(phone, details) {
  return smsLink(formatPhoneForSms(phone), buildNudgeBody(details))
}

export function buildTimedReminderWhatsAppUrl(recipientPhone, recipientName, organizerPhone, type, amount) {
  const to = '1' + stripPhone(recipientPhone)
  return `https://wa.me/${to}?text=${encodeURIComponent(timedReminderBody(recipientName, organizerPhone, type, amount))}`
}
