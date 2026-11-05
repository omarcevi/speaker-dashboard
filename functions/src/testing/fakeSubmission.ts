import { parseSheet } from '../sheet/parseSheet.js';
import type { SubmissionData } from '../model.js';
import { HEADER_ROW, makeRow } from './fakeRows.js';

export function fakeSubmission(over: Partial<SubmissionData> = {}): SubmissionData {
  return { ...parseSheet([HEADER_ROW, makeRow()]).submissions[0], ...over };
}
