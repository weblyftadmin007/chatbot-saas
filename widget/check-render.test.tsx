import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble } from './src/components/MessageBubble'
import { restoreHistory } from './src/hooks/useChat'

const cfg = { primary_color: '#0EA5E9' }
const render = (content: string) =>
  renderToStaticMarkup(
    <MessageBubble message={{ role: 'assistant', content }} config={cfg} withAvatar={true} />,
  )

let failed = 0
const check = (name: string, ok: boolean, out: string) => {
  if (ok) {
    console.log(`PASS ${name}`)
  } else {
    failed++
    console.log(`FAIL ${name}\n  got: ${out}`)
  }
}

// 1. Bullets + bold, like a knowledge answer
const a = render(
  'Here is the short answer:\n- **Lite package**: 3 pages, **$499**\n- **Standard**: 5 pages, **$999**\nWant details on either?',
)
check('unordered list rendered', a.includes('<ul class="chatbot-list">'), a)
check('two list items', (a.match(/<li>/g) || []).length === 2, a)
check('bold key points', a.includes('<strong>Lite package</strong>') && a.includes('<strong>$999</strong>'), a)
check('trailing paragraph after list', a.includes('Want details on either?'), a)

// 2. Plain single-line answer (greeting-style) still renders as a paragraph
const b = render('Hey there! 👋 Great to meet you!')
check('plain paragraph', b.includes('<p class="chatbot-para">Hey there! 👋 Great to meet you!</p>'), b)

// 3. Numbered steps
const c = render('Steps:\n1. Share your brief\n2. We design\n3. We launch')
check('ordered list rendered', c.includes('<ol class="chatbot-list">') && (c.match(/<li>/g) || []).length === 3, c)

// 4. Mid-stream partial bold must not crash or drop text
const d = render('Our **Stand')
check('partial bold kept literal', d.includes('Our **Stand'), d)

// 5. Blank-line paragraph separation
const e = render('First para.\n\nSecond para.')
check('two paragraphs', (e.match(/<p class="chatbot-para">/g) || []).length === 2, e)

// 6. User message path unchanged
const f = renderToStaticMarkup(
  <MessageBubble message={{ role: 'user', content: 'hi' }} config={cfg} withAvatar={false} />,
)
check('user bubble renders', f.includes('chatbot-message user') && f.includes('hi'), f)

// 7. History restore: a row with answer text + follow-up card must split
//    into two messages so the first answer is not hidden behind its card.
const rows = [
  { id: 'u1', role: 'user', content: 'How much?' },
  { id: 'a1', role: 'assistant', content: 'Here are the prices: - **Lite**: $499', card: { id: 'c1', kind: 'quick_replies' } },
  { id: 'a2', role: 'assistant', content: 'Anything else?', card: { id: 'c2', kind: 'quick_replies' } },
]
const restored = restoreHistory(rows) as any[]
check('split: 5 messages (user + 2 text + 2 cards)', restored.length === 5, JSON.stringify(restored))
check('answer text kept', restored.some((m) => m.id === 'a1' && m.content.includes('$499')), JSON.stringify(restored))
check('card follows its answer', restored[2]?.id === 'a1__card' && restored[2]?.role === 'assistant', JSON.stringify(restored))
check('newest card interactive', restored[4]?.interactive === true, JSON.stringify(restored))
check('older card read-only', restored[2]?.interactive === false, JSON.stringify(restored))
check('empty history safe', restoreHistory([]).length === 0 && restoreHistory(null as any).length === 0, 'null case')

process.exit(failed ? 1 : 0)
