// Title-matching keys. Must stay free of value imports: the web app bundles this file.
export function titleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function talkKey(speakerKey: string, title: string): string | null {
  const key = titleKey(title);
  return key === '' ? null : `${speakerKey}|${key}`;
}
