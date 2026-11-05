import { FIELDS, type FieldKey } from '../sheet/columns.js';

export const HEADER_ROW: string[] = FIELDS.map(f => f.header);

const DEFAULTS: Record<FieldKey, string> = {
  timestamp: '10/01/2026 10:00:00', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
  company: 'Example Corp', jobTitle: 'Engineer', phone: '+90 555 000 0000', bio: 'Fake bio for testing.',
  gde: 'No', linkedin: 'linkedin.com/in/ada-fake', x: '@adafake', instagram: '', github: 'adafake',
  photo: 'https://drive.google.com/open?id=FAKEPHOTO1', speakingExperience: 'Spoke at fake meetups.',
  whyDevFest: 'Fake reasons.', area: 'Web', areaOther: '', title: 'A Fake Talk About Engines',
  abstract: 'A fake abstract.', takeaways: 'Fake takeaways.', level: 'Intermediate', language: 'English',
  presentedBefore: 'No', talkHistory: '', hasCoSpeaker: 'No', coFirstName: '', coLastName: '', coBio: '',
  coEmail: '', coPhone: '', coLinkedin: '', coX: '', coInstagram: '', coPhoto: '',
  fromAbroad: 'No', abroadFrom: '', transport: 'No', accommodation: 'No', tour: 'Yes',
  outsideIstanbul: 'No', city: '', otherRequirements: '', tshirt: 'M', afterParty: 'Yes',
  anythingElse: '', codeOfConduct: 'I agree', recording: 'I agree', personalData: 'I agree',
};

/** Positional row in FIELDS order, filled with fake defaults. */
export function makeRow(o: Partial<Record<FieldKey, string>> = {}): string[] {
  return FIELDS.map(f => o[f.key] ?? DEFAULTS[f.key]);
}

export function fakeSheet(): string[][] {
  return [
    HEADER_ROW,
    // one speaker, 3 talks, emails differing only by case/spaces
    makeRow({ title: 'Fake Talk One' }),
    makeRow({ email: 'Ada@Example.com', title: 'Fake Talk Two', area: 'Cloud' }),
    makeRow({ email: ' ada@example.com ', title: 'Fake Talk Three', area: 'AI' }),
    // co-speaker talk
    makeRow({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', title: 'Compilers For Everyone',
      area: 'Mobile', hasCoSpeaker: 'Yes', coFirstName: 'Alan', coLastName: 'Turing', coEmail: 'alan@example.com',
      coBio: 'Fake co-speaker bio.', coPhone: '+90 555 111 1111' }),
    // "Other" topic
    makeRow({ firstName: 'Linus', lastName: 'Fakeman', email: 'linus@example.com', title: 'Kernel Things',
      area: 'Other (please specify)', areaOther: 'Operating systems' }),
    // no-session row
    makeRow({ firstName: 'Edsger', lastName: 'Dijkstra', email: 'edsger@example.com', title: '', abstract: '' }),
    // no consent (older form version: blank consent answers)
    makeRow({ firstName: 'Margaret', lastName: 'Hamilton', email: 'margaret@example.com', title: 'Landing Software',
      codeOfConduct: '', recording: '', personalData: '' }),
    // from abroad
    makeRow({ firstName: 'Tim', lastName: 'Example', email: 'tim@example.com', title: 'Fake Web Futures',
      fromAbroad: 'Yes', abroadFrom: 'Berlin, Germany', transport: 'Yes', accommodation: 'Yes' }),
    makeRow({ firstName: 'Barbara', lastName: 'Liskov', email: 'barbara@example.com', title: 'Substitution Principles',
      fromAbroad: 'Yes', abroadFrom: 'Boston, USA', outsideIstanbul: 'Yes', city: 'Ankara', tshirt: 'L' }),
    makeRow({ firstName: 'Donald', lastName: 'Knuth', email: 'donald@example.com', title: 'Literate Fake Programming',
      level: 'Advanced', language: 'Turkish', presentedBefore: 'Yes', talkHistory: 'Fake Conf 2025' }),
    makeRow({ firstName: 'Hedy', lastName: 'Lamarr', email: 'hedy@example.com', title: 'Frequency Hopping Apps',
      area: 'IoT', level: 'Beginner' }),
    makeRow({ firstName: 'Ken', lastName: 'Thompson', email: 'ken@example.com', title: 'Small Tools',
      github: 'https://github.com/kenfake' }),
  ];
}
