// Maps Advocu CSV values onto the dashboard's own topic group, language and level.
const split = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean);
const topLevel = (tag: string) => tag.split(' - ')[0].trim();

export function topicGroupFor(topics: string): string {
  const tags = split(topics);
  const tops = tags.map(topLevel);
  if (tags.some((t) => /\b(gemini|agents?|agentic|llms?|generative)\b/i.test(t)) || tops.includes('Build with AI')) {
    return 'Generative AI, LLMs & agents';
  }
  if (tops.includes('AI')) return 'Artificial Intelligence / Machine Learning';
  if (tops.some((t) => ['Cloud', 'Google Cloud', 'Networking', 'Storage', 'Identity'].includes(t))) {
    return 'Cloud / DevOps / Infrastructure';
  }
  if (tops.includes('Firebase')) return 'Mobile Development';
  if (tops.includes('Web')) return 'Web Development';
  if (tops.includes('UX / UI Design')) return 'Product / Design / UX';
  return 'Other';
}

export function languageFor(languages: string): string {
  const have = split(languages).map((l) => l.toLowerCase());
  return [have.includes('english') && 'English', have.includes('turkish') && 'Turkish'].filter(Boolean).join(', ');
}

export function levelFor(levels: string): string {
  const mapped = split(levels).map((l) => (l.toLowerCase() === 'advance' ? 'Advanced' : l));
  if (mapped.length <= 1) return mapped[0] ?? '';
  return mapped.includes('Intermediate') ? 'Intermediate' : mapped[0];
}
