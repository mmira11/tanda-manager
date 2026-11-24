---
name: payment-reminder-sms
description: Design for a "Remind Unpaid" SMS button in the admin RoundPanel that opens a pre-addressed group SMS to all unpaid members with a phone number for the current round.
metadata:
  type: project
---

# Payment Reminder SMS — Design

## Summary

Add a "Remind Unpaid (N)" button to the admin RoundPanel header card, positioned between the progress bar and the "Mark Payout Sent" button. Tapping it opens the native SMS app pre-addressed to all unpaid members who have a phone number, with an auto-generated reminder message.

## Scope

- Button appears only when at least one unpaid participant has a phone number and round is not fully paid
- Hidden entirely when all participants have paid
- Auto-generated message — no customization needed
- Only `RoundPanel.jsx` changes — no store or utility modifications

Out of scope: push notifications, WhatsApp, per-round custom messages.

## Data

No new store state. All data comes from existing sources:

| Field | Source |
|---|---|
| Unpaid participants with phone | `participants.filter(p => !round.payments[p.slot] && p.phone?.trim())` |
| Round number | `round.round` |
| Collection date | `round.collectDate` (formatted via existing `formatDate`) |
| Organizer phone | `store.config.organizerPhone` |
| SMS URL | `buildGroupSmsUrl(unpaid, body)` for 2+ unpaid; `buildSmsUrl` for exactly 1 |

## Message Format

Group (2+ unpaid):
```
Reminder: Tanda Round {N} collection is on {date}. Please send $200 to {organizerPhone} via Zelle. Thank you!
```

Single (exactly 1 unpaid) — uses existing `buildSmsUrl(phone, name, organizerPhone, collectDate)` which generates the individual per-name message already in use in PaymentRow.

If `organizerPhone` is empty, falls back to `"the organizer"` in the group message.

## UI

Placed in the header card between the progress bar and the payout button:

```jsx
{!allPaid && (
  <a href={reminderUrl ?? undefined}
     onClick={!reminderUrl ? e => e.preventDefault() : undefined}
     className={`flex items-center justify-center gap-2 w-full font-semibold py-2.5 rounded-xl text-sm transition-colors mb-3 ${
       reminderUrl
         ? 'bg-blue-500 hover:bg-blue-600 text-white'
         : 'bg-gray-100 text-gray-400 cursor-not-allowed'
     }`}>
    💬 Remind Unpaid ({unpaidWithPhone.length})
  </a>
)}
```

**States:**
- `reminderUrl` non-null + `unpaidWithPhone.length >= 1` → blue, tappable
- `unpaidWithPhone.length === 0` (unpaid exist but none have phones) → gray, disabled
- `allPaid` (`paidCount === total`) → hidden entirely

## Files Changed

| File | Change |
|---|---|
| `src/components/admin/RoundPanel.jsx` | Add reminder button between progress bar and payout button |
