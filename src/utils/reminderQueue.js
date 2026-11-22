import {
  DEFAULT_SETTINGS, localClock, openReminder, planReminderQueue, renderMessage,
} from '../../supabase/functions/_shared/reminders.js'

export { planReminderQueue }

export function actionableReminders(items) {
  return (items || []).filter(item => item && !item.paid)
}

// Queued rows for the window that is open right now. Paid members stay in the list
// so the card can show them greyed, and count only the ones still to send.
export function buildReminderView({
  now = new Date(),
  timezone,
  settings,
  rounds = [],
  participants = [],
  queued = [],
  templates = [],
  contribution,
  zelle,
}) {
  const s = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    timezone: settings?.timezone || timezone || DEFAULT_SETTINGS.timezone,
  }
  const dbRounds = rounds.map(round => ({
    id: round.id,
    round_number: round.round,
    collect_date: round.collectDate,
  }))
  const clock = localClock(now, s.timezone)
  const { window, round } = openReminder(clock, dbRounds, s)
  if (!window || !round) return { window: null, items: [], count: 0, collectDate: null }

  const storeRound = rounds.find(item => item.id === round.id)
  const items = queued
    .filter(row => row.status === 'queued'
      && row.kind === window
      && row.round_id === round.id
      && row.dry_run !== true
      && (row.channel || 'queue') === 'queue')
    .flatMap(row => {
      const person = participants.find(item => item.id === row.member_id)
      if (!person) return []
      // A queued row for the recipient is not sent. Their contribution is waived.
      if (storeRound?.recipientSlot != null && person.slot === storeRound.recipientSlot) return []
      return [{
        id: row.id,
        slot: person.slot,
        name: person.name,
        phone: person.phone || '',
        paid: storeRound?.payments?.[person.slot] === true,
        message: renderMessage(templates, window, {
          firstName: person.name,
          amount: contribution,
          zelle,
        }),
      }]
    })
  return {
    window,
    items,
    count: actionableReminders(items).length,
    collectDate: storeRound?.collectDate || round.collect_date,
  }
}
