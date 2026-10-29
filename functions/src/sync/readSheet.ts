import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

/** Reads every cell of one sheet tab using the runtime service account (ADC). */
export async function readSheet(sheetId: string, tab: string): Promise<string[][]> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'` });
  return (res.data.values ?? []) as string[][];
}
