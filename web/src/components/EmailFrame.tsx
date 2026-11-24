const BASE_STYLE =
  'body{font:14px/20px system-ui,sans-serif;color:#202124;max-width:640px;margin:12px}img{max-width:100%;height:auto}'

/** Sandboxed preview of email HTML: no scripts, no same-origin. */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body>${html}</body></html>`
  return <iframe className="email-frame" sandbox="" srcDoc={doc} title={title} />
}
