import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageBubble } from './src/components/MessageBubble'
import { restoreHistory } from './src/hooks/useChat'

const cfg = { primary_color: '#0EA5E9', bot_name: 'Weblyft Assistant' }
const render = (content: string) =>
  renderToStaticMarkup(
    <MessageBubble message={{ role: 'assistant', content }} config={cfg} />,
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
  <MessageBubble message={{ role: 'user', content: 'hi' }} config={cfg} />,
)
check('user bubble renders', f.includes('chatbot-message user') && f.includes('hi'), f)
check('user message has no bot header', !f.includes('chatbot-message-head'), f)

// 7. Header: avatar + bot name above the bubble, not beside it
check('bot header rendered', a.includes('chatbot-message-head') && a.includes('Weblyft Assistant'), a)
check('avatar is in the head, not a side row', /chatbot-message-head[\s\S]*?chatbot-avatar/.test(a), a)

// 8. Answer + card suggestions are ONE message
const g = renderToStaticMarkup(
  <MessageBubble
    message={{
      role: 'assistant',
      content: 'Here are the prices:\n- **Lite**: $499',
      card: { id: 'c1', kind: 'quick_replies', chips: ['Tell me more', 'Book a call'] },
    }}
    config={cfg}
  />,
)
check(
  'single message container for answer + card',
  (g.match(/chatbot-message assistant/g) || []).length === 1,
  g,
)
check('answer text present alongside card', g.includes('<strong>Lite</strong>') && g.includes('$499'), g)
check('card present in same bubble', g.includes('chatbot-card') && g.includes('Tell me more'), g)
check('card chips enabled by default', !/disabled/.test(g), g)
check(
  'card sits after the answer text',
  g.indexOf('chatbot-bubble-content') < g.indexOf('chatbot-card'),
  g,
)

// 9. History restore keeps answer + card together as one message
const rows = [
  { id: 'u1', role: 'user', content: 'How much?' },
  { id: 'a1', role: 'assistant', content: 'Here are the prices: - **Lite**: $499', card: { id: 'c1', kind: 'quick_replies' } },
  { id: 'a2', role: 'assistant', content: 'Anything else?', card: { id: 'c2', kind: 'quick_replies' } },
  { id: 'a3', role: 'assistant', content: '', card: { id: 'c3', kind: 'quick_replies' } },
]
const restored = restoreHistory(rows) as any[]
check('restore: one message per row', restored.length === 4, JSON.stringify(restored))
check('answer text kept with its card', restored[1]?.content.includes('$499') && restored[1]?.card?.id === 'c1', JSON.stringify(restored))
check('older cards read-only', restored[1]?.interactive === false && restored[2]?.interactive === false, JSON.stringify(restored))
check('newest card interactive', restored[3]?.interactive === true, JSON.stringify(restored))
check('card-only row kept', restored[3]?.content === '' && restored[3]?.card?.id === 'c3', JSON.stringify(restored))
check('empty history safe', restoreHistory([]).length === 0 && restoreHistory(null as any).length === 0, 'null case')

process.exit(failed ? 1 : 0)
