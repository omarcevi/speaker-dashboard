import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReplyLabel, ThreadDoc } from '../../../functions/src/model.ts'

const h = vi.hoisted(() => ({
  me: null as null | { uid: string; name: string; role: 'admin' | 'member' },
  threads: [] as unknown[],
  settleReply: vi.fn(async () => {}),
  unsettleReply: vi.fn(async () => {}),
  draftReply: vi.fn(async () => ({ ok: true as const })),
  messages: null as unknown[] | null,
}))

vi.mock('../firebase.ts', () => ({ db: {}, functions: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), onSnapshot: vi.fn(() => () => {}) }))
// Static rendering runs no effects, so the thread's messages come straight from the listener hook.
vi.mock('../data/useThreadMessages.ts', () => ({ useThreadMessages: () => ({ messages: h.messages, loadError: null }) }))
vi.mock('../auth/AuthProvider.tsx', () => ({ useAuth: () => ({ me: h.me }) }))
vi.mock('../data/DataProvider.tsx', () => ({ useData: () => ({ emails: [], threads: h.threads }) }))
vi.mock('../data/useSpeakers.ts', () => ({ useSpeakers: () => ({ byKey: new Map() }) }))
vi.mock('../data/actions.ts', () => ({ settleReply: h.settleReply, unsettleReply: h.unsettleReply }))
vi.mock('../data/mailActions.ts', () => ({ draftReply: h.draftReply, queueEmails: vi.fn(), emailAttachment: vi.fn() }))

const { default: Conversation } = await import('./Conversation.tsx')
const { AiLine, DraftButton, GapConfirm } = await import('./ReplyAssist.tsx')
const { firstGap, prefill, sendStep } = await import('../lib/replyAssist.ts')

const ts = (ms: number) => ({ toMillis: () => ms })
type Me = { uid: string; name: string; role: 'admin' | 'member' }
const ADMIN: Me = { uid: 'u1', name: 'Omar', role: 'admin' }
const MEMBER: Me = { uid: 'u2', name: 'Zeynep', role: 'member' }
const probs = (top: ReplyLabel): Record<ReplyLabel, number> =>
  ({ needs_answer: 0.04, no_answer_needed: 0.04, withdrawing: 0.02, unclear: 0.04, [top]: 0.9 })

function fakeThread(over: Partial<ThreadDoc> = {}): ThreadDoc & { id: string } {
  return {
    id: 't1', speakerKey: 'ada', firstSentAt: ts(1), lastCheckedAt: null, seenIds: [], lastReplyAt: ts(300), lastTeamAt: ts(100),
    lastSnippet: 'When is it?', lastReplyId: 'm2',
    ai: { messageId: 'm2', label: 'needs_answer', probabilities: probs('needs_answer'), confidence: 0.9, model: 'g', at: ts(310), error: null },
    ...over,
  }
}
const DRAFT = { messageId: 'm2', text: 'Hi Ada, the venue is [venue address?].', model: 'g', at: ts(320) }

const render = (thread: ThreadDoc & { id: string }, me = ADMIN) => {
  h.me = me
  h.threads = [thread]
  return renderToStaticMarkup(<Conversation threadId={thread.id} onClose={() => {}} />)
}

/** Finds a button by its text in the element tree of a hook-free component. */
function button(el: ReactNode, label: string): ReactElement<{ onClick: () => void; disabled?: boolean }> | null {
  if (!el || typeof el !== 'object') return null
  if (Array.isArray(el)) {
    for (const c of el) { const b = button(c, label); if (b) return b }
    return null
  }
  const e = el as ReactElement<{ children?: ReactNode; onClick: () => void }>
  if (e.type === 'button' && [e.props.children].flat().join('') === label) return e
  if (typeof e.type === 'function') return button((e.type as (p: unknown) => ReactNode)(e.props), label)
  return button(e.props.children, label)
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  h.messages = null
})

