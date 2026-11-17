// Shared shell, icons and helpers for the mockups. Vanilla JS; state lives in the URL and sessionStorage.
(function () {
  const D = window.DATA;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const path = (d, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    list: path('<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.5" cy="4" r=".6" fill="currentColor"/><circle cx="2.5" cy="8" r=".6" fill="currentColor"/><circle cx="2.5" cy="12" r=".6" fill="currentColor"/>'),
    map: path('<circle cx="4" cy="5" r="1.6"/><circle cx="11" cy="4" r="1.6"/><circle cx="6.5" cy="11" r="1.6"/><circle cx="12" cy="11.5" r="1.6"/>'),
    bag: path('<rect x="2" y="5" width="12" height="8.5" rx="2"/><path d="M5.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5M2 9h12"/>'),
    team: path('<circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13.5c.5-2.4 2.1-3.5 4.2-3.5s3.7 1.1 4.2 3.5M10.5 3.4a2.2 2.2 0 0 1 0 4.2M12 10.2c1.1.5 1.8 1.6 2.1 3.3"/>'),
    upload: path('<path d="M8 10V2.5M5 5.5l3-3 3 3M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>'),
    out: path('<path d="M6 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2M10.5 11 13.5 8l-3-3M13.5 8H6"/>'),
    search: path('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>', 14),
    refresh: path('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"/>', 14),
    left: path('<path d="M10 3 5 8l5 5"/>', 14),
    right: path('<path d="m6 3 5 5-5 5"/>', 14),
    mail: path('<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="m2.5 4.5 5.5 4 5.5-4"/>'),
    phone: path('<path d="M4.5 2h2l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1v2a1.5 1.5 0 0 1-1.5 1.5A11.5 11.5 0 0 1 3 3.5 1.5 1.5 0 0 1 4.5 2Z"/>'),
    link: path('<path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8"/>'),
    menu: path('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>', 18),
    screen: path('<rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M8 11v2.5M5 13.5h6"/>', 14),
    download: path('<path d="M8 2.5V10M5 7l3 3 3-3M2.5 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>', 14),
    sort: path('<path d="M8 3v10M4.5 9.5 8 13l3.5-3.5"/>', 12),
  };

  const dots = '<span class="dots" aria-hidden="true"><i style="background:var(--pend)"></i><i style="background:var(--no)"></i><i style="background:var(--maybe)"></i><i style="background:var(--ok)"></i></span>';
  const initials = (name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  function shell(active, content) {
    // Projector view is remembered for the session and applies to every screen.
    document.documentElement.classList.toggle('projector', store.get('mock.projector', false));
    const me = D.me;
    const admin = me.role === 'admin';
    const waiting = D.team.filter((u) => u.role === 'waiting').length;
    const item = (id, href, icon, label, extra = '') =>
      `<a href="${href}"${active === id ? ' aria-current="page"' : ''}>${I[icon]}<span>${label}</span>${extra}</a>`;
    const nav = `
      ${item('list', 'index.html', 'list', 'Submissions')}
      ${item('map', 'map.html', 'map', 'Topic map')}
      ${item('logistics', 'logistics.html', 'bag', 'Logistics')}
      ${admin ? `<div class="group">Admin</div>
      ${item('team', 'team.html', 'team', 'Team', waiting ? `<span class="tag" style="margin-left:auto" aria-label="${waiting} waiting for approval">${waiting} waiting</span>` : '')}
      ${item('import', 'import.html', 'upload', 'Import')}` : ''}`;
    const mark = `<a class="mark" href="index.html">${dots}<span><b>DevFest Istanbul</b><span>Speakers 2026</span></span></a>`;
    document.body.innerHTML = `
      <div class="app">
        <aside class="side" aria-label="Main">
          ${mark}
          <nav class="nav">${nav}</nav>
          <span class="grow"></span>
          <div class="user"><span class="avatar">${initials(me.name)}</span><span><b>${esc(me.name)}</b><span>${admin ? 'Admin' : 'Member'}</span></span>
            <a class="icon-btn" href="signin.html" title="Sign out" aria-label="Sign out">${I.out}</a></div>
        </aside>
        <div>
          <header class="topbar">${mark}<button class="icon-btn" aria-label="Menu" onclick="document.querySelector('.side').style.display = document.querySelector('.side').style.display === 'flex' ? '' : 'flex'">${I.menu}</button></header>
          <main class="canvas">${content}</main>
        </div>
      </div>`;
  }

  // Mock persistence so a decision or score made on the talk page shows up in the list.
  const store = {
    get(k, fallback) { try { const v = sessionStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: in-memory only */ } },
  };
  const overrides = store.get('mock.overrides', {});
  for (const x of D.talks) {
    const o = overrides[x.id];
    if (!o) continue;
    if (o.status) x.status = o.status;
    if ('mine' in o) { if (o.mine === null) delete x.scores.omar; else x.scores.omar = o.mine; }
    if (o.comments) x.comments = x.comments.concat(o.comments);
  }
  const live = D.talks.filter((x) => !x.removed);
  D.counts = { all: live.length };
  for (const s of D.STATUSES) D.counts[s] = live.filter((x) => x.status === s).length;
  function save(id, patch) {
    const all = store.get('mock.overrides', {});
    all[id] = { ...(all[id] || {}), ...patch };
    store.set('mock.overrides', all);
  }

  function summary(talk, showAll) {
    const entries = Object.entries(talk.scores).map(([uid, value]) => ({ uid, value, name: D.team.find((u) => u.uid === uid)?.name ?? uid }));
    const mine = talk.scores[D.me.uid] ?? null;
    const values = entries.map((e) => e.value);
    const count = values.length;
    const revealed = count > 0 && (mine !== null || showAll);
    const avg = count ? values.reduce((a, b) => a + b, 0) / count : null;
    return { entries, mine, count, revealed, avg: avg === null ? null : avg.toFixed(1), min: count ? Math.min(...values) : null, max: count ? Math.max(...values) : null };
  }
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const statusPill = (s) => `<span class="status st-${s}">${D.LABEL[s]}</span>`;
  const speakerName = (sp) => `${sp.first} ${sp.last}`;
  const roleLine = (sp) => [sp.job, sp.company].filter(Boolean).join(', ');
  const otherTalks = (talk) => D.talks.filter((x) => !x.removed && x.speakerKey === talk.speakerKey && x.id !== talk.id);

  function readQuery() {
    const p = new URLSearchParams(location.search);
    return {
      status: D.STATUSES.includes(p.get('status')) ? p.get('status') : 'all',
      q: p.get('q') ?? '', topic: p.get('topic') ?? '', level: p.get('level') ?? '',
      sort: ['score', 'spread'].includes(p.get('sort')) ? p.get('sort') : 'date',
      removed: p.get('removed') === '1',
    };
  }
  function writeQuery(f) {
    const p = new URLSearchParams();
    if (f.status !== 'all') p.set('status', f.status);
    if (f.q) p.set('q', f.q);
    if (f.topic) p.set('topic', f.topic);
    if (f.level) p.set('level', f.level);
    if (f.sort !== 'date') p.set('sort', f.sort);
    if (f.removed) p.set('removed', '1');
    return p.toString();
  }
  const key = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
  function filtered(f, showAll, ignoreStatus = false) {
    const q = key(f.q.trim());
    const rows = D.talks.filter((x) => {
      if (x.removed && !f.removed) return false;
      if (!ignoreStatus && f.status !== 'all' && x.status !== f.status) return false;
      if (f.topic && x.topic !== f.topic) return false;
      if (f.level && x.level !== f.level) return false;
      if (!q) return true;
      const sp = x.speaker;
      return [x.title, sp.first, sp.last, sp.company, sp.email].some((v) => key(v).includes(q));
    });
    const metric = (x) => { const s = summary(x, showAll); if (!s.revealed) return null; return f.sort === 'score' ? Number(s.avg) : s.max - s.min; };
    const byDate = (a, b) => a.submitted.localeCompare(b.submitted) || Number(a.id) - Number(b.id);
    if (f.sort === 'date') return rows.sort(byDate);
    return rows.sort((a, b) => { const ma = metric(a), mb = metric(b); if (ma !== null && mb !== null) return mb - ma || byDate(a, b); if (ma !== null) return -1; if (mb !== null) return 1; return byDate(a, b); });
  }

  window.UI = { D, esc, I, dots, initials, shell, store, save, summary, plural, statusPill, speakerName, roleLine, otherTalks, readQuery, writeQuery, filtered };
})();
