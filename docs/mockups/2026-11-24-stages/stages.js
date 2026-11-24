// Stages mockups: made-up stage list, per-speaker cells and the shell with the extra tab. Today is 2 Dec 2026.
(function () {
  const { esc, mailShell, templates, bySpeaker, speakerName, plural } = MAIL;
  const TODAY = '2026-12-02';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]}`; };

  // templateId null = the stage's template was deleted (past sends still count).
  const stages = [
    { id: 'acceptance', name: 'Acceptance', templateId: 'acceptance', dueFrom: '2026-11-01', appliesTo: 'everyone' },
    { id: 'presentation', name: 'Presentation request', templateId: 'presentation', dueFrom: '2026-11-25', appliesTo: 'everyone' },
    { id: 'event-info', name: 'Event info', templateId: 'event-info', dueFrom: '2026-12-01', appliesTo: 'everyone' },
    { id: 'day-before', name: 'Day before', templateId: 'day-before', dueFrom: '2026-12-11', appliesTo: 'everyone' },
    { id: 'visa', name: 'Visa letter', templateId: null, dueFrom: null, appliesTo: 'added' },
  ];

  // [speakerKey, noApprovedTalk?, cells by stage id]. Absent cell = no email yet (Missing / Due / blank by the stage rules).
  const rows = [
    ['mert', 0, { acceptance: ['sent', '4 Nov'], presentation: ['sent', '25 Nov'] }],
    ['burak', 0, { acceptance: ['bounced', '4 Nov'], presentation: ['sent', '26 Nov'], 'event-info': ['problem', 'Held'] }],
    ['priya', 0, { acceptance: ['replied', '4 Nov'], presentation: ['sent', '21 Nov'], 'event-info': ['scheduled', '2 Dec'] }],
    ['gizem', 0, { acceptance: ['sent', '4 Nov'], presentation: ['answer', '27 Nov'], visa: ['sent', '20 Nov'] }],
    ['ahmet', 0, { acceptance: ['manual', '3 Nov'], 'event-info': ['skipped'] }],
    ['nilay', 1, { acceptance: ['sent', '4 Nov'], presentation: ['skipped'], 'event-info': ['skipped'], 'day-before': ['skipped'] }],
    ['ayse', 0, { acceptance: ['sent', '4 Nov'], presentation: ['sent', '21 Nov'], 'event-info': ['sent', '1 Dec'] }],
    ['tolga', 0, { acceptance: ['sent', '4 Nov'] }],
  ];

  // The cell logic from the design, top first. Returns { k, d } with k one of the states below.
  function cell(s, raw) {
    if (raw) return { k: raw[0], d: raw[1] };
    if (s.appliesTo === 'added') return { k: 'blank' };
    if (!s.dueFrom) return { k: 'blank' };
    return s.dueFrom <= TODAY ? { k: 'missing' } : { k: 'due', d: fmt(s.dueFrom) };
  }
  const SENT = ['sent', 'manual', 'replied', 'answer'];
  const FOLLOW = ['bounced', 'problem', 'answer'];

  const grid = rows.map(([key, noApproved, cells]) => ({ key, noApproved, cells: Object.fromEntries(stages.map((s) => [s.id, cell(s, cells[s.id])])) }));
  const count = (s, f) => grid.filter((r) => f(r.cells[s.id].k)).length;
  const missingIn = (s) => count(s, (k) => k === 'missing');
  const hasMissing = (r) => stages.some((s) => r.cells[s.id].k === 'missing');
  const hasFollow = (r) => stages.some((s) => FOLLOW.includes(r.cells[s.id].k));

  function chip(c) {
    switch (c.k) {
      case 'sent': return `<span class="mstate">Sent ${esc(c.d)}</span>`;
      case 'manual': return `<span class="mstate">Marked sent ${esc(c.d)}</span>`;
      case 'replied': return '<span class="mstate strong">Replied</span>';
      case 'answer': return '<span class="mstate warn">Replied – needs an answer</span>';
      case 'bounced': return '<span class="mstate warn">Bounced</span>';
      case 'problem': return '<span class="mstate warn">Problem</span>';
      case 'scheduled': return `<span class="mstate line">Scheduled ${esc(c.d)}</span>`;
      case 'missing': return '<span class="mstate warn">Missing</span>';
      case 'due': return `<span class="faint">Due ${esc(c.d)}</span>`;
      case 'skipped': return '<span class="faint">Skipped</span>';
      default: return '<span class="vh">Not for this speaker</span>';
    }
  }

  // The shell with the Stages tab added after the existing three.
  function stagesShell(content, tab) {
    mailShell(content, null);
    const email = '../2026-11-23-email/';
    for (const a of document.querySelectorAll('.side a, .topbar a')) if (a.getAttribute('href') === 'emails.html') a.setAttribute('href', email + 'emails.html');
    const tabs = [['emails', email + 'emails.html', 'Conversations'], ['templates', email + 'templates.html', 'Templates'], ['event', email + 'event.html', 'Event settings'], ['stages', 'stages.html', 'Stages']];
    document.querySelector('.canvas').insertAdjacentHTML('afterbegin', `<nav class="subnav" aria-label="Emails">${tabs.map(([k, h, l]) => `<a href="${h}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`);
  }

  window.STAGES = { esc, plural, templates, bySpeaker, speakerName, TODAY, fmt, stages, grid, cell, chip, count, missingIn, hasMissing, hasFollow, SENT, FOLLOW, stagesShell };
})();
