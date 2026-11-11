/* Leave Statement: one page per staff member and salary month that explains every leave day —
   the date, the reason they gave, who approved it and when, and whether it was paid or loss of pay.
   Built to answer "why was my salary cut?" at salary time.
   Numbers are NOT recalculated here: the totals come from computeStaffPayroll(), the same function the payslip
   uses, so the statement can never disagree with the salary. Only the day-by-day list is assembled here. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fd = s => { if (!s) return '—'; const m = String(s).slice(0, 10).split('-').map(Number); return m[2] + ' ' + MON[m[1] - 1] + ' ' + m[0]; };
  const fdShort = s => { const m = String(s).slice(0, 10).split('-').map(Number); return m[2] + ' ' + MON[m[1] - 1]; };
  const dow = s => DAY[new Date(String(s).slice(0, 10) + 'T00:00:00Z').getUTCDay()];
  const r1 = n => Math.round((Number(n) || 0) * 10) / 10;
  const money = n => (typeof fmtMoney === 'function') ? fmtMoney(Number(n) || 0) : '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const dayWord = n => r1(n) + ' day' + (r1(n) === 1 ? '' : 's');
  const monthLabel = m => { const [y, mo] = String(m).split('-').map(Number); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mo - 1] + ' ' + y; };
  const nameOf = st => ((st.firstName || '') + ' ' + (st.lastName || '')).trim() || st.name || st.id;

  /* ---- leave applications (Admin/Principal see all; cached briefly) ---- */
  let reqCache = null, reqAt = 0;
  async function loadRequests(force) {
    if (!force && reqCache && Date.now() - reqAt < 60000) return reqCache;
    try {
      const res = await fetch('/api/staff-leave-requests', { credentials: 'same-origin' });
      if (res.ok) { reqCache = await res.json(); reqAt = Date.now(); }
    } catch (e) { /* keep whatever we had */ }
    return reqCache || [];
  }
  const reqDates = r => {
    if (r.session) return [String(r.fromDate).slice(0, 10)];
    const out = []; let cur = new Date(String(r.fromDate).slice(0, 10) + 'T00:00:00Z'); const end = new Date(String(r.toDate || r.fromDate).slice(0, 10) + 'T00:00:00Z'); let g = 0;
    while (cur <= end && g++ < 366) { out.push(cur.toISOString().slice(0, 10)); cur = new Date(cur.getTime() + 86400000); }
    return out;
  };

  /* ---- build the statement for one person and one salary month ---- */
  function build(staffId, monthStr, requests) {
    const st = (typeof staffList !== 'undefined' ? staffList : []).find(x => x.id === staffId);
    if (!st) return null;
    const pr = (typeof computeStaffPayroll === 'function') ? computeStaffPayroll(staffId, monthStr) : null;
    const per = (typeof payrollPeriod === 'function') ? payrollPeriod(monthStr) : { from: monthStr + '-01', to: monthStr + '-31' };
    const recs = (typeof staffAttendanceRecords !== 'undefined' ? staffAttendanceRecords : []).filter(r => r.staffId === staffId && r.date && r.date >= per.from && r.date <= per.to && (r.status === 'Leave' || r.status === 'Absent'));
    const byDate = {};
    recs.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
    const dates = Object.keys(byDate).sort();
    const expSessions = d => {
      try { if (typeof attIsSingleSession === 'function' && attIsSingleSession(d)) return 1; } catch (e) {}
      return (st.workSession === 'Morning' || st.workSession === 'Afternoon') ? 1 : 2;
    };
    const approved = (requests || []).filter(q => q.staffId === staffId && q.status === 'Approved');
    const rows = [];
    dates.forEach(d => {
      const list = byDate[d];
      const full = list.some(x => !x.session);
      const status = (list[list.length - 1] || {}).status;
      const sessions = full ? [] : list.map(x => x.session);
      const frac = full ? 1 : Math.min(1, list.length / expSessions(d));
      // The leave application behind this day, if there is one.
      let q = approved.find(a => reqDates(a).includes(d) && (!a.session || sessions.includes(a.session)));
      rows.push({
        date: d, status, days: frac,
        part: full || frac >= 1 ? 'Full day' : (sessions.join(' + ') || 'Half day') + ' only',
        applied: !!q, reason: q ? (q.reason || '') : '', appliedOn: q ? q.requestedAt : '', decidedBy: q ? q.decidedByName : '', decidedAt: q ? q.decidedAt : '', note: q ? q.decisionNote : '',
      });
    });
    // Which days count against the paid allowance? Work it out from the salary figures themselves.
    const sumAll = rows.reduce((n, x) => n + x.days, 0);
    const sumAbs = rows.filter(x => x.status === 'Absent').reduce((n, x) => n + x.days, 0);
    const counted = pr ? pr.leaveDays : sumAll;
    const absentOnly = pr && Math.abs(counted - sumAll) > 0.01 && Math.abs(counted - sumAbs) < 0.01;
    let paidLeft = pr ? Math.max(0, r1(counted - pr.lopDays)) : sumAll;
    rows.forEach(x => {
      if (absentOnly && x.status === 'Leave') { x.effect = 'Paid'; x.note2 = 'Leave days are not counted against pay in this school'; x.counted = false; return; }
      x.counted = true;
      const take = Math.min(paidLeft, x.days); paidLeft = Math.round((paidLeft - take) * 100) / 100;
      x.effect = take >= x.days - 0.001 ? 'Paid' : (take <= 0.001 ? 'Loss of pay' : 'Part paid');
      if (x.effect === 'Part paid') x.note2 = dayWord(take) + ' of ' + dayWord(x.days) + ' paid';
      x.paidPart = take;
    });
    return { st, month: monthStr, per, rows, pr, absentOnly, total: r1(sumAll) };
  }

  /* ---- leave year: month by month ---- */
  function yearRows(staffId, monthStr) {
    const S = (typeof window.payrollSettingsNow === 'function') ? window.payrollSettingsNow() : {};
    const startM = Number(S.leaveYearStart) >= 1 && Number(S.leaveYearStart) <= 12 ? Number(S.leaveYearStart) : 4;
    const [y, m] = monthStr.split('-').map(Number);
    let cy = m >= startM ? y : y - 1, cm = startM; const out = []; let g = 0;
    while ((cy < y || (cy === y && cm <= m)) && g++ < 12) {
      const ym = cy + '-' + String(cm).padStart(2, '0');
      let pr = null; try { pr = computeStaffPayroll(staffId, ym); } catch (e) {}
      if (pr) out.push({ ym, taken: r1(pr.leaveDays), quota: r1(pr.quota), lop: r1(pr.lopDays), cut: pr.lopDeduction });
      cm++; if (cm > 12) { cm = 1; cy++; }
    }
    return out;
  }

  /* ---- plain-language lines ---- */
  function explain(b) {
    const pr = b.pr; if (!pr) return '';
    if (!b.rows.length) return 'No leave or absence is marked in the staff register for this period, so nothing is deducted for leave.';
    const base = `Leave and absence in this period: ${dayWord(pr.leaveDays)}. Paid leave allowed: ${dayWord(pr.quota)}.`;
    if (pr.lopDays > 0) return `${base} The ${dayWord(pr.lopDays)} beyond the allowance are loss of pay, so ${money(pr.lopDeduction)} is deducted from the salary.`;
    return `${base} Everything is within the allowance, so nothing is deducted for leave.`;
  }
  function textCopy(b, yr) {
    const st = b.st, pr = b.pr; const L = [];
    L.push('Leave statement: ' + nameOf(st) + ' — ' + monthLabel(b.month));
    L.push('Pay period: ' + fd(b.per.from) + ' to ' + fd(b.per.to));
    L.push('');
    if (!b.rows.length) L.push('No leave or absence marked in this period.');
    b.rows.forEach(x => {
      L.push('• ' + fd(x.date) + ' (' + dow(x.date) + '), ' + x.part + ' — ' + (x.status === 'Absent' ? 'Absent' : 'Leave') + ' — ' + (x.reason ? 'Reason: ' + x.reason : (x.applied ? 'Applied' : 'Marked by the office, no application')) + (x.decidedBy ? ' — approved by ' + x.decidedBy + (x.decidedAt ? ' on ' + fd(x.decidedAt) : '') : '') + ' — ' + x.effect);
    });
    L.push('');
    L.push(explain(b));
    if (pr) L.push('Net salary for this month: ' + money(pr.netSalary));
    if (yr && yr.length > 1) { L.push(''); L.push('This leave year so far: ' + dayWord(yr.reduce((n, x) => n + x.taken, 0)) + ' taken, loss of pay ' + dayWord(yr.reduce((n, x) => n + x.lop, 0)) + '.'); }
    return L.join('\n');
  }

  /* ---- HTML for the statement (used on screen and in print) ---- */
  function bodyHtml(b, yr, forPrint) {
    const st = b.st, pr = b.pr;
    const eff = e => e === 'Paid' ? '<span class="ls-p ok">Paid</span>' : e === 'Loss of pay' ? '<span class="ls-p bad">Loss of pay</span>' : '<span class="ls-p mid">' + esc(e) + '</span>';
    const rowHtml = b.rows.map(x => {
      const how = x.applied ? 'Applied by the teacher' : (x.status === 'Absent' ? 'Marked absent by the office' : 'Marked as leave by the office');
      const who = x.decidedBy ? 'Approved by ' + esc(x.decidedBy) + (x.decidedAt ? ' on ' + esc(fd(x.decidedAt)) : '') : '';
      return `<tr><td><b>${esc(fd(x.date))}</b><div class="ls-sub">${esc(dow(x.date))}</div></td>
        <td>${esc(x.part)}<div class="ls-sub">${x.status === 'Absent' ? 'Absent' : 'Leave'} · ${esc(dayWord(x.days))}</div></td>
        <td>${x.reason ? esc(x.reason) : '<span class="ls-sub">' + (x.applied ? 'No reason written' : 'No application on file') + '</span>'}<div class="ls-sub">${esc(how)}${who ? ' · ' + who : ''}${x.appliedOn ? ' · applied ' + esc(fd(x.appliedOn)) : ''}</div>${x.note ? '<div class="ls-sub">Note: ' + esc(x.note) + '</div>' : ''}</td>
        <td>${eff(x.effect)}${x.note2 ? '<div class="ls-sub">' + esc(x.note2) + '</div>' : ''}</td></tr>`;
    }).join('');
    const sum = pr ? `<div class="ls-sum">
        <div><span>Leave and absence</span><b>${esc(dayWord(pr.leaveDays))}</b></div>
        <div><span>Paid leave allowed</span><b>${esc(dayWord(pr.quota))}</b></div>
        <div><span>Loss of pay</span><b>${esc(dayWord(pr.lopDays))}</b></div>
        <div><span>Deducted</span><b>${esc(money(pr.lopDeduction))}</b></div></div>` : '';
    const yrHtml = yr && yr.length ? `<h4>This leave year, month by month</h4><table class="ls-t"><thead><tr><th>Month</th><th>Leave taken</th><th>Paid allowance</th><th>Loss of pay</th><th>Deducted</th></tr></thead><tbody>${yr.map(x => `<tr${x.ym === b.month ? ' class="cur"' : ''}><td>${esc(monthLabel(x.ym))}</td><td>${esc(dayWord(x.taken))}</td><td>${esc(dayWord(x.quota))}</td><td>${x.lop > 0 ? '<b>' + esc(dayWord(x.lop)) + '</b>' : '—'}</td><td>${x.cut > 0 ? esc(money(x.cut)) : '—'}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td>${esc(dayWord(yr.reduce((n, x) => n + x.taken, 0)))}</td><td></td><td>${esc(dayWord(yr.reduce((n, x) => n + x.lop, 0)))}</td><td>${esc(money(yr.reduce((n, x) => n + x.cut, 0)))}</td></tr></tbody></table>` : '';
    return `<div class="ls-who"><div><b>${esc(nameOf(st))}</b><div class="ls-sub">${esc([st.designation, st.department].filter(Boolean).join(' · '))}${st.staffId ? ' · ID ' + esc(st.staffId) : ''}</div></div>
        <div style="text-align:right"><b>${esc(monthLabel(b.month))}</b><div class="ls-sub">Pay period ${esc(fd(b.per.from))} – ${esc(fd(b.per.to))}</div></div></div>
      ${sum}
      <div class="ls-say">${esc(explain(b))}</div>
      ${b.rows.length ? `<table class="ls-t"><thead><tr><th>Date</th><th>Day</th><th>Reason and approval</th><th>Salary</th></tr></thead><tbody>${rowHtml}</tbody></table>` : ''}
      ${yrHtml}
      <div class="ls-foot">This statement comes from the staff attendance register and the leave applications. The amounts are the same as on the payslip.${forPrint ? '' : ''}</div>`;
  }
  const CSS = `
    .ls-who{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
    .ls-sub{font-size:.76rem;color:#667;margin-top:2px}
    .ls-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
    .ls-sum div{border:1px solid #dfe6f5;border-radius:10px;padding:8px 10px;background:#f7f9ff}
    .ls-sum span{display:block;font-size:.72rem;color:#667}.ls-sum b{font-size:1.02rem}
    .ls-say{background:#fff8e1;border:1px solid #ffe08a;border-radius:10px;padding:9px 12px;margin:10px 0;font-size:.9rem;line-height:1.5}
    table.ls-t{width:100%;border-collapse:collapse;margin:8px 0;font-size:.86rem}
    table.ls-t th{text-align:left;background:#eef2fb;padding:7px 8px;font-size:.74rem;text-transform:uppercase;letter-spacing:.03em;color:#33415f}
    table.ls-t td{padding:7px 8px;border-bottom:1px solid #e8edf7;vertical-align:top}
    table.ls-t tr.cur td{background:#fff8e1}table.ls-t tr.tot td{font-weight:700;border-top:2px solid #333}
    .ls-p{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.76rem;font-weight:700}
    .ls-p.ok{background:#e3f6ea;color:#1b7f4b}.ls-p.bad{background:#fde8e8;color:#b3261e}.ls-p.mid{background:#fff1d6;color:#9a5b00}
    .ls-foot{font-size:.74rem;color:#667;margin-top:10px}
    h4{margin:16px 0 4px;font-size:.95rem}
    @media(max-width:640px){.ls-sum{grid-template-columns:repeat(2,1fr)}}`;

  /* ---- the window ---- */
  let cur = { staffId: '', month: '' };
  function ensureCss() {
    if (document.getElementById('lsCss')) return;
    const s = document.createElement('style'); s.id = 'lsCss';
    s.textContent = CSS + `
      #lsOv{position:fixed;inset:0;z-index:99990;background:rgba(20,16,50,.6);display:flex;align-items:center;justify-content:center;padding:14px}
      #lsOv .ls-box{background:#fff;border-radius:18px;max-width:860px;width:100%;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)}
      #lsOv .ls-top{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #e3e9f6;flex-wrap:wrap}
      #lsOv .ls-top h3{margin:0;font-size:1.05rem;flex:1}
      #lsOv .ls-top input{border:1px solid #cfd6e6;border-radius:8px;padding:6px 8px}
      #lsOv .ls-body{padding:12px 16px;overflow:auto}
      #lsOv .ls-act{display:flex;gap:8px;padding:10px 16px;border-top:1px solid #e3e9f6;flex-wrap:wrap;justify-content:flex-end}
      #lsOv button.b{border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;background:#2f4fd8;color:#fff}
      #lsOv button.g{background:#eef2fb;color:#243fb5}`;
    document.head.appendChild(s);
  }
  async function paint() {
    const ov = document.getElementById('lsOv'); if (!ov) return;
    const bodyEl = ov.querySelector('.ls-body'); bodyEl.innerHTML = '<div style="padding:30px;text-align:center;color:#667">Loading…</div>';
    try {
      if (typeof ensureDataLoaded === 'function' && typeof loadStaffAttendance === 'function') await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance);
    } catch (e) {}
    const reqs = await loadRequests(true);
    const b = build(cur.staffId, cur.month, reqs);
    if (!b) { bodyEl.innerHTML = '<div style="padding:30px;text-align:center">Staff member not found.</div>'; return; }
    const yr = yearRows(cur.staffId, cur.month);
    cur.b = b; cur.yr = yr;
    bodyEl.innerHTML = bodyHtml(b, yr, false);
  }
  window.openLeaveStatement = function (staffId, monthStr) {
    ensureCss();
    const old = document.getElementById('lsOv'); if (old) old.remove();
    const m = monthStr || (typeof staffPayrollMonth !== 'undefined' && staffPayrollMonth) || new Date().toISOString().slice(0, 7);
    cur = { staffId, month: m };
    const ov = document.createElement('div'); ov.id = 'lsOv';
    ov.innerHTML = `<div class="ls-box" role="dialog" aria-modal="true"><div class="ls-top"><h3>📄 Leave statement</h3><input type="month" id="lsMonth" value="${esc(m)}"><button type="button" class="b g" id="lsClose">✕ Close</button></div><div class="ls-body"></div>
      <div class="ls-act"><button type="button" class="b g" id="lsCopy">📋 Copy as text (for WhatsApp)</button><button type="button" class="b" id="lsPrint">🖨 Print / save as PDF</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov) { ov.remove(); return; }
      const id = e.target.id;
      if (id === 'lsClose') ov.remove();
      else if (id === 'lsPrint') window.printLeaveStatement(cur.staffId, cur.month);
      else if (id === 'lsCopy') copyText();
    });
    ov.querySelector('#lsMonth').addEventListener('change', e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { cur.month = e.target.value; paint(); } });
    paint();
  };
  async function copyText() {
    if (!cur.b) return;
    const t = textCopy(cur.b, cur.yr);
    try { await navigator.clipboard.writeText(t); if (typeof showToast === 'function') showToast('Copied. Paste it into WhatsApp or a message.'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); if (typeof showToast === 'function') showToast('Copied. Paste it into WhatsApp or a message.'); } catch (x) {} ta.remove(); }
  }
  window.printLeaveStatement = async function (staffId, monthStr) {
    try { if (typeof ensureDataLoaded === 'function' && typeof loadStaffAttendance === 'function') await ensureDataLoaded('staffAttendanceRecords', loadStaffAttendance); } catch (e) {}
    const reqs = await loadRequests(true);
    const b = build(staffId, monthStr, reqs); if (!b) return;
    const yr = yearRows(staffId, monthStr);
    const logo = (document.querySelector('.sb-brand img') || {}).src || '';
    const si = (typeof schoolInfo !== 'undefined' && schoolInfo) || {};
    const w = window.open('', '_blank'); if (!w) { if (typeof showToast === 'function') showToast('Allow pop-ups to print.'); return; }
    w.document.write(`<html><head><title>Leave statement - ${esc(nameOf(b.st))} - ${esc(monthLabel(monthStr))}</title><style>
      @page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}.wrap{max-width:720px;margin:0 auto;padding:6px}
      .head{display:flex;gap:10px;align-items:center;justify-content:center;text-align:center;margin-bottom:6px}.head img{width:38px;height:38px;border-radius:50%}
      .sch{font-weight:700;font-size:16px}.adr{font-size:10px;color:#333}.ttl{text-align:center;font-weight:700;font-size:12px;border-top:1px solid #333;border-bottom:1px solid #333;padding:5px 0;margin:10px 0;letter-spacing:.04em;text-transform:uppercase}
      .sign{margin-top:36px;display:flex;justify-content:space-between;font-size:11px;font-weight:600}
      ${CSS}</style></head><body onload="window.print()"><div class="wrap">
      <div class="head">${logo ? `<img src="${esc(logo)}">` : ''}<div><div class="sch">${esc(si.name || '')}</div><div class="adr">${esc(si.address || '')}</div><div class="adr">${esc(si.phone || '')}</div></div></div>
      <div class="ttl">Leave statement</div>${bodyHtml(b, yr, true)}
      <div class="sign"><div>Employee signature</div><div>Authorised signatory</div></div></div></body></html>`);
    w.document.close();
  };

  /* ---- on the payslip: a short "Leave in this period" block, so the slip explains itself ---- */
  const origMeta = window.payslipExtraMeta;
  window.payslipExtraMeta = function (st, monthStr, preview) {
    const base = (typeof origMeta === 'function') ? origMeta.apply(this, arguments) : '';
    try {
      const b = build(st.id, monthStr, reqCache || []);
      if (!b || !b.rows.length) return base;
      const items = b.rows.map(x => `<div style="margin:1px 0">• ${esc(fdShort(x.date))} ${esc(dow(x.date))} — ${x.part === 'Full day' ? '' : esc(x.part) + ' — '}${x.reason ? esc(x.reason) : (x.applied ? 'applied' : 'marked by the office')} — <b>${esc(x.effect)}</b></div>`).join('');
      return base + `<div style="grid-column:1/-1;border:1px solid #ccc;border-radius:4px;padding:6px 8px;margin-top:4px"><span style="color:#555">Leave in this period:</span> <b>${esc(dayWord(b.pr ? b.pr.leaveDays : b.total))}</b>${b.pr ? ` (paid allowance ${esc(dayWord(b.pr.quota))}${b.pr.lopDays > 0 ? ', loss of pay ' + esc(dayWord(b.pr.lopDays)) : ''})` : ''}<div style="font-size:10px;margin-top:3px">${items}</div></div>`;
    } catch (e) { return base; }
  };
  // Warm the leave-application list so the payslip block can use it without waiting.
  setTimeout(() => { try { if (typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal')) loadRequests(false); } catch (e) {} }, 4000);
  window.__ls = { build, yearRows, textCopy, explain, reqDates };
})();
