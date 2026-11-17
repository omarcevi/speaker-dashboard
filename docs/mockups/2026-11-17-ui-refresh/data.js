// Made-up sample data for the mockups. No real speakers. Every count on screen is computed from these rows.
(function () {
  const team = [
    { uid: 'omar', name: 'Omar E.', email: 'omar.e@example.com', role: 'admin', joined: '2026-10-29' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'duygu', name: 'Duygu Aksoy', email: 'duygu.aksoy@example.com', role: 'admin', joined: '2026-10-30' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'kerem', name: 'Kerem Tan', email: 'kerem.tan@example.com', role: 'member', joined: '2026-10-31' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'seda', name: 'Seda Bulut', email: 'seda.bulut@example.com', role: 'member', joined: '2026-11-02' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'onur', name: 'Onur Yalçın', email: 'onur.yalcin@example.com', role: 'member', joined: '2026-11-03' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'ece', name: 'Ece Karaca', email: 'ece.karaca@example.com', role: 'waiting', joined: '2026-11-16' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    { uid: 'murat', name: 'Murat Er', email: 'murat.er@example.com', role: 'removed', joined: '2026-11-01' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
  ];

  const yes = 'I agree';
  const sp = (first, last, job, company, o = {}) => ({
    first, last, job, company,
    email: `${first}.${last}`.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i') + '@example.com', // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
    // Ofcom's drama range (+44 7700 900000-900999) is reserved for fiction, so no number here can reach a real person.
    phone: '+44 7700 900' + String(100 + ((first.length * 37 + last.length * 11) % 900)).padStart(3, '0'),
    links: o.links ?? { linkedin: `linkedin.com/in/${first.toLowerCase()}-example`, x: '', github: `github.com/${first.toLowerCase()}-example`, instagram: '' },
    gde: o.gde ?? 'No', from: o.from ?? 'Istanbul', abroad: o.abroad ?? '', outside: o.outside ?? '',
    bio: o.bio ?? `${job} at ${company || 'an independent practice'}. Writes about what ships, not what demos well.`,
    experience: o.experience ?? 'Two meetup talks and one internal tech day.',
    why: o.why ?? 'DevFest Istanbul was the first conference I attended; I would like to give back.',
    anything: o.anything ?? '',
    consent: o.consent ?? { codeOfConduct: yes, recording: yes, personalData: yes },
    logistics: o.logistics ?? { transport: 'No', accommodation: 'No', tour: 'No', afterParty: 'Yes', tshirt: 'M', other: '' },
  });

  const S = {
    elif: sp('Elif', 'Kaya', 'Android Lead', 'Lale Bank', { links: { linkedin: 'linkedin.com/in/elif-kaya-example', x: 'x.com/elifkaya_ex', github: 'github.com/elif-example', instagram: '' }, experience: 'Spoke at GDG Istanbul meetups (3) and Android Makers Istanbul 2025.', bio: 'Leads the Android team at Lale Bank. Shipped on-device ML to 4 million customers and lived to tell the tale.' }),
    mert: sp('Mert', 'Demir', 'Staff Engineer', 'Nar Mobile', { logistics: { transport: 'No', accommodation: 'No', tour: 'Yes', afterParty: 'Yes', tshirt: 'L', other: '' } }),
    zeynep: sp('Zeynep', 'Arslan', 'Senior Developer', 'Pera Games', { from: 'Izmir', outside: 'Izmir' }),
    can: sp('Can', 'Öztürk', 'Independent consultant', '', { gde: 'Yes, Firebase', from: 'Ankara', outside: 'Ankara' }),
    selin: sp('Selin', 'Aydın', 'Data Engineer', 'Sarnıç Data'),
    lena: sp('Lena', 'Hoffmann', 'Frontend Engineer', 'Köprü Health', { from: 'Berlin, Germany', abroad: 'Berlin, Germany' }),
    burak: sp('Burak', 'Şahin', 'ML Engineer', 'Tulpar AI', { logistics: { transport: 'No', accommodation: 'No', tour: 'No', afterParty: 'Yes', tshirt: 'M', other: '' } }),
    deniz: sp('Deniz', 'Yıldız', 'Engineering Manager', 'Galata Systems'),
    javier: sp('Javier', 'Morales', 'Performance Engineer', 'Moda Commerce', { from: 'Madrid, Spain', abroad: 'Madrid, Spain' }),
    ayse: sp('Ayşe', 'Koç', 'Software Engineer', 'Kuzey Labs'),
    emre: sp('Emre', 'Çelik', 'Embedded Developer', 'Vapur Mobility', { from: 'Bursa', outside: 'Bursa' }),
    priya: sp('Priya', 'Natarajan', 'Security Engineer', 'Ada Cloud', { from: 'Bengaluru, India', abroad: 'Bengaluru, India', logistics: { transport: 'Yes', accommodation: 'Yes', tour: 'Yes', afterParty: 'No', tshirt: 'S', other: 'Vegetarian meals' }, anything: 'Happy to run a passkeys workshop if there is a slot.' }),
    okan: sp('Okan', 'Yurt', 'Mobile Developer', 'Simit Apps'),
    gizem: sp('Gizem', 'Tekin', 'Developer Advocate', 'Kuzey Labs', { gde: 'Yes, Web', logistics: { transport: 'No', accommodation: 'No', tour: 'Yes', afterParty: 'Yes', tshirt: 'M', other: '' } }),
    hakan: sp('Hakan', 'Polat', 'Backend Engineer', 'Lale Bank'),
    nilay: sp('Nilay', 'Erdem', 'Student', 'Fener Institute of Technology', { experience: 'None yet; presented my thesis to my class.' }),
    tolga: sp('Tolga', 'Kurt', 'CTO', 'Kestane Robotics', { from: 'Eskişehir', outside: 'Eskişehir' }),
    melis: sp('Melis', 'Uçar', 'Product Engineer', 'Pera Games'),
    ahmet: sp('Ahmet', 'Bal', 'Cloud Architect', 'Ada Cloud', { from: 'Ankara', outside: 'Ankara', logistics: { transport: 'Yes', accommodation: 'Yes', tour: 'No', afterParty: 'Yes', tshirt: 'L', other: 'Arriving the night before' } }),
    sophie: sp('Sophie', 'Laurent', 'Android Engineer', 'Lune Studio', { from: 'Lyon, France', abroad: 'Lyon, France' }),
    kaan: sp('Kaan', 'Aksu', 'Flutter Developer', 'Freelance', { consent: { codeOfConduct: '', recording: '', personalData: '' } }),
    ipek: sp('İpek', 'Duman', 'QA Lead', 'Moda Commerce'),
    baris: sp('Barış', 'Özkan', 'Site Reliability Engineer', 'Galata Systems'),
  };

  const t = (id, sk, title, topic, level, language, status, scores, o = {}) => ({
    id: String(id), speaker: S[sk], speakerKey: sk, title, topic, level, language, status, scores,
    abstract: o.abstract ?? `${title}. A practical session built from production work: what we tried, what failed, and what we would do again. Every claim comes with the numbers behind it.`,
    takeaways: o.takeaways ?? ['A checklist you can apply on Monday', 'The two mistakes that cost us the most time', 'Where to start if your team is small'],
    presentedBefore: o.presentedBefore ?? 'No', talkHistory: o.talkHistory ?? '',
    coSpeaker: o.coSpeaker ?? null, sources: o.sources ?? ['form'], removed: !!o.removed,
    comments: o.comments ?? [], ai: o.ai ?? null, similar: o.similar ?? [],
    history: o.history ?? [], submitted: o.submitted ?? `2026-09-${String(id).padStart(2, '0')}`,
  });

  const talks = [
    t(1, 'elif', 'Gemini Nano on-device: shipping it in a banking app', 'AI', 'Intermediate', 'English', 'pending', { duygu: 4, kerem: 3, seda: 4 }, {
      sources: ['form', 'advocu'],
      abstract: 'Running a model on the phone sounds simple until it meets a bank: offline rules, older devices, and a compliance team that reads every prompt.\n\nThis talk walks through how we put Gemini Nano behind three features in the Lale Bank app, what we measured on 40 device models, and the fallbacks we needed when the model was not available.',
      takeaways: ['How to gate on-device features by device capability, not OS version', 'A latency and battery budget that held up in production', 'What our compliance review asked for, and how we answered it'],
      presentedBefore: 'Yes', talkHistory: 'An earlier 20-minute version at GDG Istanbul, June 2026.',
      comments: [
        { by: 'Duygu Aksoy', when: '2 days ago', text: 'Strong and concrete. I would ask her to cut the compliance section if we give her 30 minutes.' },
        { by: 'Kerem Tan', when: 'yesterday', text: 'Overlaps with talk 23 on testing Gemini features. Could be one AI track block.' },
      ],
      ai: { talk: 'A production case study of on-device Gemini Nano in a banking app, with device coverage data and fallbacks.', speaker: 'Android lead at a bank who has spoken at local GDG meetups.', flags: [['Abstract', 'Clear', 'States the problem, the scope and what was measured.'], ['Community', 'GDG Istanbul speaker', 'Mentions three GDG Istanbul meetup talks.'], ['Speaking', 'Some', 'Meetups and one regional conference.'], ['Student', 'No', 'Works as a team lead.']] },
      similar: [['23', 0.91], ['10', 0.89]],
    }),
    t(2, 'mert', 'Jetpack Compose performance, measured', 'Mobile', 'Advanced', 'English', 'approved', { omar: 5, duygu: 5, kerem: 4, seda: 5, onur: 4 }, {
      comments: [{ by: 'Seda Bulut', when: '5 days ago', text: 'Best Android talk in the pile. Benchmarks are real.' }, { by: 'Onur Yalçın', when: '4 days ago', text: 'Agree. Advanced is right.' }, { by: 'Omar E.', when: '3 days ago', text: 'Approved; ask for the slides by the 1st.' }],
      history: [['approved', 'Duygu Aksoy', '12 Nov, 18:40']],
      ai: { talk: 'Benchmark-driven Compose performance work with before and after traces.', speaker: 'Staff engineer with prior conference talks.', flags: [['Abstract', 'Clear', 'Names the metrics and tools.'], ['Community', 'None mentioned', 'No community role in the answers.'], ['Speaking', 'A lot', 'Lists six conference talks.'], ['Student', 'No', 'Staff engineer.']] },
      similar: [['21', 0.89]],
    }),
    t(3, 'zeynep', 'Flutter on the web: what broke in production', 'Mobile', 'Intermediate', 'Turkish', 'maybe', { omar: 3, duygu: 2, kerem: 4, seda: 3, onur: 5 }, {
      comments: [{ by: 'Duygu Aksoy', when: '4 days ago', text: 'Abstract is vague about what actually broke.' }, { by: 'Onur Yalçın', when: '4 days ago', text: 'I saw a version of this at a meetup; it was great live.' }, { by: 'Kerem Tan', when: '3 days ago', text: 'Maybe until we see the final Flutter count.' }],
      history: [['maybe', 'Omar E.', '13 Nov, 10:05']], similar: [['22', 0.92]],
    }),
    t(4, 'can', 'Firestore security rules you can test', 'Cloud', 'Intermediate', 'Turkish', 'pending', { omar: 4, duygu: 5, kerem: 3, onur: 4 }, {
      comments: [{ by: 'Onur Yalçın', when: 'yesterday', text: 'Can also submitted the cold starts talk; we should take at most one.' }], similar: [['20', 0.93], ['13', 0.88]],
    }),
    t(5, 'selin', 'From notebook to Cloud Run in one afternoon', 'Cloud', 'Beginner', 'Turkish', 'declined', { omar: 2, duygu: 1, kerem: 3, seda: 2, onur: 3 }, {
      comments: [{ by: 'Duygu Aksoy', when: '6 days ago', text: 'Reads like a product demo.' }, { by: 'Seda Bulut', when: '6 days ago', text: 'Agree.' }, { by: 'Kerem Tan', when: '5 days ago', text: 'Encourage her to apply to the workshop track instead.' }, { by: 'Omar E.', when: '5 days ago', text: 'Declined.' }],
      history: [['declined', 'Omar E.', '11 Nov, 21:12']], similar: [['19', 0.9]],
    }),
    t(6, 'lena', 'Accessible forms without a design system', 'Web', 'Beginner', 'English', 'pending', {}, { similar: [['15', 0.9]] }),
    t(7, 'burak', 'RAG over Turkish legal text', 'AI', 'Advanced', 'Turkish', 'approved', { omar: 4, duygu: 5, kerem: 4, seda: 5, onur: 4 }, {
      coSpeaker: { first: 'Derya', last: 'Şen', email: 'derya.sen@example.com', phone: '+44 7700 900418', bio: 'Lawyer turned data scientist at Tulpar AI.' }, // taste-skill-ignore: RFC 2606 reserved domain, so no real address is fabricated
      comments: [{ by: 'Seda Bulut', when: '5 days ago', text: 'Turkish-language AI content is exactly what we lacked last year.' }, { by: 'Kerem Tan', when: '4 days ago', text: 'Co-speaker makes it stronger.' }],
      history: [['approved', 'Duygu Aksoy', '12 Nov, 18:44']], similar: [['23', 0.88]],
    }),
    t(8, 'deniz', 'Kotlin Multiplatform in a 40-person team', 'Mobile', 'Advanced', 'English', 'pending', { omar: 4, kerem: 3, seda: 4, onur: 4 }, {
      comments: [{ by: 'Kerem Tan', when: '3 days ago', text: 'Good management angle.' }, { by: 'Seda Bulut', when: '2 days ago', text: 'Not much code in the abstract.' }],
    }),
    t(9, 'javier', 'Core Web Vitals at checkout peak', 'Web', 'Intermediate', 'English', 'maybe', { omar: 4, duygu: 3, kerem: 4, seda: 3, onur: 4 }, {
      comments: [{ by: 'Omar E.', when: '3 days ago', text: 'Travel from Madrid; check budget before approving.' }, { by: 'Duygu Aksoy', when: '2 days ago', text: 'Good content.' }],
      history: [['maybe', 'Omar E.', '13 Nov, 10:09']], similar: [['12', 0.88]],
    }),
    t(10, 'ayse', 'Agents with ADK: from prototype to on-call', 'AI', 'Intermediate', 'English', 'pending', { kerem: 4 }, { similar: [['1', 0.89], ['18', 0.88]] }),
    t(11, 'emre', 'Edge ML in a Raspberry Pi greenhouse', 'IoT', 'Beginner', 'Turkish', 'pending', { omar: 3, seda: 4 }, {
      comments: [{ by: 'Seda Bulut', when: 'yesterday', text: 'Fun demo; would fit the afternoon slot.' }], similar: [['18', 0.89]],
    }),
    t(12, 'priya', 'Passkeys for two million users', 'Web', 'Advanced', 'English', 'approved', { omar: 4, duygu: 5, kerem: 4, seda: 4, onur: 4 }, {
      sources: ['form', 'advocu'],
      comments: [{ by: 'Duygu Aksoy', when: '5 days ago', text: 'Needs travel and hotel; approved anyway, budget confirmed.' }, { by: 'Omar E.', when: '4 days ago', text: 'Workshop offer noted.' }, { by: 'Kerem Tan', when: '4 days ago', text: 'Great.' }],
      history: [['maybe', 'Omar E.', '11 Nov, 20:30'], ['approved', 'Duygu Aksoy', '12 Nov, 18:51']], similar: [['9', 0.88]],
    }),
    t(13, 'can', 'Cloud Functions cold starts, explained with traces', 'Cloud', 'Advanced', 'Turkish', 'pending', { duygu: 3, onur: 4 }, { similar: [['4', 0.88]] }),
    t(14, 'okan', 'Wear OS tiles that people actually open', 'Mobile', 'Intermediate', 'Turkish', 'pending', { omar: 3, kerem: 3, seda: 2 }, {
      comments: [{ by: 'Kerem Tan', when: '2 days ago', text: 'Niche for our audience.' }],
    }),
    t(15, 'gizem', 'Baseline: which web features can I use today?', 'Web', 'Beginner', 'Turkish', 'approved', { omar: 5, duygu: 4, kerem: 5, seda: 4, onur: 5 }, {
      comments: [{ by: 'Onur Yalçın', when: '6 days ago', text: 'Perfect opener for the web track.' }, { by: 'Seda Bulut', when: '5 days ago', text: 'Yes.' }],
      history: [['approved', 'Omar E.', '11 Nov, 21:20']], similar: [['6', 0.9]],
    }),
    t(16, 'hakan', 'Event sourcing for a payments ledger', 'Cloud', 'Advanced', 'English', 'maybe', { omar: 4, duygu: 3, kerem: 3, onur: 4 }, {
      comments: [{ by: 'Duygu Aksoy', when: '3 days ago', text: 'Same company as talk 1; fine, different teams.' }, { by: 'Onur Yalçın', when: '3 days ago', text: 'Strong but dense.' }, { by: 'Kerem Tan', when: '2 days ago', text: 'Maybe.' }],
      history: [['maybe', 'Duygu Aksoy', '13 Nov, 11:02']], similar: [['20', 0.88]],
    }),
    t(17, 'nilay', 'My first Firebase app as a student', 'Other', 'Beginner', 'Turkish', 'declined', { omar: 2, duygu: 2, kerem: 3, seda: 2 }, {
      comments: [{ by: 'Seda Bulut', when: '6 days ago', text: 'Lovely energy; suggest the lightning-talk slot next year.' }],
      history: [['declined', 'Omar E.', '11 Nov, 21:25']],
    }),
    t(18, 'tolga', 'Robot arms with Gemini Robotics', 'AI', 'Advanced', 'English', 'pending', { onur: 5, seda: 4 }, {
      comments: [{ by: 'Onur Yalçın', when: 'today', text: 'They offered to bring the arm.' }], similar: [['11', 0.89], ['10', 0.88]],
    }),
    t(19, 'melis', 'Game analytics without a data team', 'Cloud', 'Intermediate', 'Turkish', 'pending', {}, { similar: [['5', 0.9]] }),
    t(20, 'ahmet', 'Multi-region Firestore: costs we did not expect', 'Cloud', 'Advanced', 'Turkish', 'approved', { omar: 5, duygu: 4, kerem: 4, seda: 5, onur: 4 }, {
      comments: [{ by: 'Kerem Tan', when: '5 days ago', text: 'Real numbers. Approve.' }],
      history: [['approved', 'Duygu Aksoy', '12 Nov, 18:55']], similar: [['4', 0.93], ['16', 0.88]],
    }),
    t(21, 'sophie', 'Predictive back, done right', 'Mobile', 'Intermediate', 'English', 'pending', { omar: 4, duygu: 4, kerem: 5 }, { similar: [['2', 0.89]] }),
    t(22, 'kaan', 'Riverpod 3 in a production Flutter app', 'Mobile', 'Intermediate', 'Turkish', 'maybe', { omar: 3, duygu: 4, seda: 3, onur: 3 }, {
      comments: [{ by: 'Omar E.', when: '2 days ago', text: 'Pick one of this and talk 3.' }], history: [['maybe', 'Omar E.', '13 Nov, 10:12']], similar: [['3', 0.92]],
    }),
    t(23, 'ipek', 'Testing Gemini features: evals for QA teams', 'AI', 'Intermediate', 'Turkish', 'pending', { kerem: 3 }, { similar: [['1', 0.91], ['7', 0.88]] }),
    t(24, 'baris', 'SLOs for a team of three', 'Cloud', 'Beginner', 'English', 'declined', { omar: 2, duygu: 3, kerem: 2, seda: 2, onur: 3 }, {
      history: [['declined', 'Duygu Aksoy', '12 Nov, 19:03']],
    }),
    t(25, 'selin', 'From notebook to Cloud Run (earlier draft)', 'Cloud', 'Beginner', 'Turkish', 'pending', {}, { removed: true }),
  ];

  const STATUSES = ['pending', 'maybe', 'approved', 'declined'];
  const LABEL = { all: 'All', pending: 'Pending', maybe: 'Maybe', approved: 'Approved', declined: 'Declined' };
  const live = talks.filter((x) => !x.removed);
  const counts = { all: live.length };
  for (const s of STATUSES) counts[s] = live.filter((x) => x.status === s).length;
  console.assert(STATUSES.reduce((a, s) => a + counts[s], 0) === counts.all, 'status counts must sum to All');
  const speakers = new Set(live.map((x) => x.speakerKey));
  for (const x of talks) {
    const ids = new Set(talks.map((y) => y.id));
    for (const [id] of x.similar) console.assert(ids.has(id), `similar talk ${id} must exist`);
  }

  window.DATA = {
    me: team[0], team, talks, STATUSES, LABEL, counts, speakerCount: speakers.size,
    sync: { lastSynced: '4 min ago', rows: 25, missingColumns: [] },
    advocu: { lastImport: '14 Nov 2026, 16:20', by: 'Duygu Aksoy', total: 7 },
    showAllKey: 'mock.showAll',
  };
})();
