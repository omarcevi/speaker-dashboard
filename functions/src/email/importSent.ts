// Brings emails the team sent from Gmail by hand (before the dashboard, or outside it) into the dashboard: each sent
// message found by a Gmail search becomes a `sent` email for every speaker it went to, with its Gmail thread, so later
// replies show up and later batches skip those speakers. Re-running is safe: ids are fixed per message and speaker.
// Server-only; run from scripts/import-sent.ts.
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { EmailDoc, ThreadDoc } from '../model.js'
import type { GmailClient } from './gmail.js'
import { loadSpeakers } from './loadSpeakers.js'
import { addresses, parseMessage, type GmailMessage } from './parseMessage.js'
import { emailId, isAlreadyExists, isDecisionRule, templateOf, type Actor } from './queue.js'
import { eligibility } from './recipients.js'

export interface ImportReport {
  /** Sent messages the search found. */
  messages: number
  imported: number
  /** Already brought in by an earlier run. */
  alreadyImported: number
  /** The speaker already has a sent email from this template. */
  alreadyEmailed: number
  /** Not eligible for the template (for example no approved talk for an acceptance). */
  notEligible: number
  /** Messages that went to no known speaker. */
  noSpeaker: number
}

const header = (m: GmailMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

export async function importSent(
  db: Firestore, gmail: GmailClient,
  opts: { query: string; templateId: string; actor: Actor; apply: boolean; now?: number },
): Promise<ImportReport> {
  const template = await templateOf(db, opts.templateId)
  const loaded = await loadSpeakers(db)
  const speakerKeys = new Set(loaded.groups.map((g) => g.speakerKey))
  const byEmail = new Map(loaded.groups.filter((g) => g.email.trim()).map((g) => [g.email.trim().toLowerCase(), g]))
  const report: ImportReport = { messages: 0, imported: 0, alreadyImported: 0, alreadyEmailed: 0, notEligible: 0, noSpeaker: 0 }
  const done = new Set<string>()

  // Oldest first, so a speaker emailed twice keeps the first message.
  const found = (await gmail.listMessages(opts.query)).reverse()
  for (const { id, threadId } of found) {
    const m = (await gmail.getThread(threadId)).find((x) => x.id === id)
    if (!m?.labelIds?.includes('SENT')) continue
    report.messages++
    const p = parseMessage(m, '')
    const recipients = [...p.to, ...p.cc, ...addresses(header(m, 'Bcc'))]
    const groups = [...new Set(recipients.map((a) => byEmail.get(a)).filter((g) => g !== undefined))]
    if (groups.length === 0) { report.noSpeaker++; continue }
    const sentAt = Timestamp.fromMillis(p.atMs || (opts.now ?? Date.now()))
    for (const g of groups) {
      const ref = db.doc(`emails/${emailId(`import_${id}`, g.speakerKey)}`)
      if ((await ref.get()).exists) { report.alreadyImported++; continue }
      const sentBefore = done.has(g.speakerKey) || loaded.historyOf(g.speakerKey)
        .some((h) => h.templateId === opts.templateId && h.state === 'sent')
      if (sentBefore) { report.alreadyEmailed++; continue }
      const e = eligibility(template.rule, g, loaded.status, [], { speakerKeys, templateId: opts.templateId })
      if (!e.ok) { report.notEligible++; continue }
      done.add(g.speakerKey)
      report.imported++
      if (!opts.apply) continue
      const doc: EmailDoc = {
        batchId: `import_${id}`, speakerKey: g.speakerKey, to: g.email.trim(), cc: [], templateId: opts.templateId,
        templateName: template.name, rule: template.rule, isDecision: isDecisionRule(template.rule), talkIds: e.talkIds,
        subject: p.subject, text: p.text, html: null, attachments: [], sendAt: sentAt, state: 'sent', reason: null, manual: false,
        replyToThreadId: null, gmailMessageId: id, threadId, rfcMessageId: p.rfcMessageId || null, claimedAt: null,
        sentAt, bounce: null, replyCount: 0, lastReplyAt: null, by: opts.actor.uid, byName: opts.actor.name,
        createdAt: Timestamp.fromMillis(opts.now ?? Date.now()),
      }
      try {
        await ref.create(doc)
      } catch (err) {
        if (!isAlreadyExists(err)) throw err
        report.imported--
        report.alreadyImported++
        continue
      }
      const threadRef = db.doc(`threads/${threadId}`)
      await db.runTransaction(async (tx) => {
        const t = (await tx.get(threadRef)).data() as ThreadDoc | undefined
        const thread: ThreadDoc = {
          speakerKey: t?.speakerKey ?? g.speakerKey, firstSentAt: t?.firstSentAt ?? sentAt, lastCheckedAt: t?.lastCheckedAt ?? null,
          seenIds: [...new Set([...(t?.seenIds ?? []), id])], lastReplyAt: t?.lastReplyAt ?? null,
          lastTeamAt: t?.lastTeamAt && t.lastTeamAt.toMillis() > sentAt.toMillis() ? t.lastTeamAt : sentAt,
          lastSnippet: t?.lastSnippet || [...p.text].slice(0, 140).join(''),
        }
        tx.set(threadRef, thread, { merge: true })
      })
      await gmail.label(id).catch(() => console.warn(`Import: could not label ${id}`))
    }
  }
  console.log(`Import ${opts.templateId}: ${JSON.stringify(report)}${opts.apply ? '' : ' (dry run)'}`)
  return report
}