describe('Conversation: AI reading line', () => {
  it('shows the reading of the newest reply and No reply needed to an admin', () => {
    const out = render(fakeThread())
    expect(out).toContain('AI: needs an answer · 90%')
    expect(out).toContain('No reply needed')
    expect(out).not.toContain('>Undo<')
  })

  it('shows Undo once the reply is settled', () => {
    const out = render(fakeThread({ settled: { messageId: 'm2', by: 'u1', byName: 'Omar', at: ts(400) } }))
    expect(out).toContain('>Undo<')
    expect(out).not.toContain('No reply needed<')
    expect(out).toContain('Marked no reply needed · Omar')
  })

  it('sits right after the newest reply, once', () => {
    const msg = (id: string, at: number, text: string, kind = 'reply') => ({
      id, kind, from: 'Ada <ada@example.com>', to: ['speaker@example.com'], cc: [], at: ts(at), subject: 'Re: Talk',
      text, quoted: '', attachments: [],
    })
    // A later team message (sent from Gmail) proves the line follows m2 rather than the end of the list.
    h.messages = [msg('m1', 200, 'First question'), msg('m2', 300, 'Newest question'), msg('m3', 400, 'Team answer', 'team')]
    const out = render(fakeThread())
    expect(out.split('AI: needs an answer').length - 1).toBe(1)
    expect(out).toMatch(/Newest question<\/span><\/div><\/article><div class="ai-line">/)
    expect(out.indexOf('First question')).toBeLessThan(out.indexOf('Newest question'))
    expect(out.indexOf('Newest question')).toBeLessThan(out.indexOf('class="ai-line"'))
    expect(out.indexOf('class="ai-line"')).toBeLessThan(out.indexOf('Team answer'))
  })

  it('ignores a settle for an older reply', () => {
    const out = render(fakeThread({ settled: { messageId: 'm1', by: 'u1', byName: 'Omar', at: ts(400) } }))
    expect(out).toContain('No reply needed')
    expect(out).not.toContain('>Undo<')
  })

  it('No reply needed settles the newest reply as me; Undo clears it', async () => {
    const t = fakeThread()
    button(AiLine({ thread: t, me: ADMIN, busy: false, error: null, onBusy: () => {}, onError: () => {} }), 'No reply needed')!.props.onClick()
    await flush()
    expect(h.settleReply).toHaveBeenCalledWith('t1', 'm2', ADMIN)
    const settled = fakeThread({ settled: { messageId: 'm2', by: 'ai', byName: 'AI', at: ts(400) } })
    button(AiLine({ thread: settled, me: ADMIN, busy: false, error: null, onBusy: () => {}, onError: () => {} }), 'Undo')!.props.onClick()
    await flush()
    expect(h.unsettleReply).toHaveBeenCalledWith('t1')
  })

  it('shows a settle failure inline', async () => {
    h.settleReply.mockRejectedValueOnce(new Error('denied'))
    const onError = vi.fn()
    button(AiLine({ thread: fakeThread(), me: ADMIN, busy: false, error: null, onBusy: () => {}, onError }), 'No reply needed')!.props.onClick()
    await flush()
    expect(onError).toHaveBeenLastCalledWith("Couldn't update: denied")
    const out = renderToStaticMarkup(<AiLine thread={fakeThread()} me={ADMIN} busy={false} error="Couldn't update: denied" onBusy={() => {}} onError={() => {}} />)
    expect(out).toContain('role="alert"')
  })
})

