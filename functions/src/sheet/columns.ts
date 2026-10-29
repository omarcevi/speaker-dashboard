export const FIELDS = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'firstName', header: 'First Name' },
  { key: 'lastName', header: 'Last Name' },
  { key: 'email', header: 'Email' },
  { key: 'company', header: 'Company' },
  { key: 'jobTitle', header: 'Job Title / Role' },
  { key: 'phone', header: 'Phone Number' },
  { key: 'bio', header: 'Bio' },
  { key: 'gde', header: 'Are you a part of the Google Developer Experts Program?' },
  { key: 'linkedin', header: 'LinkedIn' },
  { key: 'x', header: 'Twitter / X' },
  { key: 'instagram', header: 'Instagram' },
  { key: 'github', header: 'Github' },
  { key: 'photo', header: 'Profile Photo' },
  { key: 'speakingExperience', header: 'Speaker Experience' },
  { key: 'whyDevFest', header: 'Why You Want to Speak at DevFest Istanbul 2026' },
  { key: 'area', header: 'Area of Expertise' },
  { key: 'areaOther', header: 'Other Area of Expertise' },
  { key: 'title', header: 'Session Title' },
  { key: 'abstract', header: 'Session Abstract' },
  { key: 'takeaways', header: 'Key Takeaways' },
  { key: 'level', header: 'Level' },
  { key: 'language', header: 'Session Language' },
  { key: 'presentedBefore', header: 'Has this talk been presented before ?' },
  { key: 'talkHistory', header: 'Talk History' },
  { key: 'hasCoSpeaker', header: 'Do you have a Co-Speaker ? ' },
  { key: 'coFirstName', header: 'Co-Speaker First Name' },
  { key: 'coLastName', header: 'Co-Speaker Last Name' },
  { key: 'coBio', header: 'Co-Speaker Bio & Info' },
  { key: 'coEmail', header: 'Co-Speaker Email' },
  { key: 'coPhone', header: 'Co-Speaker Phone Number' },
  { key: 'coLinkedin', header: 'Co-Speaker LinkedIn' },
  { key: 'coX', header: 'Co-Speaker Twitter / X' },
  { key: 'coInstagram', header: 'Co-Speaker Instagram' },
  { key: 'coPhoto', header: 'Co-Speaker Profile Photo' },
  { key: 'fromAbroad', header: 'Will you be traveling from outside of Türkiye ?' },
  { key: 'abroadFrom', header: 'From where will you be joining us ?' },
  { key: 'transport', header: 'Do you need transportation support ?' },
  { key: 'accommodation', header: 'Do you need accommodation support ?' },
  { key: 'tour', header: 'Pre-Conference Istanbul Tour Joining Status' },
  { key: 'outsideIstanbul', header: 'Will you be joining from outside of Istanbul ? ' },
  { key: 'city', header: 'Which city are you visiting us from?' },
  { key: 'otherRequirements', header: 'Do you need any other requirements?' },
  { key: 'tshirt', header: 'Speaker T-Shirt' },
  { key: 'afterParty', header: 'After Party Participation' },
  { key: 'anythingElse', header: 'Anything you want to tell us?' },
  { key: 'codeOfConduct', header: 'Code of Conduct' },
  { key: 'recording', header: 'Recording and publication' },
  { key: 'personalData', header: 'Personal data consent' },
] as const;

export type FieldKey = typeof FIELDS[number]['key'];

/** Header matching key: trim, collapse whitespace, drop years, drop trailing "?", lowercase. */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b20\d\d\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\?$/, '')
    .toLowerCase()
    .trim();
}

export function indexColumns(header: string[]): { index: Partial<Record<FieldKey, number>>; missing: FieldKey[] } {
  const byNorm = new Map<string, number>();
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (!byNorm.has(n)) byNorm.set(n, i);
  });
  const index: Partial<Record<FieldKey, number>> = {};
  const missing: FieldKey[] = [];
  for (const f of FIELDS) {
    const i = byNorm.get(normalizeHeader(f.header));
    if (i === undefined) missing.push(f.key);
    else index[f.key] = i;
  }
  return { index, missing };
}
