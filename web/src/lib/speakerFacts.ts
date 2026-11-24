/** The rules' cap on meta/event.speakerFacts. */
export const FACTS_MAX = 20000

/** "1,234 / 20,000", and whether the text is over the cap. */
export function factsCounter(text: string): { label: string; over: boolean } {
  const n = text.length
  return { label: `${n.toLocaleString('en-US')} / ${FACTS_MAX.toLocaleString('en-US')}`, over: n > FACTS_MAX }
}
