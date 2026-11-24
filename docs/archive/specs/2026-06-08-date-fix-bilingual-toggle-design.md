# Design: Date Fix + Bilingual EN/ES Toggle

**Date:** 2026-06-08  
**Scope:** Two fixes to the Tanda Manager PWA — correct schedule dates and add a bilingual public board.

---

## Fix 1 — Correct Schedule Dates

### Problem
All 12 rounds have dates that are one day too late. Collection was intended to fall on Fridays and payout on Saturdays, but the current schedule starts Saturday June 13 / Sunday June 14 instead of Friday June 12 / Saturday June 13.

### Changes

**`src/data/scheduleTemplate.js`**  
Shift every `collectDate` and `payoutDate` back by one calendar day:

| Round | Old collect | New collect | Old payout | New payout |
|-------|------------|-------------|-----------|-----------|
| 1  | 2026-06-13 | 2026-06-12 | 2026-06-14 | 2026-06-13 |
| 2  | 2026-06-27 | 2026-06-26 | 2026-06-28 | 2026-06-27 |
| 3  | 2026-07-11 | 2026-07-10 | 2026-07-12 | 2026-07-11 |
| 4  | 2026-07-25 | 2026-07-24 | 2026-07-26 | 2026-07-25 |
| 5  | 2026-08-08 | 2026-08-07 | 2026-08-09 | 2026-08-08 |
| 6  | 2026-08-22 | 2026-08-21 | 2026-08-23 | 2026-08-22 |
| 7  | 2026-09-05 | 2026-09-04 | 2026-09-06 | 2026-09-05 |
| 8  | 2026-09-19 | 2026-09-18 | 2026-09-20 | 2026-09-19 |
| 9  | 2026-10-03 | 2026-10-02 | 2026-10-04 | 2026-10-03 |
| 10 | 2026-10-17 | 2026-10-16 | 2026-10-18 | 2026-10-17 |
| 11 | 2026-10-31 | 2026-10-30 | 2026-11-01 | 2026-10-31 |
| 12 | 2026-11-14 | 2026-11-13 | 2026-11-15 | 2026-11-14 |

**`src/hooks/useTandaStore.js` — one-time migration**  
In `loadStore()`, after parsing localStorage: if `rounds[0].collectDate === '2026-06-13'`, shift all round dates back 1 day and re-save. This patches the organizer's existing data on first load.

**`src/components/public/PublicBoard.jsx`**  
- Header subtitle: `Jun 13 – Nov 15, 2026` → `Jun 12 – Nov 14, 2026`
- `isComplete` threshold: `2026-11-16T00:00:00` → `2026-11-15T00:00:00`

No changes to `formatDate` or `getDayName` — those functions are correct.

---

## Fix 2 — Bilingual EN/ES Toggle (Public Board Only)

### Architecture

- `lang` state (`'en' | 'es'`) lives in `PublicBoard`, initialized from `localStorage('tanda_lang')`, defaulting to `'en'`.
- Toggling writes the new value to `localStorage('tanda_lang')` and flips state.
- `lang` is passed as a prop to: `RecipientSpotlight`, `CountdownTimer`, `PaymentStatusList`.
- Translation strings are an inline `LABELS` object in `PublicBoard` — no external i18n library needed.

### Toggle Button

Placed top-right of the public board header, adjacent to the Round counter.  
Appearance: a small pill `EN | ES` with the active language in gold/bold.

```
[ EN | ES ]   ← top right of header
```

### Translation Map

```js
const LABELS = {
  en: {
    recipient:     "This round's recipient",
    collection:    'Collection',
    payout:        'Payout',
    nextIn:        'Next collection in',
    days:          'days',
    hours:         'hours',
    mins:          'mins',
    contributions: 'Contributions',
    pending:       'Pending',
    paid:          'Paid',
    whosNext:      "Who's next",
    round:         'Round',
    of:            'of',
    perPerson:     'per person',
    collectionDay: 'Collection day is here!',
    sendTo:        'Please send $200 to',
    viaZelle:      'via Zelle',
    today:         'today.',
    tandaDone:     'Tanda Complete!',
    allDone:       'All 12 rounds finished. Amazing job everyone!',
    congrats:      'Congratulations',
  },
  es: {
    recipient:     'El turno de esta ronda',
    collection:    'Cobro',
    payout:        'Pago',
    nextIn:        'Próximo cobro en',
    days:          'días',
    hours:         'horas',
    mins:          'mins',
    contributions: 'Aportaciones',
    pending:       'Pendiente',
    paid:          'Pagado',
    whosNext:      'Quién sigue',
    round:         'Ronda',
    of:            'de',
    perPerson:     'por persona',
    collectionDay: '¡Día de cobro!',
    sendTo:        'Por favor envía $200 a',
    viaZelle:      'por Zelle',
    today:         'hoy.',
    tandaDone:     '¡Tanda completa!',
    allDone:       '¡Las 12 rondas terminaron. Excelente trabajo!',
    congrats:      'Felicidades',
  },
}
```

### Component Changes

**`PublicBoard`**
- Add `lang` state + localStorage init
- Toggle button in header (top-right)
- Pass `lang` to all three public sub-components
- Header round label: `Round` / `Ronda`
- Footer: translate collection/payout day sentence and `per person`

**`RecipientSpotlight`**  
Accept `lang` prop. Translate:
- "Round X of 12" → "Ronda X de 12"
- "This round's recipient" → "El turno de esta ronda"
- "Collection" / "Payout" labels
- "Payout complete!" and "Congratulations" text

**`CountdownTimer`**  
Accept `lang` prop. Translate:
- "Next collection in"
- `days`, `hours`, `mins` unit labels
- The "Collection day is here!" card
- The "Tanda Complete!" card

**`PaymentStatusList`**  
Accept `lang` prop. Translate:
- "Contributions" heading
- Replace ✓/· icon-only badges with text badges: `Paid` / `Pending` (colored, small font)
- Add "Who's next" row at the bottom — looks up `rounds[currentRound.round]` (next round) and shows the recipient's name. Requires receiving `rounds` and `participants` props (already available in PublicBoard).

### "Who's next" implementation

```jsx
// At bottom of PaymentStatusList
const nextRound = rounds.find(r => r.round === currentRoundNum + 1)
const nextRecipient = nextRound
  ? participants.find(p => p.slot === nextRound.recipientSlot)?.name || `Slot ${nextRound.recipientSlot}`
  : null

{nextRecipient && (
  <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600">
    <span className="font-medium">{t.whosNext}:</span> {nextRecipient}
  </div>
)}
```

`PaymentStatusList` will receive two new props: `rounds` and `currentRoundNum`.

---

## Files Modified

1. `src/data/scheduleTemplate.js` — new dates
2. `src/hooks/useTandaStore.js` — migration in `loadStore`
3. `src/components/public/PublicBoard.jsx` — lang state, toggle button, updated dates, pass props
4. `src/components/public/RecipientSpotlight.jsx` — accept `lang`, translate
5. `src/components/public/CountdownTimer.jsx` — accept `lang`, translate
6. `src/components/public/PaymentStatusList.jsx` — accept `lang`, translate, add "Who's next"

## Files NOT modified

- Admin components (`RoundPanel`, `AdminDashboard`, `HistoryLog`, `DataControls`, `PaymentRow`, `RosterEditor`, `SetupWizard`, `PinGate`) — bilingual is public board only
- `src/utils/rounds.js` — date functions are correct
- Tests — date-related tests may need updating for new schedule dates

---

## Out of Scope

- Admin dashboard translation
- Dynamic language selection beyond EN/ES
- Any changes to the PWA manifest, service worker, or deployment config
