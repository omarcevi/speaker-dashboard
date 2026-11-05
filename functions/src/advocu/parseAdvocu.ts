import { createHash } from 'node:crypto';
import type { SubmissionData } from '../model.js';
import { parseCsv } from './csv.js';
import { languageFor, levelFor, topicGroupFor } from './mapFields.js';

export const ADVOCU_HEADERS: readonly string[] = [
  'Creation date', 'Status', 'Speaker email', 'First name', 'Last name', 'Company', 'Job title', 'Country', 'City', 'Bio',
  'Call for Papers title', 'Proposal title', 'Proposal abstract', 'Proposal languages', 'Proposal topics', 'Session type',
  'Audience level', 'Participation type', 'Session length', 'Eligible', 'Rejection reason', 'Review feedback',
  'Reviewer first name', 'Reviewer last name', 'Reviewer email', 'External user',
];

const REQUIRED = ['Creation date', 'Speaker email', 'Proposal title', 'First name', 'Last name'];

export class ImportRefused extends Error {}

export interface ParsedAdvocu {
  applications: SubmissionData[];
  cfpTitles: string[];
  rejected: { row: number; reason: string }[];
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export function advocuId(email: string, creationIso: string): string {
  return 'advocu-' + sha1(`${email.trim().toLowerCase()}|${creationIso}`).slice(0, 16);
}

/** Row numbers count the header as row 1. */
export function parseAdvocu(text: string): ParsedAdvocu {
  const table = parseCsv(text);
  const index = new Map<string, number>();
  (table[0] ?? []).forEach((h, i) => { const k = h.trim().toLowerCase(); if (!index.has(k)) index.set(k, i); });
  const missing = REQUIRED.filter(h => !index.has(h.toLowerCase()));
  if (missing.length) throw new ImportRefused(`This is not an Advocu export: missing columns ${missing.join(', ')}.`);
  if (table.length < 2) throw new ImportRefused('The file has no applications.');

  const applications: SubmissionData[] = [];
  const rejected: { row: number; reason: string }[] = [];
  const cfpTitles = new Set<string>();
  const seen = new Map<string, number>();

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const row = i + 1;
    const get = (h: string): string => {
      const col = index.get(h.toLowerCase());
      return col === undefined ? '' : (cells[col] ?? '').trim();
    };
    const created = new Date(get('Creation date'));
    if (!get('Creation date') || Number.isNaN(created.getTime())) { rejected.push({ row, reason: 'Creation date is not a date' }); continue; }
    const email = get('Speaker email');
    if (!email) { rejected.push({ row, reason: 'Speaker email is empty' }); continue; }
    const title = get('Proposal title');
    if (!title) { rejected.push({ row, reason: 'Proposal title is empty' }); continue; }

    const creationIso = created.toISOString();
    const id = advocuId(email, creationIso);
    const earlier = seen.get(id);
    if (earlier !== undefined) throw new ImportRefused(`The file lists the same application twice (row ${earlier} and row ${row}).`);
    seen.set(id, row);

    const topics = get('Proposal topics');
    const languages = get('Proposal languages');
    const levels = get('Audience level');
    const cfpTitle = get('Call for Papers title');
    if (cfpTitle) cfpTitles.add(cfpTitle);

    const data: Omit<SubmissionData, 'contentHash'> = {
      id, row: 0, timestamp: creationIso, speakerKey: email.toLowerCase(),
      firstName: get('First name'), lastName: get('Last name'), email,
      company: get('Company'), jobTitle: get('Job title'), phone: '', bio: get('Bio'), gde: '',
      links: { linkedin: '', x: '', instagram: '', github: '' },
      photoUrl: '', photoFileId: null, speakingExperience: '', whyDevFest: '', anythingElse: '',
      topic: topics, topicGroup: topicGroupFor(topics),
      title, abstract: get('Proposal abstract'), takeaways: '', level: levelFor(levels), language: languageFor(languages),
      presentedBefore: '', talkHistory: '', noSession: false, coSpeaker: null,
      logistics: {
        fromAbroad: '', abroadFrom: '', transport: '', accommodation: '', tour: '', outsideIstanbul: '',
        city: '', otherRequirements: '', tshirt: '', afterParty: '',
      },
      consent: { codeOfConduct: '', recording: '', personalData: '' },
      source: 'advocu',
      advocu: {
        creationDate: creationIso, status: get('Status'), eligible: get('Eligible'), country: get('Country'), city: get('City'),
        sessionTypes: get('Session type'), sessionLength: get('Session length'), participation: get('Participation type'),
        languages, levels, topics, cfpTitle,
      },
    };
    // id and row are left out so the same answers hash the same wherever they sit, as in parseSheet.
    const { id: _id, row: _row, ...content } = data;
    applications.push({ ...data, contentHash: sha1(JSON.stringify(content)) });
  }
  return { applications, cfpTitles: [...cfpTitles], rejected };
}
