// src/utils/memberList.js — turn a pasted list ("Maria 555-010-0101", one person per line)
// into roster rows for the create-cycle form.
import { isValidUsPhone } from './messaging'

// A phone is the run of digits and phone punctuation; whatever is left is the name.
const PHONE = /\+?\(?\d[\d\s().-]{3,}\d/

export function parseMemberList(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(PHONE)
      const phone = match ? match[0].trim() : ''
      const name = (match ? line.replace(match[0], ' ') : line)
        .replace(/^[\s\d.)-]+(?=\D)/, '') // a leading "1." or "2)" list number
        .replace(/[,;:\t|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s-]+|[\s-]+$/g, '')
      return { name, phone, phoneOk: !phone || isValidUsPhone(phone) }
    })
    .filter(row => row.name || row.phone)
}

// Fisher–Yates; `random` is injectable for tests.
export function shuffled(list, random = Math.random) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
