// twilio-inbound: Twilio's "A message comes in" webhook for the tanda number.
// STOP (and other opt-out words) adds the sender to sms_opt_outs so send-reminders skips them;
// START (and other opt-in words) removes them. Every request must carry a valid Twilio signature.
//
// Function secrets (never in the repo or the frontend):
//   TWILIO_AUTH_TOKEN            to check X-Twilio-Signature
//   TWILIO_INBOUND_PUBLIC_URL    the exact webhook URL configured in Twilio, for example
//                                https://<project-ref>.supabase.co/functions/v1/twilio-inbound
// Deploy with: supabase functions deploy twilio-inbound --no-verify-jwt
// Twilio's own Advanced Opt-Out also blocks texts to a number that replied STOP and sends the
// confirmation reply, so this function replies with an empty TwiML response.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { optOutAction, toE164, verifyTwilioSignature } from '../_shared/reminders.js'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const params = Object.fromEntries(new URLSearchParams(await req.text()))
  const ok = await verifyTwilioSignature(
    Deno.env.get('TWILIO_AUTH_TOKEN') ?? '',
    Deno.env.get('TWILIO_INBOUND_PUBLIC_URL') ?? '',
    params,
    req.headers.get('x-twilio-signature') ?? '',
  )
  if (!ok) return new Response('forbidden', { status: 403 })

  const action = optOutAction(params.Body)
  const phone = toE164(params.From)
  if (action && phone) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const { error } = action === 'opt_out'
      ? await db.from('sms_opt_outs').upsert(
          { phone_e164: phone, keyword: String(params.Body).trim().toUpperCase(), opted_out_at: new Date().toISOString() },
          { onConflict: 'phone_e164' },
        )
      : await db.from('sms_opt_outs').delete().eq('phone_e164', phone)
    if (error) return new Response('error', { status: 500 })
    console.log(JSON.stringify({ action }))
  }
  return new Response(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } })
})
