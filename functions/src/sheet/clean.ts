export type LinkKind = 'linkedin' | 'x' | 'instagram' | 'github';

const BASE: Record<LinkKind, string> = {
  linkedin: 'https://www.linkedin.com/in/',
  x: 'https://x.com/',
  instagram: 'https://instagram.com/',
  github: 'https://github.com/',
};

/** Make a link open correctly: add a scheme, or build a profile URL from a bare handle. */
export function normalizeLink(raw: string, kind: LinkKind): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  // Domain only if it starts with www. or has a path; a bare dotted word is a handle.
  if (/^www\./i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(v)) return `https://${v}`;
  return BASE[kind] + v.replace(/^@/, '');
}

/** Drive file id from an "open?id=" or "/file/d/" link (first link if several). */
export function extractDriveFileId(url: string): string | null {
  const m = url.match(/[?&]id=([\w-]+)/) ?? url.match(/\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}
