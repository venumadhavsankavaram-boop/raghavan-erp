/* 83 — Help Centre
   One Help button for everyone (Parent, Teacher, Admin/Office). It opens step-by-step guides in English and Telugu that match
   the person's role, with search, a "Help with this page" jump, a short first-login tour, a printable guide, a "What's new"
   note and the school's office phone. Admin/Principal can hide built-in topics and add their own (Help > Edit help).
   Read-only for everyone else: it changes no school data. Settings live in kv key 'help-settings'.
   The guide text itself is in 82-help-content.js. In a demo install, a "Start here" guide for evaluating schools is added. */
(function () {
  'use strict';
  const C = window.HC_CONTENT; if (!C) return;
  const KEY = 'help-settings';
  try { OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; } catch (e) {}
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch (e) { return ''; } };
  const me = () => { try { return currentUser || null; } catch (e) { return null; } };
  const isMgr = () => role() === 'Admin' || role() === 'Principal';
  const audOf = () => { const r = role(); return (r === 'Student' || r === 'Parent') ? 'parent' : r === 'Teacher' ? 'teacher' : 'admin'; };
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const lang = () => { const h = LS.get('hcLang'); if (h === 'te' || h === 'en') return h; if (S.lang === 'te' || S.lang === 'en') return S.lang; try { if (typeof window.portalLang === 'function') return window.portalLang() === 'te' ? 'te' : 'en'; } catch (e) {} return LS.get('portalLang') === 'te' ? 'te' : 'en'; };
  const L = (en, te) => lang() === 'te' ? te : en;
  const pick = pair => pair ? (lang() === 'te' ? (pair[1] || pair[0]) : pair[0]) : '';
  const AUD_NAME = { parent: ['Parents', 'తల్లిదండ్రులు'], teacher: ['Teachers', 'టీచర్లు'], admin: ['Admin & Office', 'అడ్మిన్ & ఆఫీసు'], demo: ['Start here', 'ఇక్కడ మొదలు'] };

  /* ---------- settings (school-editable) ---------- */
  const blank = () => ({ phone: '', hours: '', lang: '', whatsNew: [], hidden: [], custom: [], tourOff: false, fab: 'full' });
  const clean = v => {
    const d = blank(); v = (v && typeof v === 'object') ? v : {};
    d.phone = String(v.phone || '').slice(0, 40); d.hours = String(v.hours || '').slice(0, 80); d.tourOff = v.tourOff === true; d.fab = (v.fab === 'small' || v.fab === 'off') ? v.fab : 'full'; d.lang = v.lang === 'te' ? 'te' : v.lang === 'en' ? 'en' : '';
    d.whatsNew = (Array.isArray(v.whatsNew) ? v.whatsNew : []).filter(x => x && (x.en || x.te)).slice(0, 30).map(x => ({ id: String(x.id || ''), at: String(x.at || ''), en: String(x.en || '').slice(0, 400), te: String(x.te || '').slice(0, 400) }));
    d.hidden = (Array.isArray(v.hidden) ? v.hidden : []).map(String).slice(0, 200);
    d.custom = (Array.isArray(v.custom) ? v.custom : []).filter(x => x && x.id && x.aud && (x.en || x.te)).slice(0, 80).map(x => ({
      id: String(x.id), aud: ['parent', 'teacher', 'admin'].includes(x.aud) ? x.aud : 'parent', ic: String(x.ic || '📘').slice(0, 4),
      en: String(x.en || '').slice(0, 120), te: String(x.te || '').slice(0, 120),
      stepsEn: (Array.isArray(x.stepsEn) ? x.stepsEn : []).map(s => String(s).slice(0, 500)).slice(0, 20), stepsTe: (Array.isArray(x.stepsTe) ? x.stepsTe : []).map(s => String(s).slice(0, 500)).slice(0, 20),
      tipEn: String(x.tipEn || '').slice(0, 400), tipTe: String(x.tipTe || '').slice(0, 400) }));
    return d;
  };
  let S = blank(), sAt = 0, demo = false, demoChecked = false;
  async function load(force) {
    if (!force && Date.now() - sAt < 60000) return S;
    sAt = Date.now();
    try { const r = await fetch('/api/kv/' + KEY, { credentials: 'include', headers: { 'x-background': '1' } }); if (r.ok) S = clean(await r.json()); } catch (e) {}
    if (!demoChecked) { demoChecked = true; try { const r = await fetch('/api/demo-info', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); demo = !!(j && j.demo); } } catch (e) {} }
    return S;
  }
  async function save(next) {
    const v = clean(next);
    if (typeof storageSet === 'function') await storageSet(KEY, v);
    else { const r = await fetch('/api/kv/' + KEY, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) }); if (!r.ok) throw new Error('Could not save'); }
    S = v; sAt = Date.now();
  }

  /* ---------- topics ---------- */
  function topicsFor(aud) {
    if (aud === 'demo') return C.demo.slice();
    const hid = new Set(S.hidden);
    const base = (C[aud] || []).filter(t => !hid.has(aud + ':' + t.id));
    const mine = S.custom.filter(c => c.aud === aud).map(c => ({
      id: c.id, ic: c.ic, t: [c.en || c.te, c.te || c.en], k: '', custom: true, tip: (c.tipEn || c.tipTe) ? [c.tipEn || c.tipTe, c.tipTe || c.tipEn] : null,
      s: (c.stepsEn.length ? c.stepsEn : c.stepsTe).map((_, i) => [c.stepsEn[i] || c.stepsTe[i] || '', c.stepsTe[i] || c.stepsEn[i] || ''])
    }));
    const tr = base.slice(); const last = tr.findIndex(t => t.id === 'trouble');
    if (last >= 0) tr.splice(last, 0, ...mine); else tr.push(...mine);
    return tr;
  }
  const audsAvailable = () => {
    const a = audOf(); let list = [a];
    if (isMgr() || demo) list = ['parent', 'teacher', 'admin'];
    if (demo) list.unshift('demo');
    return list;
  };

  /* ---------- "help with this page" ---------- */
  const CTX_PARENT = { fees: 'fees', marks: 'marks', syllabushw: 'homework', classinfo: 'timetable', onlineexam: 'onlineexam', material: 'material', contact: 'messages', notices: 'notices', notifications: 'updates', profile: 'profile', home: 'start' };
  const CTX_TEACHER = { attendance: 'attendance', exams: 'marks', syllabus: 'homework', material: 'material', examplans: 'examplans', onlineexams: 'onlineexam', timetable: 'timetable', result: 'results', inbox: 'inbox', myaccount: 'account', noticeboard: 'notices' };
  const CTX_ADMIN = { dashboard: 'first', insights: 'reports', admissions: 'students', managefee: 'fees', upiclaims: 'upi', accounting: 'accounting', attendance: 'attendance', exams: 'exams', result: 'exams', subjects: 'classwork', timetable: 'classwork', syllabus: 'classwork', promotransfer: 'yearend', promotions: 'yearend', staff: 'staff', schoolprofile: 'setup', classessetup: 'setup', academicyear: 'setup', feestructuresetup: 'setup', refundpolicy: 'fees', deleteditems: 'safety', usersroles: 'logins', studentparentlogins: 'logins', rolespermissions: 'logins', inventory: 'facilities', transport: 'facilities', library: 'facilities', hostel: 'facilities', announcements: 'comms', noticeboard: 'comms', inbox: 'comms', contactvendor: 'trouble', website: 'website', reports: 'reports' };
  function visibleViewId() {
    const v = Array.from(document.querySelectorAll('[id^="view-"]')).find(e => e.offsetParent !== null || (e.style && e.style.display && e.style.display !== 'none' && e.getClientRects().length));
    return v ? v.id.slice(5) : '';
  }
  function ctxTopic() {
    const a = audOf();
    try {
      if (a === 'parent') { const t = (typeof myProfileTab !== 'undefined') ? myProfileTab : 'home'; return CTX_PARENT[t] || 'start'; }
      const v = visibleViewId();
      if (a === 'teacher') return CTX_TEACHER[v] || 'start';
      if (v === 'staff' && (document.getElementById('prgBox') || /Month-end payroll/.test((document.getElementById('view-staff') || {}).textContent || ''))) return 'payroll';
      return CTX_ADMIN[v] || 'first';
    } catch (e) { return a === 'admin' ? 'first' : 'start'; }
  }

  /* ---------- styles ---------- */
  function css() {
    if ($('hcCss')) return;
    const s = document.createElement('style'); s.id = 'hcCss';
    s.textContent = `
      #hcFab,#hcFab *,.hc-sheet,.hc-sheet *,.hc-card,.hc-card *{font-family:'Poppins','Noto Sans Telugu','Nirmala UI','Gautami',system-ui,'Segoe UI',sans-serif;letter-spacing:normal;}
      #hcFab{position:fixed;right:14px;bottom:calc(16px + var(--demo-h,0px));z-index:950;display:none;align-items:center;gap:6px;background:#2f4fd8;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:700;font-size:.86rem;line-height:1;box-shadow:0 8px 22px rgba(30,50,140,.35);cursor:pointer;}
      #hcFab.on{display:inline-flex;} #hcFab.small{padding:11px;} #hcFab.small .t{display:none;} #hcFab.edge{right:0;padding:0;width:10px;height:58px;border-radius:10px 0 0 10px;opacity:.4;bottom:calc(40% + var(--demo-h,0px));} #hcFab.edge span{display:none !important;} body.pp-on #hcFab.edge,body.tp-on #hcFab.edge{bottom:calc(40% + var(--demo-h,0px));}
      .hc-fm{display:flex;gap:4px;align-items:center;font-size:.78rem;color:#556;} .hc-fm button.on{background:#2f4fd8;color:#fff;border-color:#2f4fd8;} #hcFab:hover{background:#243fb5;} #hcFab .dot{width:9px;height:9px;border-radius:50%;background:#ffb300;display:none;} #hcFab.new .dot{display:inline-block;}
      body.pp-on #hcFab,body.tp-on #hcFab{bottom:calc(86px + env(safe-area-inset-bottom) + var(--demo-h,0px));}
      @media (max-width:760px){#hcFab{padding:11px 14px;}}
      @media print{#hcFab,#hcOv,#hcTour{display:none !important;}}
      .hc-ov{position:fixed;inset:0;z-index:99990;background:rgba(20,16,50,.6);display:flex;align-items:flex-end;justify-content:center;}
      .hc-sheet{background:#f6f8fd;width:100%;max-width:760px;height:92vh;height:92dvh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;box-shadow:0 -20px 60px rgba(0,0,0,.35);overflow:hidden;font-family:inherit;color:#1c2540;}
      @media (min-width:900px){.hc-ov{align-items:center;} .hc-sheet{height:86vh;border-radius:20px;}}
      .hc-head{background:linear-gradient(120deg,#0f766e,#2f6fed 60%,#7b3fe4);color:#fff;padding:14px 16px 12px;}
      .hc-top{display:flex;align-items:center;gap:8px;} .hc-top h2{margin:0;font-size:1.15rem;flex:1;color:#fff;}
      .hc-btn{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:999px;padding:6px 12px;font-weight:600;font-size:.78rem;cursor:pointer;} .hc-btn:hover{background:rgba(255,255,255,.32);}
      .hc-search{width:100%;box-sizing:border-box;margin-top:10px;padding:11px 14px;border:0;border-radius:12px;font-size:.95rem;}
      .hc-tabs{display:flex;gap:6px;margin-top:10px;overflow-x:auto;} .hc-tabs button{flex:none;border:0;border-radius:999px;padding:6px 12px;font-weight:600;font-size:.8rem;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;} .hc-tabs button.on{background:#fff;color:#243fb5;}
      .hc-body{flex:1;overflow:auto;padding:14px 14px 20px;}
      .hc-new{background:#fff8e1;border:1px solid #ffe08a;border-radius:14px;padding:10px 12px;margin-bottom:12px;font-size:.88rem;} .hc-new b{color:#8a5a00;} .hc-new ul{margin:6px 0 0 18px;padding:0;} .hc-new small{color:#8a6d1f;}
      .hc-jump{display:flex;align-items:center;gap:8px;background:#e8f0ff;border:1px solid #c9d9ff;border-radius:14px;padding:10px 12px;margin-bottom:12px;font-size:.9rem;} .hc-jump button{margin-left:auto;border:0;background:#2f4fd8;color:#fff;border-radius:999px;padding:7px 14px;font-weight:700;font-size:.8rem;cursor:pointer;}
      .hc-t{background:#fff;border:1px solid #e3e9f6;border-radius:14px;margin-bottom:8px;overflow:hidden;} .hc-t summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:13px 14px;font-weight:700;font-size:.95rem;} .hc-t summary::-webkit-details-marker{display:none;}
      .hc-t summary .i{width:34px;height:34px;border-radius:10px;background:#eef3ff;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex:none;} .hc-t summary:after{content:"▾";margin-left:auto;color:#8a94b0;transition:transform .15s;} .hc-t[open] summary:after{transform:rotate(180deg);}
      .hc-t[open]{border-color:#9db6ff;box-shadow:0 6px 18px rgba(47,79,216,.10);}
      .hc-st{padding:0 14px 14px 14px;} .hc-st ol{margin:0;padding:0 0 0 20px;} .hc-st li{margin:0 0 9px;font-size:.92rem;line-height:1.55;} .hc-st li::marker{font-weight:800;color:#2f4fd8;}
      .hc-tip{margin-top:6px;background:#effaf3;border:1px solid #bfe6cd;border-radius:10px;padding:8px 10px;font-size:.86rem;line-height:1.5;color:#1d5a36;}
      .hc-cu{font-size:.7rem;font-weight:600;background:#fff1d6;color:#8a5a00;border-radius:999px;padding:2px 8px;margin-left:6px;}
      .hc-none{text-align:center;color:#667;padding:30px 10px;font-size:.95rem;}
      .hc-foot{border-top:1px solid #dfe6f5;background:#fff;padding:8px 12px calc(8px + env(safe-area-inset-bottom));display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:.86rem;}
      .hc-foot a.call{background:#1b7f4b;color:#fff;text-decoration:none;border-radius:999px;padding:8px 14px;font-weight:700;} .hc-foot .sp{flex:1;} .hc-foot button{border:1px solid #cfd8ee;background:#fff;color:#243fb5;border-radius:999px;padding:6px 10px;font-weight:600;font-size:.78rem;font-family:inherit;cursor:pointer;}
      .hc-ed h3{margin:16px 0 6px;font-size:1rem;color:#14325c;} .hc-ed label{display:block;font-size:.78rem;color:#667;margin:8px 0 3px;}
      .hc-ed input,.hc-ed textarea,.hc-ed select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #cfd6e6;border-radius:10px;font-size:.9rem;background:#fff;} .hc-ed textarea{min-height:84px;}
      .hc-ed .row{display:flex;gap:8px;} .hc-ed .row>*{flex:1;} .hc-ed .card{background:#fff;border:1px solid #e3e9f6;border-radius:12px;padding:10px 12px;margin:8px 0;}
      .hc-ed .b{border:0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:.85rem;cursor:pointer;background:#2f4fd8;color:#fff;} .hc-ed .b.g{background:#eef2fb;color:#243fb5;} .hc-ed .b.r{background:#fde8e8;color:#b3261e;}
      .hc-ed .chk{display:flex;gap:8px;align-items:center;font-size:.88rem;margin:4px 0;} .hc-ed .chk input{width:auto;}
      .hc-msg{font-size:.85rem;margin:8px 0;color:#1b7f4b;font-weight:700;}
      .hc-tour{position:fixed;inset:0;z-index:99991;background:rgba(20,16,50,.65);display:flex;align-items:center;justify-content:center;padding:16px;}
      .hc-card{background:#fff;border-radius:22px;max-width:380px;width:100%;padding:24px 22px 18px;box-shadow:0 30px 80px -20px rgba(0,0,0,.55);text-align:center;font-family:inherit;color:#1c2540;}
      .hc-card .big{font-size:2.6rem;line-height:1;} .hc-card h3{margin:10px 0 6px;font-size:1.2rem;color:#14325c;} .hc-card p{margin:0 0 14px;font-size:.95rem;line-height:1.55;color:#4a5570;}
      .hc-dots{display:flex;justify-content:center;gap:6px;margin:6px 0 14px;} .hc-dots i{width:8px;height:8px;border-radius:50%;background:#d5dcef;} .hc-dots i.on{background:#2f4fd8;width:22px;border-radius:6px;}
      .hc-card .acts{display:flex;gap:8px;justify-content:space-between;align-items:center;} .hc-card .acts .skip{background:none;border:0;color:#667;font-weight:600;font-size:.85rem;cursor:pointer;padding:8px;}
      .hc-card .acts .go{background:#2f4fd8;color:#fff;border:0;border-radius:999px;padding:11px 22px;font-weight:700;font-size:.92rem;cursor:pointer;}
    `;
    document.head.appendChild(s);
  }

  /* ---------- the Help sheet ---------- */
  let st = { aud: 'parent', q: '', open: null, mode: 'help', draft: null, msg: '' };
  const norm = s => String(s || '').toLowerCase();
  function matches(t, q) {
    if (!q) return true; const words = norm(q).split(/\s+/).filter(Boolean);
    const hay = norm([t.t[0], t.t[1], t.k, ...t.s.map(x => x[0] + ' ' + x[1]), t.tip ? t.tip[0] + ' ' + t.tip[1] : ''].join(' '));
    return words.every(w => hay.includes(w));
  }
  function whatsNewHtml() {
    const items = S.whatsNew.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 4);
    if (!items.length) return '';
    return `<div class="hc-new"><b>🆕 ${esc(L("What's new", 'కొత్త సమాచారం'))}</b><ul>${items.map(i => `<li>${esc(pick([i.en || i.te, i.te || i.en]))} <small>${esc(i.at ? new Date(i.at).toLocaleDateString(lang() === 'te' ? 'te-IN' : 'en-IN', { day: 'numeric', month: 'short' }) : '')}</small></li>`).join('')}</ul></div>`;
  }
  function topicHtml(t, open) {
    return `<details class="hc-t" id="hct-${esc(t.id)}"${open ? ' open' : ''}><summary><span class="i">${esc(t.ic)}</span><span>${esc(pick(t.t))}${t.custom ? `<span class="hc-cu">${esc(L('School', 'పాఠశాల'))}</span>` : ''}</span></summary><div class="hc-st"><ol>${t.s.map(x => `<li>${esc(pick(x))}</li>`).join('')}</ol>${t.tip ? `<div class="hc-tip">💡 ${esc(pick(t.tip))}</div>` : ''}</div></details>`;
  }
  function bodyHtml() {
    const list = topicsFor(st.aud).filter(t => matches(t, st.q));
    const ctx = (!st.q && st.aud === audOf()) ? ctxTopic() : null;
    const ctxT = ctx ? list.find(t => t.id === ctx) : null;
    const jump = ctxT && st.open !== ctxT.id ? `<div class="hc-jump"><span>📍 ${esc(L('Help for this page:', 'ఈ పేజీకి సహాయం:'))} <b>${esc(pick(ctxT.t))}</b></span><button type="button" data-open="${esc(ctxT.id)}">${esc(L('Show', 'చూపించు'))}</button></div>` : '';
    return (st.q ? '' : whatsNewHtml()) + jump + (list.length ? list.map(t => topicHtml(t, st.open === t.id)).join('') : `<div class="hc-none">🔍 ${esc(L('Nothing found. Try another word, or ask the school office.', 'ఏమీ కనిపించలేదు. వేరే పదంతో వెతకండి, లేదా పాఠశాల ఆఫీసులో అడగండి.'))}</div>`);
  }
  function render() {
    const ov = $('hcOv'); if (!ov) return;
    if (st.mode === 'edit' && isMgr()) { ov.innerHTML = editHtml(); return; }
    const auds = audsAvailable(); if (!auds.includes(st.aud)) st.aud = auds[0];
    const tabs = auds.length > 1 ? `<div class="hc-tabs">${auds.map(a => `<button type="button" class="${a === st.aud ? 'on' : ''}" data-aud="${a}">${esc(pick(AUD_NAME[a]))}</button>`).join('')}</div>` : '';
    const phone = S.phone ? `<a class="call" href="tel:${esc(S.phone.replace(/[^0-9+]/g, ''))}">📞 ${esc(L('Call the school office', 'పాఠశాల ఆఫీసుకు ఫోన్ చేయండి'))}: ${esc(S.phone)}</a>${S.hours ? `<span>${esc(S.hours)}</span>` : ''}` : `<span>${esc(L('Need more help? Ask the school office.', 'ఇంకా సహాయం కావాలా? పాఠశాల ఆఫీసులో అడగండి.'))}</span>`;
    ov.innerHTML = `<div class="hc-sheet" role="dialog" aria-modal="true" aria-label="Help">
      <div class="hc-head"><div class="hc-top"><h2>❓ ${esc(L('Help', 'సహాయం'))}</h2><button type="button" class="hc-btn" id="hcLang">🌐 ${lang() === 'te' ? 'English' : 'తెలుగు'}</button><button type="button" class="hc-btn" id="hcClose" aria-label="Close">✕</button></div>
      <input class="hc-search" id="hcQ" type="search" placeholder="${esc(L('Search: for example "pay fees"', 'వెతకండి, ఉదా. "ఫీజు"'))}" value="${esc(st.q)}" autocomplete="off">${tabs}</div>
      <div class="hc-body" id="hcBody">${bodyHtml()}</div>
      <div class="hc-foot">${phone}<span class="sp"></span><span class="hc-fm">${esc(L('Help button', 'సహాయం బటన్'))}: ${[['full', L('Show', 'చూపు')], ['small', L('Small', 'చిన్నది')], ['off', L('Hide', 'దాచు')]].map(x => `<button type="button" data-fm="${x[0]}" class="${fabMode() === x[0] ? 'on' : ''}">${esc(x[1])}</button>`).join('')}</span><button type="button" id="hcTourBtn">▶ ${esc(L('Take the tour', 'ఎలా వాడాలో చూడండి'))}</button><button type="button" id="hcPrint">🖨 ${esc(L('Print guide', 'ప్రింట్ తీసుకోండి'))}</button>${isMgr() ? `<button type="button" id="hcEdit">✏️ ${esc(L('Edit help', 'సహాయం మార్చండి'))}</button>` : ''}</div></div>`;
  }

  /* ---------- editor (Admin / Principal) ---------- */
  function editHtml() {
    const D = st.draft; const a = st.edAud || 'parent';
    const hideList = (C[a] || []).map(t => `<div class="chk"><label class="chk" style="flex:1;margin:0"><input type="checkbox" data-hide="${a}:${esc(t.id)}" ${D.hidden.includes(a + ':' + t.id) ? 'checked' : ''}> ${esc(t.ic)} ${esc(t.t[0])}</label><button type="button" class="b g" style="padding:4px 10px" data-copy="${a}:${esc(t.id)}">Edit wording</button></div>`).join('');
    const mine = D.custom.map(c => `<div class="card"><b>${esc(c.ic)} ${esc(c.en || c.te)}</b> <small>(${esc(AUD_NAME[c.aud][0])})</small><div style="margin-top:6px"><button type="button" class="b g" data-cedit="${esc(c.id)}">Edit</button> <button type="button" class="b r" data-cdel="${esc(c.id)}">Delete</button></div></div>`).join('') || '<div style="color:#667;font-size:.88rem">No topics of your own yet.</div>';
    const f = st.form || null;
    const form = f ? `<div class="card"><label>Shown to</label><select id="hcfAud">${['parent', 'teacher', 'admin'].map(x => `<option value="${x}" ${f.aud === x ? 'selected' : ''}>${esc(AUD_NAME[x][0])}</option>`).join('')}</select>
      <div class="row"><div><label>Icon (one emoji)</label><input id="hcfIc" maxlength="4" value="${esc(f.ic)}"></div><div></div></div>
      <div class="row"><div><label>Title (English)</label><input id="hcfEn" maxlength="120" value="${esc(f.en)}"></div><div><label>Title (Telugu)</label><input id="hcfTe" maxlength="120" value="${esc(f.te)}"></div></div>
      <div class="row"><div><label>Steps, English (one per line)</label><textarea id="hcfSEn">${esc(f.stepsEn.join('\n'))}</textarea></div><div><label>Steps, Telugu (same order)</label><textarea id="hcfSTe">${esc(f.stepsTe.join('\n'))}</textarea></div></div>
      <div class="row"><div><label>Tip, English (optional)</label><input id="hcfTEn" maxlength="400" value="${esc(f.tipEn)}"></div><div><label>Tip, Telugu (optional)</label><input id="hcfTTe" maxlength="400" value="${esc(f.tipTe)}"></div></div>
      <div style="margin-top:10px"><button type="button" class="b" id="hcfOk">Add to my topics</button> <button type="button" class="b g" id="hcfNo">Cancel</button></div></div>` : `<button type="button" class="b g" id="hcfNew">+ Add my own topic</button>`;
    return `<div class="hc-sheet hc-ed" role="dialog" aria-modal="true"><div class="hc-head"><div class="hc-top"><h2>✏️ Edit help</h2><button type="button" class="hc-btn" id="hcBack">← Back to Help</button><button type="button" class="hc-btn" id="hcClose" aria-label="Close">✕</button></div></div>
      <div class="hc-body">
        <h3>School contact</h3><div class="row"><div><label>Help language when someone has not chosen one</label><select id="hcLangDef"><option value="" ${D.lang === '' ? 'selected' : ''}>Follow the app language</option><option value="te" ${D.lang === 'te' ? 'selected' : ''}>తెలుగు (Telugu)</option><option value="en" ${D.lang === 'en' ? 'selected' : ''}>English</option></select></div><div></div></div>
        <div class="row"><div><label>Office phone</label><input id="hcPhone" maxlength="40" value="${esc(D.phone)}" placeholder="e.g. 9701424177"></div><div><label>Office hours</label><input id="hcHours" maxlength="80" value="${esc(D.hours)}" placeholder="e.g. Mon–Sat, 9 am to 4 pm"></div></div>
        <h3>What's new</h3><div style="font-size:.85rem;color:#667">Short notes parents and staff see at the top of Help, for example "Pay fees by UPI is now available".</div>
        ${D.whatsNew.map(w => `<div class="card"><div>${esc(w.en || w.te)}</div><small>${esc(w.at ? w.at.slice(0, 10) : '')}</small> <button type="button" class="b r" data-wdel="${esc(w.id)}" style="padding:4px 10px">Remove</button></div>`).join('')}
        <div class="row"><div><label>Note (English)</label><input id="hcWEn" maxlength="400"></div><div><label>Note (Telugu)</label><input id="hcWTe" maxlength="400"></div></div><div style="margin-top:8px"><button type="button" class="b g" id="hcWAdd">+ Add note</button></div>
        <h3>My own topics</h3>${mine}${form}
        <h3>Hide built-in topics</h3><div class="row"><select id="hcEdAud">${['parent', 'teacher', 'admin'].map(x => `<option value="${x}" ${a === x ? 'selected' : ''}>${esc(AUD_NAME[x][0])}</option>`).join('')}</select><div></div></div>${hideList}
        <h3>Help button</h3><div class="row"><div><label>Floating Help button for everyone (each person can still change it for themselves)</label><select id="hcFabDef"><option value="full" ${D.fab === 'full' ? 'selected' : ''}>Show with the word Help</option><option value="small" ${D.fab === 'small' ? 'selected' : ''}>Small round button only</option><option value="off" ${D.fab === 'off' ? 'selected' : ''}>Hidden (a thin tab on the screen edge)</option></select></div><div></div></div>
        <h3>First-login tour</h3><label class="chk"><input type="checkbox" id="hcTourOff" ${D.tourOff ? 'checked' : ''}> Do not show the welcome tour to new users</label>
        <div class="hc-msg" id="hcSaveMsg">${esc(st.msg)}</div><button type="button" class="b" id="hcSave">Save changes</button>
      </div></div>`;
  }
  function copyOf(key) {
    const [a, id] = String(key).split(':'); const t = (C[a] || []).find(x => x.id === id); if (!t) return null;
    return { id: '', aud: a, ic: t.ic, en: t.t[0], te: t.t[1], stepsEn: t.s.map(x => x[0]), stepsTe: t.s.map(x => x[1]), tipEn: t.tip ? t.tip[0] : '', tipTe: t.tip ? t.tip[1] : '' };
  }
  function readDraftFields() {
    const D = st.draft; if (!D) return;
    const v = id => { const e = $(id); return e ? e.value : null; };
    if (v('hcPhone') !== null) D.phone = v('hcPhone'); if (v('hcHours') !== null) D.hours = v('hcHours');
    const t = $('hcTourOff'); if (t) D.tourOff = t.checked; const ld = $('hcLangDef'); if (ld) D.lang = ld.value; const fd = $('hcFabDef'); if (fd) D.fab = fd.value;
    document.querySelectorAll('[data-hide]').forEach(cb => { const k = cb.dataset.hide; const i = D.hidden.indexOf(k); if (cb.checked && i < 0) D.hidden.push(k); if (!cb.checked && i >= 0) D.hidden.splice(i, 1); });
    if (st.form) { const f = st.form; if (v('hcfAud')) f.aud = v('hcfAud'); f.ic = v('hcfIc') || f.ic; f.en = v('hcfEn') || ''; f.te = v('hcfTe') || ''; f.stepsEn = (v('hcfSEn') || '').split('\n').map(s => s.trim()).filter(Boolean); f.stepsTe = (v('hcfSTe') || '').split('\n').map(s => s.trim()).filter(Boolean); f.tipEn = v('hcfTEn') || ''; f.tipTe = v('hcfTTe') || ''; }
  }

  /* ---------- print the whole guide ---------- */
  function printGuide() {
    const aud = st.aud; const list = topicsFor(aud); const te = lang() === 'te';
    const name = (document.title || 'School').replace(/^DEMO — /, '').replace(/ — ERP.*/, '');
    const body = list.map(t => `<section><h2>${esc(t.ic)} ${esc(pick(t.t))}</h2><ol>${t.s.map(x => `<li>${esc(pick(x))}</li>`).join('')}</ol>${t.tip ? `<p class="tip">💡 ${esc(pick(t.tip))}</p>` : ''}</section>`).join('');
    const foot = S.phone ? `<p class="call">📞 ${esc(L('School office', 'పాఠశాల ఆఫీసు'))}: <b>${esc(S.phone)}</b> ${esc(S.hours)}</p>` : '';
    const w = window.open('', '_blank'); if (!w) { try { if (typeof showToast === 'function') showToast('Allow pop-ups to print the guide.'); } catch (e) {} return; }
    w.document.write(`<!doctype html><html lang="${te ? 'te' : 'en'}"><head><meta charset="utf-8"><title>${esc(name)} — ${esc(pick(AUD_NAME[aud]))}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&display=swap"><style>
      body{font-family:'Noto Sans Telugu','Nirmala UI','Gautami',system-ui,'Segoe UI',sans-serif;max-width:760px;margin:24px auto;padding:0 18px;color:#1c2540;line-height:1.55} h1{font-size:1.4rem;margin:0 0 4px;color:#14325c} .sub{color:#667;margin:0 0 16px}
      section{break-inside:avoid;margin:0 0 14px;padding:10px 14px;border:1px solid #dfe6f5;border-radius:10px} h2{font-size:1.05rem;margin:0 0 6px;color:#243fb5} ol{margin:0;padding-left:20px} li{margin:0 0 4px;font-size:.93rem} .tip{margin:6px 0 0;font-size:.88rem;color:#1d5a36} .call{margin-top:16px;font-size:1rem}
      @media print{body{margin:0}}</style></head><body><h1>${esc(name)}</h1><p class="sub">${esc(pick(AUD_NAME[aud]))} · ${esc(L('User guide', 'ఎలా వాడాలి (గైడ్)'))}</p>${body}${foot}<script>window.onload=function(){var go=function(){setTimeout(function(){window.print()},200)};if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go)}else{go()}}<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- open / close ---------- */
  async function openHelp(topicId) {
    css(); await load(false);
    st = { aud: audOf(), q: '', open: null, mode: 'help', draft: null, msg: '' };
    if (!audsAvailable().includes(st.aud)) st.aud = audsAvailable()[0];
    if (topicId === true) topicId = ctxTopic();
    if (topicId && topicsFor(st.aud).some(t => t.id === topicId)) st.open = topicId;
    let ov = $('hcOv'); if (!ov) { ov = document.createElement('div'); ov.id = 'hcOv'; ov.className = 'hc-ov'; document.body.appendChild(ov); }
    ov.style.display = 'flex'; render(); LS.set('hcSeenNew:' + uid(), String(S.whatsNew.map(w => w.id).join(',')));
    updateFab();
    if (st.open) setTimeout(() => { const el = $('hct-' + st.open); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }, 60);
  }
  function closeHelp() { const ov = $('hcOv'); if (ov) ov.remove(); }
  window.openHelp = openHelp;

  document.addEventListener('click', e => {
    const ov = $('hcOv'); if (!ov) return;
    if (e.target === ov) { closeHelp(); return; }
    if (!ov.contains(e.target)) return;
    const b = e.target.closest('button,a,input,summary'); if (!b) return;
    const id = b.id;
    if (id === 'hcClose') closeHelp();
    else if (id === 'hcLang') { LS.set('hcLang', lang() === 'te' ? 'en' : 'te'); render(); }
    else if (id === 'hcTourBtn') { closeHelp(); startTour(true); }
    else if (b.dataset.fm) { LS.set('hcFab:' + uid(), b.dataset.fm); updateFab(); render(); }
    else if (id === 'hcPrint') printGuide();
    else if (id === 'hcEdit') { st.draft = JSON.parse(JSON.stringify(S)); st.mode = 'edit'; st.msg = ''; st.form = null; st.edAud = 'parent'; render(); }
    else if (id === 'hcBack') { readDraftFields(); st.mode = 'help'; render(); }
    else if (b.dataset.aud) { st.aud = b.dataset.aud; st.open = null; render(); }
    else if (b.dataset.open) { st.open = b.dataset.open; render(); setTimeout(() => { const el = $('hct-' + st.open); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }, 40); }
    else if (id === 'hcfNew') { readDraftFields(); st.form = { id: '', aud: 'parent', ic: '📘', en: '', te: '', stepsEn: [], stepsTe: [], tipEn: '', tipTe: '' }; st.copyOf = null; render(); const fe = $('hcfEn'); if (fe && fe.scrollIntoView) fe.scrollIntoView({ block: 'center' }); }
    else if (id === 'hcfNo') { st.form = null; st.copyOf = null; st.msg = ''; render(); }
    else if (id === 'hcfOk') {
      readDraftFields(); const f = st.form;
      if (!f.en && !f.te) { st.msg = 'Please write a title.'; render(); return; }
      if (!f.stepsEn.length && !f.stepsTe.length) { st.msg = 'Please write at least one step.'; render(); return; }
      if (!f.id) f.id = 'c' + Date.now().toString(36);
      const i = st.draft.custom.findIndex(c => c.id === f.id); if (i >= 0) st.draft.custom[i] = f; else st.draft.custom.push(f);
      if (st.copyOf && !st.draft.hidden.includes(st.copyOf)) st.draft.hidden.push(st.copyOf); st.copyOf = null;
      st.form = null; st.msg = ''; render();
    }
    else if (b.dataset.copy) {
      readDraftFields(); const f = copyOf(b.dataset.copy); if (f) { st.form = f; st.copyOf = b.dataset.copy; st.msg = 'This is a copy of the built-in topic. Change the wording, then press "Add to my topics". The original will be hidden.'; render(); const fe = $('hcfEn'); if (fe && fe.scrollIntoView) fe.scrollIntoView({ block: 'center' }); }
    }
    else if (b.dataset.cedit) { readDraftFields(); const c = st.draft.custom.find(x => x.id === b.dataset.cedit); if (c) { st.form = JSON.parse(JSON.stringify(c)); render(); } }
    else if (b.dataset.cdel) { readDraftFields(); st.draft.custom = st.draft.custom.filter(c => c.id !== b.dataset.cdel); render(); }
    else if (id === 'hcWAdd') {
      readDraftFields(); const en = ($('hcWEn') || {}).value || '', te = ($('hcWTe') || {}).value || '';
      if (!en.trim() && !te.trim()) return;
      st.draft.whatsNew.unshift({ id: 'w' + Date.now().toString(36), at: new Date().toISOString(), en: en.trim(), te: te.trim() }); render();
    }
    else if (b.dataset.wdel) { readDraftFields(); st.draft.whatsNew = st.draft.whatsNew.filter(w => w.id !== b.dataset.wdel); render(); }
    else if (id === 'hcSave') {
      readDraftFields(); st.msg = 'Saving…'; render();
      save(st.draft).then(() => { st.msg = 'Saved ✓ Everyone sees this the next time they open Help.'; render(); updateFab(); }).catch(err => { st.msg = 'Could not save: ' + (err && err.message || 'try again'); render(); });
    }
  });
  document.addEventListener('change', e => {
    const ov = $('hcOv'); if (!ov || !ov.contains(e.target)) return;
    if (e.target.id === 'hcEdAud') { readDraftFields(); st.edAud = e.target.value; render(); }
  });
  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'hcQ') { st.q = e.target.value; st.open = null; const bd = $('hcBody'); if (bd) bd.innerHTML = bodyHtml(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('hcOv')) closeHelp(); const t = $('hcTour'); if (t) endTour(); } });

  /* ---------- first-login tour ---------- */
  let tourRun = null;
  const uid = () => { const u = me(); return u ? String(u.id || u.username || u.name || 'u') : 'u'; };
  const tourKey = () => 'hcTour:' + uid() + ':' + audOf() + (demo ? ':demo' : '');
  function tourCards() { const a = audOf(); return (demo ? C.tour.demo : []).concat(C.tour[a] || []); }
  function startTour(force) {
    const cards = tourCards(); if (!cards.length || $('hcTour')) return; css();
    tourRun = { i: 0, cards }; paintTour();
  }
  function paintTour() {
    let ov = $('hcTour'); if (!ov) { ov = document.createElement('div'); ov.id = 'hcTour'; ov.className = 'hc-tour'; document.body.appendChild(ov); }
    const { i, cards } = tourRun; const c = cards[i]; const last = i === cards.length - 1;
    ov.innerHTML = `<div class="hc-card" role="dialog" aria-modal="true"><div class="big">${esc(c[0])}</div><h3>${esc(pick(c[1]))}</h3><p>${esc(pick(c[2]))}</p>
      <div class="hc-dots">${cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="acts"><button type="button" class="skip" id="hcTSkip">${esc(L('Skip', 'వద్దు'))}</button><button type="button" class="skip" id="hcTLang">🌐 ${lang() === 'te' ? 'English' : 'తెలుగు'}</button><button type="button" class="go" id="hcTNext">${esc(last ? L('Got it', 'సరే') : L('Next', 'తరువాత'))}</button></div></div>`;
  }
  function endTour() { const o = $('hcTour'); if (o) o.remove(); LS.set(tourKey(), '1'); tourRun = null; }
  document.addEventListener('click', e => {
    const o = $('hcTour'); if (!o || !tourRun) return; const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'hcTSkip') endTour();
    else if (b.id === 'hcTLang') { LS.set('hcLang', lang() === 'te' ? 'en' : 'te'); paintTour(); }
    else if (b.id === 'hcTNext') { if (tourRun.i >= tourRun.cards.length - 1) endTour(); else { tourRun.i++; paintTour(); } }
  });

  /* ---------- the Help button ---------- */
  const appVisible = () => { const a = $('appShell'); return !!(a && a.style.display !== 'none' && a.offsetParent !== null); };
  function blocked() { return !!($('cnOverlay') || document.querySelector('.cn-ov,.sw-ov')); }
  const fabMode = () => { const m = LS.get('hcFab:' + uid()); return (m === 'full' || m === 'small' || m === 'off') ? m : (S.fab || 'full'); };
  function updateFab() {
    const show = !!me() && appVisible();
    let b = $('hcFab');
    if (!show) { if (b) b.classList.remove('on'); return; }
    css();
    if (!b) { b = document.createElement('button'); b.id = 'hcFab'; b.type = 'button'; b.setAttribute('aria-label', 'Help'); b.addEventListener('click', () => openHelp(true)); document.body.appendChild(b); }
    const seen = LS.get('hcSeenNew:' + uid()) || ''; const now = S.whatsNew.map(w => w.id).join(',');
    b.classList.toggle('new', !!now && now !== seen);
    const fm = fabMode(); b.classList.toggle('small', fm === 'small'); b.classList.toggle('edge', fm === 'off');
    b.setAttribute('aria-label', L('Help', 'సహాయం'));
    b.innerHTML = '<span>❓</span><span class="t">' + esc(L('Help', 'సహాయం')) + '</span><span class="dot"></span>';
    b.classList.add('on');
  }
  let lastUser = null, tourTried = false;
  async function tick() {
    const u = me();
    if (!u) { lastUser = null; tourTried = false; const b = $('hcFab'); if (b) b.classList.remove('on'); return; }
    if (lastUser !== uid()) { lastUser = uid(); tourTried = false; sAt = 0; }
    if (!appVisible()) return;
    await load(false); updateFab();
    if (!tourTried && !blocked() && !$('hcOv') && !$('hcTour')) {
      tourTried = true;
      if (!S.tourOff && !u.impersonating && LS.get(tourKey()) !== '1') setTimeout(() => { if (me() && !blocked() && !$('hcOv')) startTour(false); }, 1200);
    }
  }
  window.__hc = { copyOf, setLang(l) { S.lang = l; }, lang, topicsFor, clean, matches, ctxTopic, setState(v) { S = clean(v); }, CTX: { parent: CTX_PARENT, teacher: CTX_TEACHER, admin: CTX_ADMIN } };
  setInterval(tick, 1500); tick();
  window.addEventListener('storage', () => updateFab());
})();
