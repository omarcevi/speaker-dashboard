// Email mockups: made-up templates, emails and replies over the UI-refresh sample data. No real people.
(function () {
  const { D, esc, I, shell, initials, plural, statusPill, speakerName } = UI;

  // The shell from the UI refresh, plus the Templates item (everyone can open it; editing is admin-only).
  const mailIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="m2.5 4.5 5.5 4 5.5-4"/></svg>';
  function mailShell(content, tab) {
    const base = '../2026-11-17-ui-refresh/';
    shell('templates', content);
    for (const a of document.querySelectorAll('.side a, .topbar a')) {
      const h = a.getAttribute('href');
      if (h && !h.startsWith('http') && !h.startsWith('#') && !h.includes('/')) a.setAttribute('href', base + h);
    }
    const nav = document.querySelector('.nav');
    const logistics = [...nav.querySelectorAll('a')].find((a) => a.textContent.includes('Logistics'));
    logistics.insertAdjacentHTML('afterend', `<a href="emails.html" aria-current="page">${mailIcon}<span>Emails</span></a>`);
    if (tab) document.querySelector('.canvas').insertAdjacentHTML('afterbegin', `<nav class="subnav" aria-label="Emails">${[['emails', 'emails.html', 'Conversations'], ['templates', 'templates.html', 'Templates'], ['event', 'event.html', 'Event settings']].map(([k, h, l]) => `<a href="${h}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`);
  }

  const RULES = {
    acceptance: ['Acceptance', 'Speakers with an approved talk, once. Lists only the approved talks.'],
    decline: ['Decline', 'Speakers whose talks were all declined, once.'],
    approved: ['Approved speakers', 'Anyone with at least one approved talk.'],
    anyone: ['Anyone', 'Any speaker, whatever their status. For one-off questions.'],
  };

  const event = [
    { key: 'eventName', label: 'Event name', value: 'DevFest Istanbul 2026' },
    { key: 'eventDate', label: 'Event date', value: 'Saturday 12 December 2026' },
    { key: 'venue', label: 'Venue', value: 'Example Congress Centre, Şişli, Istanbul' },
    { key: 'checkIn', label: 'Speaker check-in', value: '08:30, speaker desk by the main hall' },
    { key: 'slidesDeadline', label: 'Slides deadline', value: '' },
  ];

  const templates = [
    { id: 'acceptance', name: 'Acceptance', rule: 'acceptance', edited: ['Duygu Aksoy', '16 Nov, 18:02'], attachments: [],
      subject: "You're speaking at {{eventName}} 🎉",
      body: "Hi {{firstName}},\n\nGreat news: the team loved your proposal, and we'd like you on stage at {{eventName}} on {{eventDate}}.\n\nAccepted:\n{{talkTitles}}\n\nCould you reply by 28 November to confirm you can make it? We'll follow up with the schedule and everything you need for the day.\n\nSee you in Istanbul,\nThe DevFest Istanbul team" },
    { id: 'decline', name: 'Decline', rule: 'decline', edited: ['Duygu Aksoy', '16 Nov, 18:10'], attachments: [],
      subject: 'Your {{eventName}} proposal',
      body: "Hi {{firstName}},\n\nThank you for submitting to {{eventName}}. We had far more proposals than slots this year, and we weren't able to include:\n{{talkTitles}}\n\nWe'd love to see you in the audience on {{eventDate}}, and please submit again next year.\n\nThe DevFest Istanbul team" },
    { id: 'presentation', name: 'Presentation request', rule: 'approved', edited: ['Omar E.', '20 Nov, 11:45'], attachments: [{ name: 'DevFest-2026-slide-template.pptx', size: '4.2 MB' }],
      subject: 'Slides for {{eventName}}: due {{slidesDeadline}}',
      body: "Hi {{firstName}},\n\nPlease send your slides for:\n{{talkTitles}}\nby {{slidesDeadline}}, as PDF or a Google Slides link. The attached template is optional.\n\nThanks!" },
    { id: 'event-info', name: 'Event info', rule: 'approved', edited: ['Omar E.', '21 Nov, 09:12'], attachments: [{ name: 'Venue-map.pdf', size: '640 KB' }],
      subject: '{{eventName}}: everything you need for the day',
      body: "Hi {{firstName}},\n\nVenue: {{venue}}\nCheck-in: {{checkIn}}\n\nThe venue map is attached. Wi-Fi details will be at the speaker desk.\n\nSee you on {{eventDate}}!" },
    { id: 'day-before', name: 'Day before', rule: 'approved', edited: ['Omar E.', '21 Nov, 09:20'], attachments: [],
      subject: 'See you tomorrow at {{eventName}}',
      body: "Hi {{firstName}},\n\nA quick reminder: check-in is {{checkIn}} at {{venue}}.\n\nIf anything comes up tonight, reply to this email and someone will answer.\n\nSee you tomorrow!" },
  ];

  // Speakers grouped like the app does (by speakerKey), removed rows ignored.
  const groups = new Map();
  for (const t of D.talks.filter((x) => !x.removed)) {
    if (!groups.has(t.speakerKey)) groups.set(t.speakerKey, { key: t.speakerKey, sp: t.speaker, talks: [] });
    groups.get(t.speakerKey).talks.push(t);
  }
  const speakers = [...groups.values()];
  const decision = (g) => g.talks.some((t) => t.status === 'approved') ? 'approved' : g.talks.every((t) => t.status === 'declined') ? 'declined' : 'not-ready';
  const bySpeaker = (k) => groups.get(k);

  // History. Gizem got the Decline on 12 Nov, then her talk was approved: she needs a follow-up.
  const emails = [
    { id: 'e1', speaker: 'priya', template: 'acceptance', state: 'sent', when: '18 Nov, 10:21', by: 'Duygu Aksoy', replies: 2, thread: 't1', talks: ['12'], last: ['speaker', '19 Nov, 09:12', 'Perfect, itinerary attached. Landing 10 Dec, 15:40 at IST.'] },
    { id: 'e8', speaker: 'priya', template: 'presentation', state: 'sent', when: '21 Nov, 12:00', by: 'Omar E.', thread: 't4' },
    { id: 'e9', speaker: 'mert', template: null, subject: 'Your talk slot: morning or afternoon?', state: 'sent', when: '20 Nov, 15:30', by: 'Duygu Aksoy', replies: 1, thread: 't5', last: ['team', '20 Nov, 17:05', 'Thanks Mert, afternoon it is.'] },
    { id: 'e2', last: ['bounce', '18 Nov, 10:22', 'Address not found'], speaker: 'burak', template: 'acceptance', state: 'sent', when: '18 Nov, 10:21', by: 'Duygu Aksoy', bounced: '550 5.1.1 The email account that you tried to reach does not exist.', cc: ['derya.sahin@example.com'], thread: 't2', talks: ['7'] }, // taste-skill-ignore: RFC 2606 reserved domain
    { id: 'e3', speaker: 'gizem', template: 'decline', state: 'sent', when: '12 Nov, 17:40', by: 'Omar E.', thread: 't3', talks: ['15'] },
    { id: 'e4', speaker: 'priya', template: 'event-info', state: 'scheduled', when: '2 Dec, 09:00', by: 'Omar E.' },
    { id: 'e5', speaker: 'burak', template: 'event-info', state: 'held', when: '22 Nov, 09:00', by: 'Omar E.', reason: '{{checkIn}} was empty at send time' },
    { id: 'e6', speaker: 'ahmet', template: null, subject: 'Quick question about your talk length', state: 'unknown', when: '23 Nov, 11:02', by: 'Omar E.' },
    { id: 'e7', speaker: 'nilay', template: 'decline', state: 'manual', when: '15 Nov', by: 'Duygu Aksoy', talks: ['17'] },
  ];
  const sentOf = (k) => emails.filter((e) => e.speaker === k && (e.state === 'sent' || e.state === 'manual'));
  const tmpl = (id) => templates.find((t) => t.id === id);
  const decisionSent = (k) => sentOf(k).some((e) => ['acceptance', 'decline'].includes(tmpl(e.template)?.rule));

  // Who can get a template, with the reason when they can't. Mirrors the plan's `eligibility`.
  function eligible(t, g, followUp = false) {
    const d = decision(g);
    const approved = g.talks.filter((x) => x.status === 'approved');
    if (t.rule === 'acceptance') {
      if (d !== 'approved') return { ok: false, why: d === 'declined' ? 'All talks declined' : 'Still pending or maybe' };
      if (decisionSent(g.key) && !followUp) {
        const covered = new Set(sentOf(g.key).filter((e) => tmpl(e.template)?.rule === 'acceptance').flatMap((e) => e.talks ?? []));
        const fresh = approved.filter((x) => !covered.has(x.id));
        return fresh.length ? { ok: false, followUp: true, why: 'Decision changed after their last email', talks: fresh } : { ok: false, why: 'Already had a decision email' };
      }
      return { ok: true, talks: approved };
    }
    if (t.rule === 'decline') {
      if (d !== 'declined') return { ok: false, why: d === 'approved' ? 'Has an approved talk' : 'Still pending or maybe' };
      if (decisionSent(g.key)) return { ok: false, why: 'Already had a decision email' };
      return { ok: true, talks: g.talks };
    }
    if (t.rule === 'approved') {
      if (!approved.length) return { ok: false, why: 'No approved talk' };
      if (sentOf(g.key).some((e) => e.template === t.id)) return { ok: false, already: true, why: 'Already got this' };
      return { ok: true, talks: approved };
    }
    return { ok: true, talks: g.talks };
  }

  function values(g, talks) {
    const v = { firstName: g.sp.first, lastName: g.sp.last, fullName: speakerName(g.sp), talkCount: String(talks.length), talkTitles: talks.map((x) => `• ${x.title}`).join('\n'),
      coSpeakerNames: talks.map((x) => x.coSpeaker && `${x.coSpeaker.first} ${x.coSpeaker.last}`).filter(Boolean).join(', ') };
    for (const f of event) v[f.key] = f.value;
    return v;
  }
  const SPEAKER_FILLS = ['firstName', 'lastName', 'fullName', 'talkTitles', 'talkCount', 'coSpeakerNames'];
  const known = () => new Set([...SPEAKER_FILLS, ...event.map((f) => f.key)]);
  const fillsIn = (s) => [...new Set([...s.matchAll(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g)].map((m) => m[1]))];

  // Rendered as HTML with the filled-in parts marked, so the preview shows where each value came from.
  function render(text, v) {
    const k = known();
    return esc(text).replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (all, name) => {
      if (!k.has(name)) return `<span class="fill bad" title="Unknown fill-in">${all}</span>`;
      if (!v[name]) return `<span class="fill bad" title="Empty for this speaker">${all}</span>`;
      return `<span class="fill">${esc(v[name])}</span>`;
    });
  }
  function problems(t, v) {
    const k = known();
    const used = fillsIn(t.subject + '\n' + t.body);
    return { unknown: used.filter((n) => !k.has(n)), empty: used.filter((n) => k.has(n) && !v[n]) };
  }

  function stateChip(e) {
    if (e.state === 'scheduled') return `<span class="mstate line">Scheduled ${esc(e.when)}</span>`;
    if (e.state === 'held') return '<span class="mstate warn">Held</span>';
    if (e.state === 'unknown') return '<span class="mstate warn">May have been sent</span>';
    if (e.state === 'manual') return '<span class="mstate">Sent outside</span>';
    if (e.bounced) return '<span class="mstate warn">Bounced</span>';
    if (e.replies) return `<span class="mstate strong">Replied (${e.replies})</span>`;
    return '<span class="mstate">Sent</span>';
  }

  const emailOf = (sp) => sp.email;
  const nameOf = (e) => e.template ? tmpl(e.template).name : e.subject;
// Priya's conversation: our acceptance, her reply, Omar's reply from the dashboard, her second reply with an attachment.
function fillFor(key) {
  const g = bySpeaker(key);
  const v = values(g, g.talks.filter((x) => x.status === 'approved').length ? g.talks.filter((x) => x.status === 'approved') : g.talks);
  return (s) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => v[k] ?? '');
}
function threadsFor(key) {
  const sp = bySpeaker(key).sp, fill = fillFor(key), accept = tmpl('acceptance');
  return {
  t1: [
    { ours: true, from: 'DevFest Istanbul', by: 'Duygu Aksoy', to: emailOf(sp), when: '18 Nov, 10:21', body: fill(accept.body) },
    { from: speakerName(sp), to: 'speakers@example.org', when: '18 Nov, 14:02', body: "Hi all,\n\nThank you, this made my week! Confirming I'll be there. I'll need the accommodation support I mentioned in the form; is there a hotel you usually recommend?\n\nBest,\nPriya",
      quoted: `On 18 Nov 2026, at 10:21, DevFest Istanbul <speakers@example.org> wrote:\n> Hi ${sp.first},\n> Great news: the team loved your proposal…` },
    { ours: true, from: 'DevFest Istanbul', by: 'Omar E.', to: emailOf(sp), when: '18 Nov, 16:45', body: `Hi ${sp.first},\n\nWonderful! We book rooms for speakers ourselves; send us your flight times and we'll take care of the rest.\n\nOmar` },
    { from: speakerName(sp), to: 'speakers@example.org', when: '19 Nov, 09:12', body: "Perfect, itinerary attached. Landing 10 Dec, 15:40 at IST.\n\nPriya", attachments: [['Itinerary.pdf', '182 KB']],
      quoted: 'On 18 Nov 2026, at 16:45, DevFest Istanbul wrote:\n> Wonderful! We book rooms for speakers ourselves…' },
  ],
  t2: [
    { ours: true, from: 'DevFest Istanbul', by: 'Duygu Aksoy', to: emailOf(sp), when: '18 Nov, 10:21', body: fill(accept.body) },
    { bounce: true, from: 'Mail Delivery Subsystem', when: '18 Nov, 10:22', body: `Your message wasn't delivered to ${emailOf(sp)} because the address couldn't be found.\n\n550 5.1.1 The email account that you tried to reach does not exist.` },
  ],
  t3: [
    { ours: true, from: 'DevFest Istanbul', by: 'Omar E.', to: emailOf(sp), when: '12 Nov, 17:40', body: fill(tmpl('decline').body) },
  ],
  t4: [
    { ours: true, from: 'DevFest Istanbul', by: 'Omar E.', to: emailOf(sp), when: '21 Nov, 12:00', body: fill(tmpl('presentation').body), attachments: [['DevFest-2026-slide-template.pptx', '4.2 MB']] },
  ],
  t5: [
    { ours: true, from: 'DevFest Istanbul', by: 'Duygu Aksoy', to: emailOf(sp), when: '20 Nov, 15:30', body: `Hi ${sp.first},\n\nWe're building the schedule. Would you prefer a morning or an afternoon slot?\n\nDuygu` },
    { from: speakerName(sp), to: 'speakers@example.org', when: '20 Nov, 16:48', body: 'Afternoon please, I fly in that morning.\n\nMert' },
    { team: true, from: 'Duygu Aksoy (from Gmail)', to: emailOf(sp), when: '20 Nov, 17:05', body: 'Thanks Mert, afternoon it is.' },
  ],
  };
}

function sheet(key, openThread, { admin = true, showQuoted = false } = {}) {
  const THREADS = threadsFor(key);
  if (!openThread || !THREADS[openThread]) return '';
  const g = bySpeaker(key), sp = g.sp, mine = emails.filter((x) => x.speaker === key);
  const e = mine.find((x) => x.thread === openThread);
  const msgs = THREADS[openThread].map((m) => {
    if (m.bounce) return `<article class="msg bounce"><div class="msg-h"><span class="avatar sm">!</span><div class="grow"><b>Not delivered</b><span class="to">${esc(m.from)} · ${esc(m.when)}</span></div></div><div class="msg-b">${esc(m.body)}</div></article>`;
    return `<article class="msg${m.ours || m.team ? ' ours' : ''}">
      <div class="msg-h"><span class="avatar sm">${m.ours || m.team ? 'DF' : initials(m.from)}</span><div class="grow"><b>${esc(m.ours ? `${m.from} (${m.by})` : m.from)}</b><span class="to">to ${esc(m.to)}</span></div><span class="muted" style="font-size:12px">${esc(m.when)}</span></div>
      <div class="msg-b">${esc(m.body)}</div>
      ${m.attachments ? `<div class="att-row">${m.attachments.map(([n, s]) => `<a class="att" href="#" onclick="return false">${I.download}${esc(n)} <span class="muted">${esc(s)}</span></a>`).join('')}</div>` : ''}
      ${m.quoted ? (showQuoted ? `<div class="quoted">${esc(m.quoted)}</div>` : '<button class="quoted-btn" data-quoted>Show quoted text</button>') : ''}
    </article>`;
  }).join('');
  return `<div class="scrim" data-close></div>
    <aside class="sheet" role="dialog" aria-modal="true" aria-label="Conversation">
      <header class="sheet-head"><div class="grow"><h2>${esc(e.template ? fillFor(key)(tmpl(e.template).subject) : e.subject)}</h2><p class="muted" style="font-size:13px;margin-top:2px">${esc(e.template ? nameOf(e) : 'Custom email')} · with ${esc(speakerName(sp))}</p></div>
        ${MAIL.stateChip(e)}<button class="icon-btn" style="margin-left:4px" data-close aria-label="Close">×</button></header>
      <div class="sheet-body">${msgs}</div>
      ${admin && !e.bounced ? `<form class="reply"><label class="vh" for="reply">Reply</label><textarea id="reply" placeholder="Reply to ${esc(sp.first)}"></textarea>
        <div class="row-end"><span class="hint">Sent from speakers@example.org in the same Gmail conversation</span><button class="btn primary sm" type="button">Send reply</button></div></form>` : ''}
    </aside>`;
}


  window.MAIL = { D, esc, I, initials, plural, statusPill, speakerName, mailShell, RULES, event, templates, speakers, decision, bySpeaker, emails, sentOf, tmpl, eligible, values, render, problems, fillsIn, known, SPEAKER_FILLS, stateChip, emailOf, nameOf, sheet, threadsFor };
})();
