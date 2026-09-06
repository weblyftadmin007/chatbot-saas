# Interactive Cards in the Chat Widget — Design Plan

**Goal:** when the user's message matches a specific intent, present a rich, clickable
card instead of (or alongside) plain text, so the conversation stays on track: fewer
free-text round-trips, clearer next actions, less ambiguity for the intent classifier.

**Status:** plan (not yet implemented). Grounded in the current wire protocol
(`worker/src/chat.ts` SSE frames `content | slots | done`) and widget rendering
(`MessageBubble.tsx`, single text paragraph per bubble).

---

## 1. Principle: cards are server-driven, not client-guessed

Intent detection already happens **server-side** (`classifyIntent` in `chat.ts`).
The widget must NOT re-classify text with its own regexes — two sources of truth
would drift and break the "stay on track" goal. Instead the worker attaches a
`card` object to the SSE frames it already sends:

```
data: {"type":"content","content":"Here are the available times…"}
data: {"type":"card","card":{ ... }}          ← new frame type
data: {"type":"done","conversation_id":...}
```

The widget renders whatever the server sends and stays dumb. Every card carries a
unique `id` + `kind` so analytics can later measure which cards actually help.

## 2. Card kinds mapped to the existing intents

| Intent (worker) | Card kind | When it fires | What the user clicks |
|---|---|---|---|
| `book_appointment` | `booking_prompt` | booking intent but **no email parsed** (the "which day/time?" → "email?" dance) | quick-reply chips: "Today", "Tomorrow", "Pick a date…" |
| `book_appointment` | `booking_confirm` | after a successful `bookSlot` (widget-side) | summary card: service, date/time, email, "Add to calendar" link, "Cancel booking" chip |
| `check_availability` | `availability_result` | slots found — **replaces the current picker** | either the inline SlotPicker (already exists) or a compact day-picker card |
| `cancel_appointment` | `cancel_confirm` | after successful cancel | summary + "Rebook" chip (fires `book_appointment`) |
| `cancel_appointment` | `cancel_lookup` | no email in message | card with an email input + "Find my booking" button |
| `transfer_human` | `contact_card` | always | "Call", "Email", WhatsApp chips from tenant settings |
| `unclear` | `quick_replies` | classifier returns unclear | 3–4 chips from tenant `settings.quick_replies` (config already ships them!) |
| — (proactive) | `session_restore` | widget opened after 30-min expiry | "Continue where we left off?" card |

The `unclear → quick_replies` card is the highest-value one: today the unclear
answer is a dead end; chips funnel the user back into intents the system handles
well, which is exactly "keeping the conversation on track".

## 3. Card schema (wire format)

```jsonc
{
  "type": "card",
  "card": {
    "id": "card_<uuid>",
    "kind": "quick_replies",
    "title": "How can I help?",
    "subtitle": "Pick one or type your own question",
    // kind-specific payload:
    "chips": ["Book an appointment", "Opening hours", "Pricing"],
    // optional follow-up when the user clicks a chip:
    "actions": [
      { "label": "Book an appointment", "send_message": "Book an appointment" }
    ]
  }
}
```

Rules:
- `send_message` actions just route through the existing `sendMessage()` — zero
  new widget→worker API surface, the worker sees a normal user message.
- Local-only actions (`type: "input"`, `type: "dismiss"`) are handled purely in
  the widget (e.g. `cancel_lookup`'s email field submits as a normal message:
  `"Cancel my appointment <email>"` — re-enters the existing cancel flow).
- Cards are **single-use**: after an action, the card collapses into a one-line
  transcript entry ("✓ Booked Tue 11:45") so history replays stay honest.
- Persisted cards must be reconstructible from the DB transcript. Store the card
  JSON in `messages.tool_calls` (the column already exists and is unused) keyed
  `{"card": {...}}` so `loadHistory()` can re-render them read-only.

## 4. Widget rendering

- New `<CardBubble>` component next to `MessageBubble`: bordered container,
  tenant `--primary-color` accent, title/subtitle/chips/actions.
- Chips render as buttons; clicking one calls `onSend(payload.send_message)`,
  which already exists on `MessageList` → `InputBar`'s send path.
- `MessageList` branches: `message.card ? <CardBubble/> : <MessageBubble/>`.
- The existing `SlotPicker` (bottom sheet) stays for `check_availability` — it's
  already a card-like surface; `availability_result` just becomes a clickable
  summary card that re-opens it (now correctly dismissible after the ✕ fix).

## 5. Conversation-tracking guardrails

1. **One pending card at a time.** A new user message dismisses any open card
   (same as `sendMessage` already clears `pendingAction`).
2. **No loops:** `quick_replies` chips may not link to another `quick_replies`
   card; every path must end in a real intent.
3. **Fallback chain:** unclear ×2 in a row → card offers "Talk to a human" chip
   (fires `transfer_human`) instead of a third rephrase prompt.
4. **Analytics:** log `card_id`, `kind`, `action` into `usage_logs` metadata so
   we can prune cards nobody clicks.
5. **Server-side feature flag:** tenant setting `cards_enabled` (default true)
   checked in `chat.ts` before sending card frames; workers deployed before the
   widget must not break old widgets (old widgets ignore unknown frame types —
   verify the parser's `default:` case is a no-op).

## 6. Rollout

1. **Phase A (1 PR):** `quick_replies` card on `unclear` + `contact_card` on
   `transfer_human`. Pure additive frames; old widget unaffected. Biggest
   on-track win for least code.
2. **Phase B:** `booking_prompt` chips (today/tomorrow/date) + `cancel_lookup`
   email card. Removes the two clunkiest free-text dances.
3. **Phase C:** `booking_confirm` / `cancel_confirm` summary cards with calendar
   links (ICS via a tiny worker route) and "Rebook" chip.
4. **Phase D (optional):** replace the SlotPicker bottom sheet with an in-stream
   `availability_result` card once cards are proven.

Each phase ships behind `cards_enabled`, measured by the Phase-A analytics.
