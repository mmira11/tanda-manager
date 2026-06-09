# Design: Unpublished Badge, Add Member, Organizer Card, Round Schedule

**Date:** 2026-06-08

---

## Bug Fix — Stale Public Board After Publish

**Root cause:** `fetchPublicData` hits `raw.githubusercontent.com` which has server-side CDN caching. The browser's `cache: 'no-store'` bypasses the browser cache but not GitHub's CDN.

**Fix:** Append `?t=${Date.now()}` to the fetch URL. Forces a unique URL each time, defeating CDN cache.

**File:** `src/utils/github.js` — change URL in `fetchPublicData` to:
```js
const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE_PATH}?t=${Date.now()}`
```

---

## Feature 1 — Unpublished Changes Badge

### Behavior
After any admin action that mutates data (marking paid, changing roster, etc.), an orange badge appears on the Publish to Public Board button reading "Unpublished changes". The badge disappears after a successful publish.

### State tracking
- `useTandaStore.js`: every `update()` call sets `next.lastModified = Date.now()` on the returned state object. `buildInitialState()` initializes `lastModified: 0`.
- `DataControls.jsx`: reads `lastModified` from store. Reads `lastPublished` from `localStorage('tanda_last_published')`. Shows badge when `store.lastModified > (parseInt(localStorage.getItem('tanda_last_published')) || 0)`.
- After successful publish: `localStorage.setItem('tanda_last_published', String(store.lastModified))` and reset publish status.

### UI
- Publish button gains an orange dot + small "Unpublished changes" text label above it when dirty
- Button label itself unchanged ("↑ Publish to Public Board")

---

## Feature 2 — Add Member

### Behavior
"Add Member" button at the bottom of the Roster tab opens an inline form. On submit:
1. New participant is added with slot = `participants.length + 1`
2. Every existing round's `payments` map gains `[newSlot]: false`
3. A new round is appended: `collectDate` = last round's `collectDate` + 14 days, `payoutDate` = `collectDate` + 1 day, `recipientSlot` = new slot, `payments` = all slots false

### Dynamic pot / counts
- `POT` constant (2400) is no longer used on the public board. Everywhere it appeared, use `participants.length × CONTRIBUTION` dynamically.
- `RecipientSpotlight` accepts a `pot` prop (number) instead of importing `POT`.
- `PaymentStatusList` uses `participants.length` instead of `SLOT_COUNT` for the "X of N" display.
- `PublicBoard` header round counter: `/ {rounds.length}` instead of `/ 12`.
- `PublicBoard` footer: `${rounds.length} rounds total` / `${rounds.length} rondas en total`.

### `addMember(name, phone)` in useTandaStore
```js
const addMember = useCallback((name, phone) => {
  update(prev => {
    const newSlot = prev.participants.length + 1
    const lastRound = prev.rounds[prev.rounds.length - 1]
    const lastCollectMs = new Date(lastRound.collectDate + 'T12:00:00').getTime()
    const newCollect = new Date(lastCollectMs + 14 * 86400000).toISOString().slice(0, 10)
    const newPayout  = new Date(lastCollectMs + 15 * 86400000).toISOString().slice(0, 10)
    return {
      ...prev,
      participants: [...prev.participants, { slot: newSlot, name: name.trim(), phone: phone.trim() }],
      rounds: [
        ...prev.rounds.map(r => ({
          ...r,
          payments: { ...r.payments, [newSlot]: false },
        })),
        {
          round: newSlot,
          collectDate: newCollect,
          payoutDate:  newPayout,
          recipientSlot: newSlot,
          payments: Object.fromEntries(
            Array.from({ length: newSlot }, (_, i) => [i + 1, false])
          ),
          payoutSent: false,
          notes: '',
        },
      ],
    }
  })
}, [update])
```

### RosterEditor UI
- "Add Member" button below the participant list (gold outline style)
- Clicking reveals an inline form with Name and Phone fields + Save / Cancel
- On save: calls `addMember(name, phone)`, collapses form
- Slot number auto-assigned, shown as read-only in the form

---

## Feature 3 — Organizer Contact Card

### New component: `src/components/public/OrganizerCard.jsx`

Props: `organizerName`, `organizerPhone`, `t`

Layout (white card, rounded-2xl):
- Left: avatar circle showing first initial of organizer name
- Right: organizer name (bold), phone number (small gray)
- Bottom: gold "Pay via Zelle" button

**Zelle deep link:** strip all non-digits from `organizerPhone`, produce `zelle://${digits}`. If no phone, button is hidden.

**Placement in PublicBoard:** below `PaymentStatusList`, above the footer paragraph.

### Bilingual keys added to LABELS
```js
en: {
  contactOrganizer: 'Contact Organizer',
  payViaZelle:      'Pay via Zelle',
}
es: {
  contactOrganizer: 'Contactar al organizador',
  payViaZelle:      'Pagar por Zelle',
}
```

---

## Feature 4 — Round Schedule

### New component: `src/components/public/RoundSchedule.jsx`

Props: `rounds`, `participants`, `currentRoundNum`, `t`

Layout: vertical list of all rounds inside a white card.

Each row shows:
- Round number pill (small, gold outline)
- Recipient name
- Collect date (formatted)
- Payout date (formatted)
- Right side: green ✓ if `payoutSent`, otherwise empty

**Current round:** gold left border (`border-l-4 border-gold-500`) + light gold background (`bg-gold-50`)
**Completed rounds:** muted text, green checkmark
**Future rounds:** normal text, no icon

**Placement in PublicBoard:** below `OrganizerCard`, above the footer paragraph.

### Bilingual keys added to LABELS
```js
en: {
  schedule:  'Round Schedule',
  completed: 'Completed',
}
es: {
  schedule:  'Calendario de rondas',
  completed: 'Completada',
}
```

---

## Files Changed

| File | Change |
|---|---|
| `src/utils/github.js` | Add `?t=${Date.now()}` cache-busting to fetchPublicData |
| `src/hooks/useTandaStore.js` | Add `lastModified` timestamp to state; add `addMember()` |
| `src/components/admin/DataControls.jsx` | Show unpublished badge; save lastPublished after publish |
| `src/components/admin/RosterEditor.jsx` | Add Member button + inline form |
| `src/components/public/PublicBoard.jsx` | Dynamic round/pot counts; new LABELS keys; render OrganizerCard + RoundSchedule; pass pot prop |
| `src/components/public/RecipientSpotlight.jsx` | Accept `pot` prop instead of importing `POT` |
| `src/components/public/PaymentStatusList.jsx` | Use `participants.length` instead of `SLOT_COUNT` |
| `src/components/public/OrganizerCard.jsx` | New component |
| `src/components/public/RoundSchedule.jsx` | New component |

## Out of Scope
- Removing a member
- Reordering slots
- Changing the contribution amount per member
- Admin bilingual support
