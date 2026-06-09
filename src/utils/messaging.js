function stripPhone(phone) {
  return phone.replace(/\D/g, '')
}

export function buildSmsUrl(recipientPhone, recipientName, organizerPhone) {
  const to = stripPhone(recipientPhone)
  const orgNum = stripPhone(organizerPhone)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this Friday. Please send $200 to ${orgNum} via Zelle. Thank you!`
  )
  return `sms:${to}?body=${body}`
}

export function buildWhatsAppUrl(recipientPhone, recipientName, organizerPhone) {
  const to = '1' + stripPhone(recipientPhone)
  const orgNum = stripPhone(organizerPhone)
  const body = encodeURIComponent(
    `Hi ${recipientName}, friendly reminder that Tanda collection is this Friday. Please send $200 to ${orgNum} via Zelle. Thank you!`
  )
  return `https://wa.me/${to}?text=${body}`
}