describe('Conversation: draft', () => {
  it('pre-fills the empty reply box with the current draft', () => {
    const out = render(fakeThread({ draft: DRAFT }))
    expect(out).toMatch(/<textarea[^>]*>Hi Ada, the venue is \[venue address\?\]\.<\/textarea>/)
    expect(out).toContain('Redraft')
    expect(out).not.toContain('Draft a reply')
  })

  it('does not pre-fill a draft for an older reply, and offers Draft a reply', () => {
    const out = render(fakeThread({ draft: { ...DRAFT, messageId: 'm1' } }))
    expect(out).toMatch(/<textarea[^>]*><\/textarea>/)
    expect(out).toContain('Draft a reply')
    expect(out).not.toContain('Redraft')
  })

  it('shows Drafting… while the server is drafting', () => {
    const out = render(fakeThread({ drafting: ts(500) }))
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Drafting…<\/button>/)
  })

  it('never overwrites typed text with a new draft', () => {
    const seen = { key: 'm2:320', text: DRAFT.text }
    const newer = { ...DRAFT, text: 'Hi Ada, newer.', at: ts(600) }
    // Box still holds the last prefill: the newer draft replaces it.
    expect(prefill(DRAFT.text, seen, newer)).toEqual({ body: 'Hi Ada, newer.', seen: { key: 'm2:600', text: 'Hi Ada, newer.' } })
    // Box is empty: filled.
    expect(prefill('', null, DRAFT)?.body).toBe(DRAFT.text)
    // Box was typed in: kept.
    expect(prefill('My own words', seen, newer)?.body).toBe('My own words')
    // Box was typed in, but the admin pressed Redraft: the draft they asked for replaces it.
    expect(prefill('My own words', seen, newer, true)?.body).toBe('Hi Ada, newer.')
    expect(prefill('', null, DRAFT, true)?.body).toBe(DRAFT.text)
    // Same draft already seen: nothing to do.
    expect(prefill('', seen, DRAFT)).toBeNull()
    expect(prefill('', null, null)).toBeNull()
  })

  it('Draft a reply and Redraft both call draftReply for the thread', async () => {
    for (const hasDraft of [false, true]) {
      const el = DraftButton({ threadId: 't1', hasDraft, drafting: false, onBusy: () => {}, onError: () => {} })
      button(el, hasDraft ? 'Redraft' : 'Draft a reply')!.props.onClick()
      await flush()
    }
    expect(h.draftReply).toHaveBeenCalledTimes(2)
    expect(h.draftReply).toHaveBeenCalledWith({ threadId: 't1' })
  })

  it('reports a draft failure through onError', async () => {
    h.draftReply.mockRejectedValueOnce(new Error('not-found'))
    const onError = vi.fn()
    button(DraftButton({ threadId: 't1', hasDraft: false, drafting: false, onBusy: () => {}, onError }), 'Draft a reply')!.props.onClick()
    await flush()
    expect(onError).toHaveBeenLastCalledWith("Couldn't draft a reply: not-found")
  })
})

describe('Conversation: gap check before sending', () => {
  it('finds the first [gap] in the body', () => {
    expect(firstGap('Hi, see you at [venue address?] on [date].')).toBe('[venue address?]')
    expect(firstGap('No gaps here.')).toBeNull()
    expect(firstGap('Broken [\n] and [' + 'x'.repeat(81) + ']')).toBeNull()
  })

  it('asks before sending a reply with gaps, unless confirmed', () => {
    expect(sendStep('  ', false)).toEqual({ kind: 'empty' })
    expect(sendStep('At [venue address?].', false)).toEqual({ kind: 'confirm', gap: '[venue address?]' })
    expect(sendStep('At [venue address?].', true)).toEqual({ kind: 'send' })
    expect(sendStep('All filled in.', false)).toEqual({ kind: 'send' })
  })

  it('renders the confirmation inline with Send anyway / Keep editing', () => {
    const onSend = vi.fn()
    const onKeep = vi.fn()
    const out = renderToStaticMarkup(<GapConfirm gap="[date]" onSend={onSend} onKeep={onKeep} />)
    expect(out).toContain('This reply still has gaps like [date]. Send anyway?')
    button(GapConfirm({ gap: '[date]', onSend, onKeep }), 'Send anyway')!.props.onClick()
    button(GapConfirm({ gap: '[date]', onSend, onKeep }), 'Keep editing')!.props.onClick()
    expect(onSend).toHaveBeenCalledOnce()
    expect(onKeep).toHaveBeenCalledOnce()
  })

  it('uses no browser dialogs', async () => {
    const sources = [(await import('./Conversation.tsx?raw')).default, (await import('./ReplyAssist.tsx?raw')).default,
      (await import('../lib/replyAssist.ts?raw')).default]
    for (const src of sources) {
      expect(src).not.toMatch(/window\.(confirm|alert)|\bconfirm\(|\balert\(/)
    }
  })
})

describe('Conversation: members', () => {
  it('see the reading and the draft as read-only text, with no buttons or reply box', () => {
    const out = render(fakeThread({ draft: DRAFT }), MEMBER)
    expect(out).toContain('AI: needs an answer · 90%')
    expect(out).toContain('Suggested reply')
    expect(out).toContain('Hi Ada, the venue is [venue address?].')
    expect(out).not.toContain('<textarea')
    expect(out).not.toContain('No reply needed<')
    expect(out).not.toContain('Redraft')
    expect(out).not.toContain('Draft a reply')
  })
})
