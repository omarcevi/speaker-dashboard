const BASE_STYLE =
  'body{font:14px/20px system-ui,sans-serif;color:#202124;max-width:640px;margin:12px}img{max-width:100%;height:auto}'

// No scripts and no same-origin; links may open a new tab (popups), which leaves the sandbox.
const SANDBOX = 'allow-popups allow-popups-to-escape-sandbox'

/** Sandboxed preview of email HTML. `compact` is the smaller frame used for messages in a conversation. */
export function EmailFrame({ html, title, compact = false }: { html: string; title: string; compact?: boolean }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body>${html}</body></html>`
  return <iframe className={compact ? 'email-frame compact' : 'email-frame'} sandbox={SANDBOX} srcDoc={doc} title={title} />
}
