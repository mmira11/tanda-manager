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

function getCollectDayName(collectDate, locale = 'en-US') {
  if (!collectDate) return locale.startsWith('es') ? 'el día de cobro' : 'collection day'
  return new Date(collectDate + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long' })
}

// Admin screens are English only, but texts to members always carry both languages.
export function bilingual(en, es) {
  return `${en}\n\n${es}`
}

function friendlyReminder(recipientName, organizerPhone, collectDate, amount) {
  const orgNum = stripPhone(organizerPhone)
  const money = formatMoney(amount)
  return bilingual(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this ${getCollectDayName(collectDate)}. Please send ${money} to ${orgNum} via Zelle. Thank you!`,
    `Hola ${recipientName}, te recordamos que el cobro de la tanda es este ${getCollectDayName(collectDate, 'es-US')}. Por favor envía ${money} a ${orgNum} por Zelle. ¡Gracias!`,
  )
}

export function buildSmsUrl(recipientPhone, recipientName, organizerPhone, collectDate, amount) {
  if (!isValidUsPhone(recipientPhone)) return null
  return smsLink(stripPhone(recipientPhone), friendlyReminder(recipientName, organizerPhone, collectDate, amount))
}

export function buildReminderBody(roundNum, formattedDate, organizerPhone, amount, lang = 'en') {
  const org = organizerPhone?.trim() || organizerFallback(lang)
  const money = formatMoney(amount)
  if (lang === 'es') {
    return `Recordatorio: la recolección de la Ronda ${roundNum} de la tanda es el ${formattedDate}. Envía ${money} por Zelle a ${org}. ¡Gracias!`
  }
  return `Reminder: Tanda Round ${roundNum} collection is on ${formattedDate}. Please send ${money} to ${org} via Zelle. Thank you!`
}

function whatsAppNumber(phone) {
  if (!isValidUsPhone(phone)) return null
  const digits = stripPhone(phone)
  return digits.length === 11 ? digits : `1${digits}`
}

export function buildWhatsAppUrl(recipientPhone, recipientName, organizerPhone, collectDate, amount) {
  const to = whatsAppNumber(recipientPhone)
  if (!to) return null
  return `https://wa.me/${to}?text=${encodeURIComponent(friendlyReminder(recipientName, organizerPhone, collectDate, amount))}`
}

function timedReminderBody(name, orgPhone, type, amount) {
  const org = formatPhoneDisplay(orgPhone)
  const money = formatMoney(amount)
  if (type === '12pm') {
    return bilingual(
      `Hi ${name}, friendly reminder that Tanda collection closes TODAY at 6 PM. Please send ${money} via Zelle to ${org} before the cutoff. Thank you! 🙏`,
      `Hola ${name}, te recordamos que el cobro de la tanda cierra HOY a las 6 PM. Por favor envía ${money} por Zelle a ${org} antes de la hora. ¡Gracias! 🙏`,
    )
  }
  return bilingual(
    `Hi ${name}, last call — Tanda collection closes at 6 PM tonight. Please send ${money} via Zelle to ${org} now. Thank you! 🙏`,
    `Hola ${name}, último aviso — el cobro de la tanda cierra hoy a las 6 PM. Por favor envía ${money} por Zelle a ${org} ahora. ¡Gracias! 🙏`,
  )
}

export function buildTimedReminderSmsUrl(recipientPhone, recipientName, organizerPhone, type, amount) {
  if (!isValidUsPhone(recipientPhone)) return null
  return smsLink(stripPhone(recipientPhone), timedReminderBody(recipientName, organizerPhone, type, amount))
}

export function buildNudgeBody({ name, amount, zelle, when, whenEn, whenEs }) {
  const who = name?.trim() || 'there'
  const saved = zelle?.trim()
  const destEn = saved || organizerFallback('en')
  const destEs = saved || organizerFallback('es')
  const money = formatMoney(amount)
  const englishWhen = whenEn || when || ''
  const spanishWhen = whenEs || when || ''
  const enDate = englishWhen ? ` (${englishWhen})` : ''
  const esDate = spanishWhen ? ` (${spanishWhen})` : ''
  return `Hi ${who}, please send ${money} by Zelle to ${destEn}${enDate}. Thank you! / Hola ${who}, por favor envía ${money} por Zelle a ${destEs}${esDate}. ¡Gracias!`
}

// Send exactly the text the organizer sees on screen.
export function smsUrlWithBody(phone, body) {
  return smsLink(formatPhoneForSms(phone), body)
}

export function whatsAppUrlWithBody(phone, body) {
  const to = whatsAppNumber(phone)
  return to ? `https://wa.me/${to}?text=${encodeURIComponent(body)}` : null
}

export function buildNudgeSmsUrl(phone, details) {
  return smsLink(formatPhoneForSms(phone), buildNudgeBody(details))
}

export function buildTimedReminderWhatsAppUrl(recipientPhone, recipientName, organizerPhone, type, amount) {
  const to = whatsAppNumber(recipientPhone)
  if (!to) return null
  return `https://wa.me/${to}?text=${encodeURIComponent(timedReminderBody(recipientName, organizerPhone, type, amount))}`
}
