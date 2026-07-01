function stripPhone(phone) {
  return phone.replace(/\D/g, '')
}

function formatPhoneDisplay(phone) {
  const d = stripPhone(phone)
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  return phone
}

function formatPhoneForSms(phone) {
  const digits = stripPhone(phone)
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return digits.length > 0 ? `+${digits}` : null
}

export function buildGroupSmsUrl(participants, body = '') {
  const numbers = participants
    .filter(p => p.phone?.trim())
    .map(p => formatPhoneForSms(p.phone))
    .filter(Boolean)
  if (numbers.length < 2) return null
  const encoded = body ? `?body=${encodeURIComponent(body)}` : ''
  return `sms:${numbers.join(',')}${encoded}`
}

function getCollectDayName(collectDate) {
  if (!collectDate) return 'collection day'
  return new Date(collectDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
}

export function buildSmsUrl(recipientPhone, recipientName, organizerPhone, collectDate) {
  const to = stripPhone(recipientPhone)
  const orgNum = stripPhone(organizerPhone)
  const day = getCollectDayName(collectDate)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this ${day}. Please send $200 to ${orgNum} via Zelle. Thank you!`
  )
  return `sms:${to}?body=${body}`
}

export function buildReminderBody(roundNum, formattedDate, organizerPhone) {
  const org = organizerPhone?.trim() || 'the organizer'
  return `Reminder: Tanda Round ${roundNum} collection is on ${formattedDate}. Please send $200 to ${org} via Zelle. Thank you!`
}

export function buildWhatsAppUrl(recipientPhone, recipientName, organizerPhone, collectDate) {
  const to = '1' + stripPhone(recipientPhone)
  const orgNum = stripPhone(organizerPhone)
  const day = getCollectDayName(collectDate)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this ${day}. Please send $200 to ${orgNum} via Zelle. Thank you!`
  )
  return `https://wa.me/${to}?text=${body}`
}

function timedReminderBody(name, orgPhone, type) {
  const org = formatPhoneDisplay(orgPhone)
  if (type === '12pm') {
    return `Hi ${name}, friendly reminder that Tanda collection closes TODAY at 8 PM. Please send $200 via Zelle to ${org} before the cutoff. Gracias! 🙏`
  }
  return `Hi ${name}, last call — Tanda collection closes in 1 hour at 8 PM tonight. Please send $200 via Zelle to ${org} now. Gracias! 🙏`
}

export function buildTimedReminderSmsUrl(recipientPhone, recipientName, organizerPhone, type) {
  const to = stripPhone(recipientPhone)
  return `sms:${to}?body=${encodeURIComponent(timedReminderBody(recipientName, organizerPhone, type))}`
}

export function buildTimedReminderWhatsAppUrl(recipientPhone, recipientName, organizerPhone, type) {
  const to = '1' + stripPhone(recipientPhone)
  return `https://wa.me/${to}?text=${encodeURIComponent(timedReminderBody(recipientName, organizerPhone, type))}`
}
