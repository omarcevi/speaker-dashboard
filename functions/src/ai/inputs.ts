import type { SubmissionData } from '../model.js';

// Escape rather than strip: with no `<` or `>` left in a value, no delimiter can form, whatever the nesting, case or spacing.
const clean = (v: string | undefined | null) => (v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();

function lines(pairs: [string, string | undefined | null][]): string {
  return pairs.map(([k, v]) => [k, clean(v)] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** Text sent to the overview model. No names, contact details, links, photos or logistics. */
export function overviewInput(s: SubmissionData): string {
  const a = s.advocu;
  const body = lines([
    ['Title', s.title], ['Abstract', s.abstract], ['Key takeaways', s.takeaways], ['Level', s.level],
    ['Language', s.language], ['Topic', s.topic], ['Bio', s.bio], ['Speaking experience', s.speakingExperience],
    ['Talk history', s.talkHistory], ['Presented before', s.presentedBefore], ['GDE', s.gde],
    ['Why DevFest', s.whyDevFest], ['Company', s.company], ['Job title', s.jobTitle],
    ['Advocu country', a?.country], ['Advocu city', a?.city], ['Advocu session type', a?.sessionTypes],
    ['Advocu participation', a?.participation],
  ]);
  return `<submission>\n${body}\n</submission>`;
}

/** Talk fields only, for embeddings. */
export function embeddingInput(s: SubmissionData): string {
  return lines([['Title', s.title], ['Abstract', s.abstract], ['Key takeaways', s.takeaways], ['Topic', s.topic]]);
}
