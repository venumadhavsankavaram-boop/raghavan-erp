/* Student & Parent logins: printable FOLLOW-UP LIST (Admin / Principal).
   Lists the students whose parents still need a nudge - no login yet, login given but never signed in, not seen for N days,
   or signed in but the app / notifications are not set up - so the office can print it (or save it as PDF) or download it for
   Excel and hand it to the class teachers on paper. Class-wise pages (one page per class & section) or one combined list,
   with blank "Called / Remarks / Date" columns to fill by hand.
   Opens from: Find & log in as, Adoption & alerts, and the Health check. Read-only: it changes no data and never prints passwords. */
(function(){
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const num = v => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : 999; };
  const toast = m => { try{ showToast(m); }catch(e){} };
  const LABEL = { nologin: 'No login yet', never: 'Login given, never signed in', inactive: 'Not seen for a while', setup: 'Signed in, app / notifications not set up' };
  const SHORT = { nologin: 'No login', never: 'Never signed in', inactive: 'Inactive', setup: 'Not fully set up', ok: 'Active' };
  const F = { status: { nologin: true, never: true, inactive: false, setup: false }, cls: '', sec: '', layout: 'class', cols: true, days: 30, rows: [], loaded: false };
  let boxEl = null;

  function css(){
    if(document.getElementById('lfCss')) return;
    const s = document.createElement('style'); s.id = 'lfCss';
    s.textContent = `
      #lfBack{position:fixed;inset:0;background:rgba(20,30,60,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;}
      #lfBox{background:#fff;border-radius:18px;max-width:640px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.3);}
      #lfBox h3{margin:0 0 4px;font-size:1.15rem;color:#14325c;} #lfBox .lf-sub{font-size:.82rem;color:#5b6784;margin:0 0 14px;}
      #lfBox .lf-sec{margin:12px 0 6px;font-size:.7rem;font-weight:800;color:#5b6784;text-transform:uppercase;letter-spacing:.05em;}
      #lfBox .lf-row{display:flex;gap:10px;flex-wrap:wrap;} #lfBox select{height:40px;border:1.5px solid #cfd7e6;border-radius:10px;padding:0 10px;font-size:14px;background:#fff;}
      #lfBox label.lf-chk{display:flex;gap:8px;align-items:center;font-size:.88rem;color:#22304d;margin:5px 0;cursor:pointer;} #lfBox label.lf-chk input{width:auto;}
      #lfBox .lf-count{margin:14px 0 4px;padding:10px 14px;border-radius:12px;background:#eef1f8;font-size:.9rem;color:#14325c;font-weight:700;}
      #lfBox .lf-btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;} #lfBox .lf-b{border:1.5px solid #cfd7e6;background:#fff;border-radius:12px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;color:#33405c;}
      #lfBox .lf-b.pri{background:#2f3cc6;border-color:#2f3cc6;color:#fff;} #lfBox .lf-b:disabled{opacity:.5;cursor:not-allowed;}
    `;
    document.head.appendChild(s);
  }

  const activeStudents = () => (typeof students !== 'undefined' ? students : []).filter(s => typeof isActive === 'function' ? isActive(s) : true);
  const nm = s => ((s.lastName || '') + ' ' + (s.firstName || '')).trim();
  const phones = s => Array.from(new Set([s.fatherPhone, s.motherPhone, s.guardianPhone, s.phone].filter(Boolean))).join(', ');
  const parents = s => [s.fatherName, s.motherName].filter(Boolean).join(' / ') || s.guardianName || '';
  const fmt = iso => { if(!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

  function stageOf(r){
    if(!r.has) return 'nologin';
    if(!r.signed) return 'never';
    if(r.lastSeen && (Date.now() - new Date(r.lastSeen).getTime()) > F.days * 86400000) return 'inactive';
    if(!r.installed || !r.notif) return 'setup';
    return 'ok';
  }
  async function loadRows(){
    let map = new Map();
    try{
      const r = await fetch('/api/student-logins/adoption', { credentials: 'same-origin' });
      if(r.ok){ const j = await r.json(); (j.students || []).forEach(x => map.set(x.studentId, x)); F.loaded = true; }
    }catch(e){}
    F.rows = activeStudents().map(s => {
      const i = map.get(s.id) || {};
      return { s, name: nm(s), adm: s.admissionNo || '', cls: s.className || '', sec: s.section || '', parents: parents(s), phone: phones(s),
        username: i.username || '', has: !!i.hasLogin, signed: !!i.signedIn, installed: !!i.installed, notif: !!i.notifications,
        created: i.created || '', lastSeen: i.lastSeen || '' };
    });
  }
  const classList = () => Array.from(new Set(F.rows.map(r => r.cls).filter(Boolean))).sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b)));
  const secList = () => Array.from(new Set(F.rows.filter(r => !F.cls || r.cls === F.cls).map(r => r.sec).filter(Boolean))).sort();
  function chosen(){
    return F.rows.filter(r => (!F.cls || r.cls === F.cls) && (!F.sec || r.sec === F.sec) && F.status[stageOf(r)])
      .sort((a, b) => num(a.cls) - num(b.cls) || String(a.cls).localeCompare(String(b.cls)) || String(a.sec).localeCompare(String(b.sec)) || a.name.localeCompare(b.name));
  }
  const countOf = st => F.rows.filter(r => (!F.cls || r.cls === F.cls) && (!F.sec || r.sec === F.sec) && stageOf(r) === st).length;
  const sortByWhere = () => F.cls ? (F.cls + (F.sec ? ' – ' + F.sec : '')) : 'All classes';

  function paintBox(){
    if(!boxEl) return;
    const rows = chosen();
    const opt = (list, cur, first) => `<option value="">${first}</option>` + list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
    boxEl.innerHTML = `
      <h3>📞 Follow-up list — parents who need a nudge</h3>
      <p class="lf-sub">Print it (or save as PDF) or download it for Excel, and give it to the class teachers. Passwords are never printed.</p>
      <div class="lf-sec">Class</div>
      <div class="lf-row"><select onchange="lfSet('cls',this.value)">${opt(classList(), F.cls, 'All classes')}</select>
        <select onchange="lfSet('sec',this.value)">${opt(secList(), F.sec, 'All sections')}</select></div>
      <div class="lf-sec">Who to include</div>
      ${['nologin', 'never', 'inactive', 'setup'].map(k => `<label class="lf-chk"><input type="checkbox" ${F.status[k] ? 'checked' : ''} onchange="lfStatus('${k}',this.checked)"> ${esc(k === 'inactive' ? 'Signed in before, but not seen for ' + F.days + '+ days' : LABEL[k])} <b style="color:#14325c;">(${countOf(k)})</b></label>`).join('')}
      <div class="lf-sec">Layout</div>
      <label class="lf-chk"><input type="radio" name="lfLay" ${F.layout === 'class' ? 'checked' : ''} onchange="lfSet('layout','class')"> Class-wise: one page per class &amp; section (for class teachers)</label>
      <label class="lf-chk"><input type="radio" name="lfLay" ${F.layout === 'one' ? 'checked' : ''} onchange="lfSet('layout','one')"> One combined list</label>
      <label class="lf-chk"><input type="checkbox" ${F.cols ? 'checked' : ''} onchange="lfSet('cols',this.checked)"> Add blank columns to write by hand: Called ☐ · Remarks · Date</label>
      <div class="lf-count">${rows.length} student${rows.length === 1 ? '' : 's'} on this list — ${esc(sortByWhere())}</div>
      <div class="lf-btns">
        <button class="lf-b pri" ${rows.length ? '' : 'disabled'} onclick="lfPrint()">🖨️ Print / Save as PDF</button>
        <button class="lf-b" ${rows.length ? '' : 'disabled'} onclick="lfExcel()">⬇️ Download Excel</button>
        <button class="lf-b" onclick="lfClose()">Close</button>
      </div>`;
  }

  window.lfOpen = async function(opts){
    opts = opts || {};
    css();
    if(boxEl){ lfClose(); }
    const back = document.createElement('div'); back.id = 'lfBack';
    back.innerHTML = '<div id="lfBox"><p class="lf-sub">Loading…</p></div>';
    back.addEventListener('mousedown', e => { if(e.target === back) lfClose(); });
    document.body.appendChild(back); boxEl = back.querySelector('#lfBox');
    await loadRows();
    if(!F.loaded) toast('Could not read the latest login status. The list uses what this screen already has.');
    if(opts.cls !== undefined) F.cls = opts.cls || ''; if(opts.sec !== undefined) F.sec = opts.sec || '';
    if(opts.status){ Object.keys(F.status).forEach(k => { F.status[k] = opts.status.includes(k); }); }
    if(F.cls && !classList().includes(F.cls)) F.cls = '';
    paintBox();
  };
  window.lfClose = function(){ const b = document.getElementById('lfBack'); if(b) b.remove(); boxEl = null; };
  window.lfSet = function(k, v){ F[k] = v; if(k === 'cls' && F.sec && !secList().includes(F.sec)) F.sec = ''; paintBox(); };
  window.lfStatus = function(k, on){ F.status[k] = !!on; paintBox(); };

  function statusText(r){ return SHORT[stageOf(r)] + (r.has && r.lastSeen ? ' · last seen ' + fmt(r.lastSeen) : (r.has && r.created ? ' · login given ' + fmt(r.created) : '')); }
  function groups(rows){
    if(F.layout !== 'class') return [{ title: 'All students', rows }];
    const m = new Map(); rows.forEach(r => { const k = r.cls + (r.sec ? ' – ' + r.sec : ''); if(!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return Array.from(m.entries()).map(([title, rs]) => ({ title, rows: rs }));
  }
  function printHtml(){
    const rows = chosen();
    const school = (typeof schoolInfo !== 'undefined' && schoolInfo.name) ? schoolInfo.name : '';
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const sel = ['nologin', 'never', 'inactive', 'setup'].filter(k => F.status[k]).map(k => k === 'inactive' ? 'not seen for ' + F.days + '+ days' : LABEL[k].toLowerCase()).join('; ');
    const head = `<tr><th style="width:26px;">#</th><th>Student</th><th>Adm. No</th><th>Parent</th><th>Phone</th><th>Username</th><th>Status</th>${F.cols ? '<th style="width:48px;">Called ☐</th><th style="width:110px;">Remarks</th><th style="width:62px;">Date</th>' : ''}</tr>`;
    const body = groups(rows).map((g, gi) => `<div class="pg">
      <div class="hd"><b>${esc(school)}</b><br>Student &amp; Parent login follow-up — ${esc(g.title)}</div>
      <div class="meta">${g.rows.length} student(s) · ${esc(sel)} · printed ${esc(today)}</div>
      <table>${head}${g.rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b>${F.layout === 'class' ? '' : '<br><span class="m">' + esc(r.cls + (r.sec ? ' – ' + r.sec : '')) + '</span>'}</td><td>${esc(r.adm)}</td><td>${esc(r.parents)}</td><td>${esc(r.phone)}</td><td>${esc(r.username || '—')}</td><td>${esc(statusText(r))}</td>${F.cols ? '<td></td><td></td><td></td>' : ''}</tr>`).join('')}</table>
      <div class="sg"><span>Class Teacher</span><span>Principal / Correspondent</span></div></div>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Login follow-up</title><style>
      @page{size:A4 landscape;margin:10mm;} body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11px;}
      .pg{page-break-after:always;} .pg:last-child{page-break-after:auto;} .hd{text-align:center;font-size:14px;margin-bottom:4px;} .meta{text-align:center;color:#555;margin-bottom:8px;}
      table{width:100%;border-collapse:collapse;} th,td{border:1px solid #888;padding:4px 5px;text-align:left;vertical-align:top;} th{background:#e9edf6;} .m{color:#666;font-size:10px;}
      tr{page-break-inside:avoid;} .sg{display:flex;justify-content:space-between;margin-top:34px;font-size:11px;} .sg span{border-top:1px solid #555;padding-top:3px;min-width:180px;text-align:center;}
    </style></head><body>${body}</body></html>`;
  }
  window.lfPrint = function(){
    if(!chosen().length){ toast('Nobody is on this list.'); return; }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    f.onload = () => { try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Could not open the print window.'); } setTimeout(() => f.remove(), 180000); };
    f.srcdoc = printHtml();
  };
  window.lfExcel = function(){
    const rows = chosen(); if(!rows.length){ toast('Nobody is on this list.'); return; }
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['No', 'Class', 'Section', 'Student', 'Admission No', 'Parent', 'Phone', 'Username', 'Status', 'Login given on', 'Last seen'].concat(F.cols ? ['Called', 'Remarks', 'Date'] : []);
    const lines = [head.map(q).join(',')];
    let last = '', n = 0;
    rows.forEach(r => { const k = r.cls + '|' + r.sec; if(k !== last){ n = 0; last = k; } n++;
      lines.push([n, r.cls, r.sec, r.name, r.adm, r.parents, r.phone, r.username, SHORT[stageOf(r)], fmt(r.created), fmt(r.lastSeen)].concat(F.cols ? ['', '', ''] : []).map(q).join(',')); });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'login-follow-up-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();
