import { createHash } from 'node:crypto';
import type { CoSpeaker, SubmissionData } from '../model.js';
import { indexColumns, type FieldKey } from './columns.js';
import { extractDriveFileId, normalizeLink } from './clean.js';

const OTHER_AREA = 'Other (please specify)';

/** values[0] is the header (sheet row 1); values[i] is sheet row i + 1. */
export function parseSheet(values: string[][]): { submissions: SubmissionData[]; missingColumns: FieldKey[] } {
  const { index, missing } = indexColumns(values[0] ?? []);
  const submissions: SubmissionData[] = [];

  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    if (cells.every(c => (c ?? '').trim() === '')) continue;
    const get = (k: FieldKey): string => {
      const col = index[k];
      return col === undefined ? '' : (cells[col] ?? '').trim();
    };
    const row = i + 1;
    const email = get('email');
    const area = get('area');
    const isOther = area === OTHER_AREA;
    const title = get('title');

    const coSpeaker: CoSpeaker | null =
      get('coFirstName') || get('coLastName') || get('coEmail')
        ? {
            firstName: get('coFirstName'), lastName: get('coLastName'), bio: get('coBio'),
            email: get('coEmail'), phone: get('coPhone'),
            linkedin: normalizeLink(get('coLinkedin'), 'linkedin'),
            x: normalizeLink(get('coX'), 'x'),
            instagram: normalizeLink(get('coInstagram'), 'instagram'),
            photoUrl: get('coPhoto'),
          }
        : null;

    const data: Omit<SubmissionData, 'contentHash'> = {
      id: `row-${row}`, row, timestamp: get('timestamp'),
      speakerKey: email ? email.toLowerCase() : `no-email:row-${row}`,
      firstName: get('firstName'), lastName: get('lastName'), email,
      company: get('company'), jobTitle: get('jobTitle'), phone: get('phone'), bio: get('bio'), gde: get('gde'),
      links: {
        linkedin: normalizeLink(get('linkedin'), 'linkedin'),
        x: normalizeLink(get('x'), 'x'),
        instagram: normalizeLink(get('instagram'), 'instagram'),
        github: normalizeLink(get('github'), 'github'),
      },
      photoUrl: get('photo'), photoFileId: extractDriveFileId(get('photo')),
      speakingExperience: get('speakingExperience'), whyDevFest: get('whyDevFest'), anythingElse: get('anythingElse'),
      topic: isOther ? get('areaOther') || 'Other' : area,
      topicGroup: isOther ? 'Other' : area || 'Unspecified',
      title, abstract: get('abstract'), takeaways: get('takeaways'), level: get('level'), language: get('language'),
      presentedBefore: get('presentedBefore'), talkHistory: get('talkHistory'), noSession: title === '',
      coSpeaker,
      logistics: {
        fromAbroad: get('fromAbroad'), abroadFrom: get('abroadFrom'), transport: get('transport'),
        accommodation: get('accommodation'), tour: get('tour'), outsideIstanbul: get('outsideIstanbul'),
        city: get('city'), otherRequirements: get('otherRequirements'), tshirt: get('tshirt'),
        afterParty: get('afterParty'),
      },
      consent: { codeOfConduct: get('codeOfConduct'), recording: get('recording'), personalData: get('personalData') },
    };
    // id and row are left out so the same answers hash the same wherever they sit; planSync uses that to spot moved rows.
    const { id: _id, row: _row, ...content } = data;
    const contentHash = createHash('sha1').update(JSON.stringify(content)).digest('hex');
    submissions.push({ ...data, contentHash });
  }
  return { submissions, missingColumns: missing };
}
