// Brings emails sent by hand from the dashboard mailbox into the dashboard (see src/email/importSent.ts).
// Usage (from functions/):
//   GOOGLE_CLOUD_PROJECT=<project> npx tsx scripts/import-sent.ts --template acceptance --query 'in:sent subject:"[DevFest26]"' [--apply] [--sample <file>]
// Without --apply it only counts. --sample writes the newest matching message's text to <file>, for drafting templates.
// Reads MAIL_USER, MAIL_LABEL and SYNC_SERVICE_ACCOUNT from functions/.env. Uses Application Default Credentials,
// which need roles/iam.serviceAccountTokenCreator on the sync service account. Prints counts only.
import { readFileSync, writeFileSync } from 'node:fs'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { delegatedGmail } from '../src/email/gmail.js'
import { importSent } from '../src/email/importSent.js'
import { parseMessage } from '../src/email/parseMessage.js'

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const template = flag('template')
const query = flag('query')
if (!template || !query) {
  console.error('Usage: npx tsx scripts/import-sent.ts --template <templateId> --query <gmail search> [--apply] [--sample <file>]')
  process.exit(1)
}
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim())).filter((m) => m !== null).map((m) => [m[1], m[2].replace(/^"(.*)"$/, '$1')]))

async function main() {
  const gmail = delegatedGmail({ serviceAccount: env.SYNC_SERVICE_ACCOUNT, user: env.MAIL_USER, label: env.MAIL_LABEL })
  const sample = flag('sample')
  if (sample) {
    const [first] = await gmail.listMessages(query!)
    if (!first) { console.log('No messages match.'); return }
    const m = (await gmail.getThread(first.threadId)).find((x) => x.id === first.id)!
    const p = parseMessage(m, '')
    writeFileSync(sample, `Subject: ${p.subject}\n\n${p.text}\n`)
    console.log(`Wrote the newest match to ${sample}`)
    return
  }
  const db = getFirestore(initializeApp())
  const report = await importSent(db, gmail, {
    query: query!, templateId: template!, actor: { uid: 'gmail-import', name: 'Gmail import' }, apply: args.includes('--apply'),
  })
  console.log(JSON.stringify(report, null, 2))
  if (!args.includes('--apply')) console.log('Dry run: nothing written. Add --apply to import.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
