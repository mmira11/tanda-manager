function stripPhone(phone) {
  return phone.replace(/\D/g, '')
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
