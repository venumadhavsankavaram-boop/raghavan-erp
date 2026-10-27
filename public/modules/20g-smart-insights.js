/* ===== Smart Insights =====
   Plain rules over the school's own data: who needs a fee reminder, which children are missing school,
   notice drafts, enquiries waiting for a reply, students needing attention and records that need fixing.
   Nothing here sends anything by itself and nothing leaves this page: the office clicks WhatsApp or Copy. */
(function(){
  const TABS = [
    { k:'fees',      icon:'💰', label:'Fees' },
    { k:'attendance',icon:'🗓️', label:'Attendance' },
    { k:'attention', icon:'🚩', label:'Needs attention' },
    { k:'enquiries', icon:'📨', label:'Enquiries' },
    { k:'notices',   icon:'📢', label:'Notice helper' },
    { k:'health',    icon:'🧹', label:'Data health' },
  ];
  let siTab = 'fees';
  const st = { feeClass:'', feeTier:'', feePaid:'', feeView:'classes', feeTone:'auto', feeScope:'overdue', attClass:'', attReason:'', attnClass:'', healthType:'', cache:{} };
  const byId = id => document.getElementById(id);
  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const can = key => { try{ return getRoleViews(currentUser.role).includes(key); }catch(e){ return false; } };
  const planOk = key => { try{ return isModuleEnabledByPlan(key); }catch(e){ return true; } };
  const school = () => ((typeof schoolInfo === 'object' && schoolInfo && schoolInfo.name && schoolInfo.name !== 'Your School Name') ? schoolInfo.name : 'the school');
  const schoolPhone = () => ((typeof schoolInfo === 'object' && schoolInfo && schoolInfo.phone) || '');
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const toDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN; };
  const daysBetween = (fromIso, toIso) => Math.round(toDay(toIso) - toDay(fromIso));
  const nameOf = s => ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || 'your child';
  const classOf = s => (s.className || '') + (s.section ? '-' + s.section : '');
  const phoneOf = s => String(s.fatherPhone || s.motherPhone || s.guardianPhone || '').replace(/\D/g, '').slice(-10);
  const money = n => (typeof fmtMoney === 'function' ? fmtMoney(n) : '₹' + Number(n || 0).toLocaleString('en-IN'));
  const niceDate = iso => { const t = toDay(iso); if(isNaN(t)) return iso || ''; return new Date(t * 86400000).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }); };
  const kpi = (label, value, tone, note) => `<div class="sf-kpi sf-kpi--${tone || 'plain'}"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;
  const badge = (tone, text) => `<span class="sf-badge sf-badge--${tone}">${text}</span>`;
  const empty = (title, body) => `<div class="empty-state"><b>${title}</b>${body || ''}</div>`;
  const classOptions = cur => '<option value="">All classes</option>' + (typeof CLASS_LEVELS !== 'undefined' ? CLASS_LEVELS : []).map(c => `<option ${cur === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const activeStudents = () => (typeof students !== 'undefined' ? students : []).filter(s => (typeof isActive === 'function' ? isActive(s) : true));

  function waLink(phone, msg){ return phone && phone.length === 10 ? 'https://wa.me/91' + phone + '?text=' + encodeURIComponent(msg) : ''; }
  // Message buttons keep the text in a registry, so no message text is ever put inside an HTML attribute.
  const msgs = [];
  function msgButtons(phone, text){
    const i = msgs.push(text) - 1;
    const wa = waLink(phone, text);
    return (wa ? `<a class="sf-btn sf-btn--soft" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : `<span class="si-nophone" title="No valid parent phone number is saved for this child">No phone</span>`)
      + ` <button type="button" class="sf-btn sf-btn--soft" onclick="siCopy(${i})">Copy</button>`;
  }
  window.siCopy = async i => {
    const text = msgs[i] || '';
    try{ await navigator.clipboard.writeText(text); showToast('Message copied. Paste it into WhatsApp, SMS or a notice.'); }
    catch(e){ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); showToast('Message copied.'); }catch(_){ showToast('Could not copy. Please select the text and copy it.'); } ta.remove(); }
  };
  window.siOpen = id => { try{ switchView('admissions'); openProfile(id); }catch(e){} };

  function ensureCss(){
    if(byId('siCss')) return;
    const s = document.createElement('style'); s.id = 'siCss';
    s.textContent = `.si-tabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px}.si-tabs .mf-tab{padding:8px 10px;font-size:.82rem;white-space:nowrap}
.si-note{font-size:.82rem;color:var(--ink-soft);margin:0 0 14px}.si-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.si-bar select,.si-bar input{max-width:200px}.si-nophone{font-size:.74rem;color:var(--ink-soft);margin-right:6px}
.si-table td small{display:block;color:var(--ink-soft)}.si-acts{white-space:nowrap}.si-acts .sf-btn{padding:5px 10px;font-size:.78rem;text-decoration:none}
.si-draft{width:100%;min-height:170px;border:1px solid var(--border);border-radius:12px;padding:12px;font:inherit}
.si-chips span{display:inline-block;margin:2px 4px 2px 0}.si-fine{font-size:.78rem;color:var(--ink-soft);margin-top:14px}
.si-dash{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:0 0 26px}
.si-dash-tile{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:14px 16px;border:1px solid var(--border);border-radius:16px;background:var(--surface,#fff);cursor:pointer;font:inherit;color:inherit}
.si-dash-tile.has{border-color:#e3b64e;box-shadow:0 2px 10px rgba(200,150,30,.12)}.si-dash-tile:hover{transform:translateY(-1px)}
.si-dash-tile b{font-size:1.7rem;line-height:1.1}.si-dash-ico{font-size:1.15rem}.si-dash-lbl{font-size:.84rem;font-weight:600}.si-dash-tile small{color:var(--ink-soft);font-size:.76rem}`;
    document.head.appendChild(s);
  }

  /* ---------- Fees ---------- */
  function feeRows(scope){
    const today = todayIso(), out = [], wide = scope === 'unpaid';
    activeStudents().forEach(s => {
      let sum; try{ sum = sfStudentSummary(s); }catch(e){ return; }
      if(!sum) return;
      // Default: instalments that are already late. "unpaid" scope also brings in families who have paid nothing at all
      // but whose first instalment is not due yet (or has no due date), so nobody who owes the whole fee is invisible.
      // Tuition is judged by itself: a family can have paid the bus fee and still owe the whole tuition fee.
      let tuition = { collected:0, receivable:0 }; try{ tuition = computeStudentFinance(s).perCat.fee || tuition; }catch(e){}
      const tuitionNone = Number(tuition.receivable) > 0 && !(Number(tuition.collected) > 0);
      const upcoming = wide && sum.state !== 'overdue' && tuitionNone;
      if(sum.state !== 'overdue' && !upcoming) return;
      let amount = 0, oldest = '';
      (sum.rows.allRows || []).forEach(r => {
        amount += Number(r.overdueAmount) || 0;
        (r.installments || []).forEach(i => { if(i.status === 'overdue' && i.outstanding > 0 && i.due && (!oldest || i.due < oldest)) oldest = i.due; });
      });
      if(amount <= 0) amount = Number(sum.dueNow) || 0;
      if(upcoming){ amount = Number(tuition.receivable) || 0; oldest = ''; }
      const days = oldest ? Math.max(daysBetween(oldest, today), 0) : 0;
      const t = sum.totals || {};
      const paid = Number(t.collected) || 0, left = Number(t.receivable) || amount;
      const paidShare = paid + left > 0 ? paid / (paid + left) : 0;
      const paidState = paid <= 0 ? 'none' : 'part';
      // Everyone often shares one due date, so days late alone cannot tell families apart: what has
      // already been paid decides the tone. Firm and urgent are only for families who paid nothing.
      let tier = 'gentle';
      if(paidState === 'none') tier = days > 45 ? 'urgent' : days > 15 ? 'firm' : 'gentle';
      else if(paidShare < 0.5 && days > 30) tier = 'firm';
      out.push({ s, amount, oldest, days, tier, paid, paidShare, paidState: upcoming ? 'none' : paidState, upcoming, tuitionNone, tuitionLeft: Number(tuition.receivable) || 0 });
    });
    // Biggest unpaid share first, then the largest amount, then the longest wait.
    return out.sort((a, b) => (a.paidState === b.paidState ? 0 : a.paidState === 'none' ? -1 : 1) || b.amount - a.amount || b.days - a.days);
  }
  function feeMessage(r){
    const n = nameOf(r.s), c = classOf(r.s), amt = money(r.amount), sch = school(), since = r.oldest ? niceDate(r.oldest) : '';
    const tier = st.feeTone === 'gentle' ? 'gentle' : r.tier;
    const head = `Dear Parent, this is a message from ${sch}.`;
    if(r.upcoming) return `${head} A reminder that the tuition fee of ${amt} for ${n} (${c}) is still unpaid. Kindly pay at the school office when convenient. If you have already paid, please ignore this message. Thank you.`;
    if(r.paidState === 'part' && tier === 'gentle') return `${head} Thank you for the payment already made towards ${n}'s (${c}) fee. A balance of ${amt} is still pending${since ? ' since ' + niceDate(r.oldest) : ''}. Kindly clear it at the school office when convenient. If you have already paid, please ignore this message. Thank you.`;
    if(tier === 'gentle') return `${head} A gentle reminder: the fee of ${amt} for ${n} (${c}) ${since ? 'was due on ' + since : 'is due'}. Kindly pay at the school office when convenient. If you have already paid, please ignore this message. Thank you.`;
    if(tier === 'firm') return `${head} The fee of ${amt} for ${n} (${c}) has been pending since ${since}. Kindly clear it this week at the school office. If there is any difficulty, please tell us. Thank you.`;
    return `${head} The fee of ${amt} for ${n} (${c}) has been pending for ${r.days} days. Please meet the school office within 3 days so we can sort it out together, or let us know if you need a payment plan. Thank you.`;
  }
  const feeCsv = rows => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return ['Student,Admission no,Class,Overdue amount,Paid so far,Days late,Parent,Phone'].concat(rows.map(r => [nameOf(r.s), r.s.admissionNo || '', classOf(r.s), r.amount, r.paid, r.days, r.s.fatherName || r.s.motherName || '', phoneOf(r.s)].map(q).join(','))).join('\r\n');
  };
  window.siFeeCsv = async () => {
    let rows = feeRows(st.feeScope); if(st.feeClass) rows = rows.filter(r => r.s.className === st.feeClass); if(st.feePaid) rows = rows.filter(r => r.paidState === st.feePaid);
    const blob = new Blob(['﻿' + feeCsv(rows)], { type:'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'overdue-fees-' + todayIso() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  window.siFeeClass = c => { st.feeClass = c; st.feeView = 'list'; paintPane(); };
  function paintFees(el){
    if(!can('managefee') || !planOk('managefee')){ el.innerHTML = empty('Fees are not available for your login.'); return; }
    const all = feeRows(st.feeScope);
    const unpaidAll = feeRows('unpaid').filter(r => r.tuitionNone).length;
    let rows = all;
    if(st.feeClass) rows = rows.filter(r => r.s.className === st.feeClass);
    if(st.feePaid) rows = rows.filter(r => r.paidState === st.feePaid);
    const sum = l => l.reduce((a, r) => a + r.amount, 0);
    const none = all.filter(r => r.paidState === 'none').length, part = all.length - none;
    const noPhone = all.filter(r => !phoneOf(r.s)).length;
    const view = st.feeView === 'list' || st.feeClass ? 'list' : 'classes';
    const head = `<p class="si-note">Students with a late fee instalment (on this school's records, only the bus fee has a due date). Choose "Also tuition not paid yet" to include families who have paid no tuition at all. Work one class at a time. Nothing is sent by itself: press WhatsApp (opens a ready message you can send) or Copy.</p>
      <div class="sf-kpis">${kpi(st.feeScope === 'unpaid' ? 'Students listed' : 'Students overdue', all.length, all.length ? 'warn' : 'good')}${kpi(st.feeScope === 'unpaid' ? 'Total owed (late + tuition)' : 'Total overdue', money(sum(all)), all.length ? 'danger' : 'good')}${kpi('Nothing paid yet', none, none ? 'danger' : 'good', 'Families to call first')}${st.feeScope === 'unpaid' ? '' : kpi('Tuition not paid at all', unpaidAll, unpaidAll ? 'danger' : 'good', 'Even if not late yet')}${kpi('Part paid', part, part ? 'warn' : 'good', 'Gentle reminder')}${kpi('No parent phone', noPhone, noPhone ? 'warn' : 'good', 'Cannot be messaged')}</div>`;
    if(view === 'classes'){
      const by = new Map();
      all.forEach(r => { const k = r.s.className || '—'; let g = by.get(k); if(!g) by.set(k, g = { cls:k, n:0, amt:0, none:0, part:0 }); g.n++; g.amt += r.amount; if(r.paidState === 'none') g.none++; else g.part++; });
      const order = typeof CLASS_LEVELS !== 'undefined' ? CLASS_LEVELS : [];
      const groups = [...by.values()].sort((a, b) => { const ia = order.indexOf(a.cls), ib = order.indexOf(b.cls); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
      el.innerHTML = head + (groups.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Class</th><th>Students</th><th>Amount</th><th>Nothing paid</th><th>Part paid</th><th></th></tr></thead><tbody>${groups.map(g => `<tr><td><b>${esc(g.cls)}</b></td><td>${g.n}</td><td><b>${money(g.amt)}</b></td><td>${g.none}</td><td>${g.part}</td><td class="si-acts"><button type="button" class="sf-btn sf-btn--soft" onclick="siFeeClass('${esc(g.cls)}')">Open class</button></td></tr>`).join('')}</tbody></table></div>
        <div class="si-bar" style="margin-top:14px"><select class="input" onchange="siSet('feeScope',this.value)"><option value="overdue" ${st.feeScope !== 'unpaid' ? 'selected' : ''}>Overdue fees only</option><option value="unpaid" ${st.feeScope === 'unpaid' ? 'selected' : ''}>Also tuition not paid yet (not late)</option></select><button type="button" class="sf-btn sf-btn--soft" onclick="siSet('feeView','list')">See all students in one list</button><button type="button" class="sf-btn sf-btn--soft" onclick="siFeeCsv()">Download list (CSV)</button></div>`
        : empty('No overdue fees right now.', 'Every instalment that has fallen due is paid.'))
        + `<p class="si-fine">Families who paid nothing get a firmer message the longer it goes. Families who paid part get a thank-you and a gentle reminder.</p>`;
      return;
    }
    el.innerHTML = head + `<div class="si-bar"><button type="button" class="sf-btn sf-btn--soft" onclick="st_feeBack()">← All classes</button><select class="input" onchange="siSet('feeScope',this.value)"><option value="overdue" ${st.feeScope !== 'unpaid' ? 'selected' : ''}>Overdue fees only</option><option value="unpaid" ${st.feeScope === 'unpaid' ? 'selected' : ''}>Also fees not yet due (nothing paid)</option></select><select class="input" onchange="siSet('feeClass',this.value)">${classOptions(st.feeClass)}</select>
        <select class="input" onchange="siSet('feePaid',this.value)"><option value="">Everyone</option><option value="none" ${st.feePaid === 'none' ? 'selected' : ''}>Nothing paid yet</option><option value="part" ${st.feePaid === 'part' ? 'selected' : ''}>Part paid</option></select>
        <select class="input" onchange="siSet('feeTone',this.value)"><option value="auto" ${st.feeTone !== 'gentle' ? 'selected' : ''}>Tone: by situation</option><option value="gentle" ${st.feeTone === 'gentle' ? 'selected' : ''}>Tone: always gentle</option></select>
        <button type="button" class="sf-btn sf-btn--soft" onclick="siFeeCsv()">Download list (CSV)</button><span class="si-note" style="margin:0">${rows.length} shown · ${money(sum(rows))}</span></div>
      ${rows.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Student</th><th>Class</th><th>Overdue</th><th>Paid so far</th><th>Days late</th><th>Parent</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr>
        <td><b>${esc(nameOf(r.s))}</b><small>${esc(r.s.admissionNo || '')}</small></td><td>${esc(classOf(r.s))}</td>
        <td><b>${money(r.amount)}</b></td><td>${r.paidState === 'none' ? badge(r.upcoming ? 'due' : 'overdue', r.upcoming ? 'Tuition not paid' : 'Nothing paid') : badge('due', 'Part paid') + '<small>' + money(r.paid) + '</small>'}${r.tuitionNone && !r.upcoming ? '<small>Tuition not paid: ' + money(r.tuitionLeft) + '</small>' : ''}</td><td>${r.upcoming ? '—' : r.days}</td>
        <td>${esc(r.s.fatherName || r.s.motherName || '')}<small>${esc(phoneOf(r.s) || 'no phone')}</small></td>
        <td class="si-acts">${msgButtons(phoneOf(r.s), feeMessage(r))}</td></tr>`).join('')}</tbody></table></div>${rows.length > 300 ? '<p class="si-fine">Showing the first 300. Use the class filter to narrow down.</p>' : ''}`
        : empty(all.length ? 'Nothing matches these filters.' : 'No overdue fees right now.', all.length ? '' : 'Every instalment that has fallen due is paid.')}`;
  }
  window.st_feeBack = () => { st.feeClass = ''; st.feePaid = ''; st.feeView = 'classes'; paintPane(); };

  /* ---------- Attendance ---------- */
  function attStats(){
    const thr = (typeof attSettings === 'object' && attSettings && Number(attSettings.threshold)) || 75;
    const today = todayIso(), from30 = daysBetween(today, today) - 30, byStu = new Map();
    (typeof attendanceRecords !== 'undefined' ? attendanceRecords : []).forEach(r => {
      if(!r || !r.studentId || !r.date) return;
      let m = byStu.get(r.studentId); if(!m) byStu.set(r.studentId, m = new Map());
      const a = m.get(r.date) || { abs:0, pres:0 };
      if(r.status === 'Absent') a.abs++; else if(r.status === 'Present' || r.status === 'Late') a.pres++;
      m.set(r.date, a);
    });
    // A day on which nearly everyone is marked absent is almost certainly not a real school day (holiday, closure or a
    // mistake), so it is ignored instead of flagging the whole school.
    const dayTot = new Map();
    byStu.forEach(m => m.forEach((v, d) => { const t = dayTot.get(d) || { a:0, n:0 }; t.n++; if(v.abs > 0 && v.pres === 0) t.a++; dayTot.set(d, t); }));
    const skip = new Set([...dayTot.entries()].filter(([, t]) => t.n >= 10 && t.a / t.n >= 0.85).map(([d]) => d));
    const out = [];
    activeStudents().forEach(s => {
      const m = byStu.get(s.id); if(!m) return;
      const days = [...m.entries()].filter(([d]) => !skip.has(d)).map(([d, v]) => ({ d, absent: v.abs > 0 && v.pres === 0, present: v.pres > 0 })).filter(x => x.absent || x.present).sort((a, b) => b.d.localeCompare(a.d));
      if(!days.length) return;
      const last = days[0].d;
      let streak = 0; if(daysBetween(last, today) <= 7){ for(const x of days){ if(x.absent) streak++; else break; } }
      const win = days.filter(x => daysBetween(x.d, today) <= 30);
      const pc = win.length ? Math.round(100 * win.filter(x => x.present).length / win.length) : null;
      const recent = win.filter(x => daysBetween(x.d, today) <= 14), earlier = win.filter(x => daysBetween(x.d, today) > 14);
      const rp = recent.length >= 6 ? Math.round(100 * recent.filter(x => x.present).length / recent.length) : null;
      const ep = earlier.length >= 6 ? Math.round(100 * earlier.filter(x => x.present).length / earlier.length) : null;
      const reasons = [];
      if(streak >= 3) reasons.push('streak');
      if(pc !== null && win.length >= 8 && pc < thr) reasons.push('low');
      if(streak < 3 && rp !== null && ep !== null && ep - rp >= 20) reasons.push('drop');
      const since = streak ? days[streak - 1].d : '';
      if(reasons.length) out.push({ s, streak, since, pc, rp, ep, reasons, marked: win.length, thr });
    });
    return out.sort((a, b) => b.reasons.length - a.reasons.length || b.streak - a.streak || (a.pc == null ? 101 : a.pc) - (b.pc == null ? 101 : b.pc));
  }
  function attMessage(r){
    const n = nameOf(r.s), sch = school();
    if(r.reasons.includes('streak')) return `Dear Parent, ${n} (${classOf(r.s)}) has been absent from ${sch} for ${r.streak} school days in a row. We hope everything is fine. Please let us know the reason, or if there is any way we can help. Thank you.`;
    if(r.reasons.includes('low')) return `Dear Parent, ${n} (${classOf(r.s)}) has attended ${r.pc}% of school days in the last 30 days, while ${sch} expects at least ${r.thr}%. Regular attendance matters for learning. Please contact the class teacher if there is a problem. Thank you.`;
    return `Dear Parent, ${n} (${classOf(r.s)}) has been coming to school less often over the last two weeks (${r.rp}% recently, against ${r.ep}% before). We would like to understand if anything is wrong. Please contact the class teacher. Thank you.`;
  }
  const REASON_TXT = { streak:'Absent 3+ days in a row', low:'Low attendance', drop:'Sharp recent drop' };
  async function paintAttendance(el){
    if(!can('attendance') || !planOk('attendance')){ el.innerHTML = empty('Attendance is not available for your login.'); return; }
    el.innerHTML = '<p class="si-note">Reading attendance…</p>';
    try{ await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData); }catch(e){}
    let rows = attStats(); const all = rows;
    if(st.attClass) rows = rows.filter(r => r.s.className === st.attClass);
    if(st.attReason) rows = rows.filter(r => r.reasons.includes(st.attReason));
    el.innerHTML = `<p class="si-note">Children whose attendance needs a gentle follow-up, from the last 30 days of marked attendance. Holidays and unmarked days are ignored.</p>
      <div class="sf-kpis">${kpi('Need follow-up', all.length, all.length ? 'warn' : 'good')}${kpi('Absent 3+ days in a row', all.filter(r => r.reasons.includes('streak')).length, 'danger')}${kpi('Low attendance', all.filter(r => r.reasons.includes('low')).length, 'warn', 'Below the school minimum')}${kpi('Sharp drop', all.filter(r => r.reasons.includes('drop')).length, 'warn', 'Last 2 weeks vs before')}</div>
      <div class="si-bar"><select class="input" onchange="siSet('attClass',this.value)">${classOptions(st.attClass)}</select>
        <select class="input" onchange="siSet('attReason',this.value)"><option value="">All reasons</option>${Object.keys(REASON_TXT).map(k => `<option value="${k}" ${st.attReason === k ? 'selected' : ''}>${REASON_TXT[k]}</option>`).join('')}</select>
        <span class="si-note" style="margin:0">${rows.length} shown</span></div>
      ${rows.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Student</th><th>Class</th><th>Why</th><th>Last 30 days</th><th>Parent</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr>
        <td><b>${esc(nameOf(r.s))}</b><small>${esc(r.s.admissionNo || '')}</small></td><td>${esc(classOf(r.s))}</td>
        <td class="si-chips">${r.reasons.map(x => badge(x === 'streak' ? 'overdue' : 'due', REASON_TXT[x])).join('')}${r.streak >= 3 ? `<small>${r.streak} days in a row, since ${esc(niceDate(r.since))}</small>` : ''}</td>
        <td>${r.pc == null ? '—' : r.pc + '%'}<small>${r.marked} days marked</small></td>
        <td>${esc(r.s.fatherName || r.s.motherName || '')}<small>${esc(phoneOf(r.s) || 'no phone')}</small></td>
        <td class="si-acts">${msgButtons(phoneOf(r.s), attMessage(r))}</td></tr>`).join('')}</tbody></table></div>`
        : empty(all.length ? 'Nothing matches these filters.' : 'No attendance concerns right now.', all.length ? '' : 'Either attendance is healthy, or not enough days have been marked yet.')}`;
  }

  /* ---------- Needs attention (attendance + fees together) ---------- */
  async function paintAttention(el){
    el.innerHTML = '<p class="si-note">Working it out…</p>';
    const fees = (can('managefee') && planOk('managefee')) ? feeRows() : [];
    let att = [];
    if(can('attendance') && planOk('attendance')){ try{ await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData); }catch(e){} att = attStats(); }
    const map = new Map();
    const get = s => { let x = map.get(s.id); if(!x) map.set(s.id, x = { s, signals: [], score: 0 }); return x; };
    att.forEach(r => { const x = get(r.s); x.score += r.reasons.length + (r.streak >= 5 ? 1 : 0); x.signals.push('Attendance: ' + r.reasons.map(k => REASON_TXT[k].toLowerCase()).join(', ') + (r.pc != null ? ' (' + r.pc + '% in 30 days)' : '')); });
    fees.forEach(r => { const x = get(r.s); x.score += r.tier === 'urgent' ? 2 : 1; x.signals.push('Fees: ' + money(r.amount) + ' overdue ' + (r.days ? 'for ' + r.days + ' days' : '')); });
    let rows = [...map.values()].filter(x => x.signals.length >= 2 || x.score >= 3).sort((a, b) => b.score - a.score);
    if(st.attnClass) rows = rows.filter(r => r.s.className === st.attnClass);
    el.innerHTML = `<p class="si-note">Children who show more than one worry at the same time, so the class teacher or office can have a caring conversation. This is a prompt to talk, not a verdict. Marks will be added here later.</p>
      <div class="si-bar"><select class="input" onchange="siSet('attnClass',this.value)">${classOptions(st.attnClass)}</select><span class="si-note" style="margin:0">${rows.length} shown</span></div>
      ${rows.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Student</th><th>Class</th><th>What we noticed</th><th>Parent</th><th></th></tr></thead><tbody>${rows.slice(0, 200).map(r => `<tr>
        <td><b>${esc(nameOf(r.s))}</b><small>${esc(r.s.admissionNo || '')}</small></td><td>${esc(classOf(r.s))}</td>
        <td>${r.signals.map(x => `<div>${esc(x)}</div>`).join('')}</td>
        <td>${esc(r.s.fatherName || r.s.motherName || '')}<small>${esc(phoneOf(r.s) || 'no phone')}</small></td>
        <td class="si-acts"><button type="button" class="sf-btn sf-btn--soft" onclick="siOpen('${esc(r.s.id)}')">Open profile</button></td></tr>`).join('')}</tbody></table></div>`
        : empty('No child shows more than one concern.', 'Good news. Check again after the next attendance and fee updates.')}`;
  }

  /* ---------- Enquiries ---------- */
  function enquiryRows(){
    const today = todayIso();
    return (typeof admissionInquiries !== 'undefined' ? admissionInquiries : []).filter(q => (q.status || 'New') === 'New' || q.status === 'Contacted').map(q => {
      const waited = q.submittedDate ? Math.max(daysBetween(String(q.submittedDate).slice(0, 10), today), 0) : 0;
      const stage = (q.status || 'New') === 'New' ? (waited >= 3 ? 'late' : 'fresh') : (waited >= 10 ? 'cold' : 'warm');
      return { q, waited, stage };
    }).sort((a, b) => (a.q.status === 'New' ? 0 : 1) - (b.q.status === 'New' ? 0 : 1) || b.waited - a.waited);
  }
  function enquiryMessage(r){
    const q = r.q, sch = school(), ph = schoolPhone();
    const who = (q.parentName || '').trim() || 'Parent';
    const kid = (q.studentName || '').trim() || 'your child';
    const grade = q.applyingGrade ? ' for ' + q.applyingGrade : '';
    const call = ph ? ` You can call us on ${ph} or visit the school office.` : ' Please visit the school office or reply to this message.';
    if(q.status === 'Contacted') return `Dear ${who}, this is ${sch}. We spoke recently about the admission of ${kid}${grade}. Are you still interested? We would be happy to answer any questions.${call} Thank you.`;
    return `Dear ${who}, thank you for your interest in ${sch}. We received your enquiry about admission${grade} for ${kid}. We would be happy to guide you on the process, fees and documents.${call} Thank you.`;
  }
  async function paintEnquiries(el){
    if(!can('websiteinquiries')){ el.innerHTML = empty('Enquiries are not available for your login.'); return; }
    el.innerHTML = '<p class="si-note">Loading enquiries…</p>';
    try{ if(typeof refreshAdmissionInquiries === 'function') await refreshAdmissionInquiries(); }catch(e){}
    const rows = enquiryRows();
    const STAGE = { fresh:['upcoming','New'], late:['overdue','Waiting 3+ days'], warm:['due','Contacted'], cold:['overdue','Going cold'] };
    el.innerHTML = `<p class="si-note">Open admission enquiries from the website, the ones waiting longest first. A quick reply is the biggest factor in whether a family joins.</p>
      <div class="sf-kpis">${kpi('Open enquiries', rows.length, rows.length ? 'warn' : 'good')}${kpi('Not answered yet', rows.filter(r => r.q.status !== 'Contacted').length, 'danger')}${kpi('Waiting 3+ days', rows.filter(r => r.stage === 'late').length, 'danger')}${kpi('Going cold (10+ days)', rows.filter(r => r.stage === 'cold').length, 'warn')}</div>
      ${rows.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Received</th><th>Child</th><th>Parent</th><th>Waiting</th><th></th></tr></thead><tbody>${rows.slice(0, 200).map(r => {
        const ph = String(r.q.parentPhone || '').replace(/\D/g, '').slice(-10);
        return `<tr><td>${esc(r.q.submittedDate || '—')}</td><td><b>${esc(r.q.studentName || '—')}</b><small>${esc(r.q.applyingGrade || '')}</small></td>
        <td>${esc(r.q.parentName || '—')}<small>${esc(ph || 'no phone')}</small></td>
        <td>${r.waited} day${r.waited === 1 ? '' : 's'} ${badge(STAGE[r.stage][0], STAGE[r.stage][1])}</td>
        <td class="si-acts">${msgButtons(ph, enquiryMessage(r))}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="si-fine">After you reply, change the enquiry status in Website → Enquiries so it leaves this list.</p>`
        : empty('No open enquiries.', 'New website enquiries will appear here.')}`;
  }

  /* ---------- Notice helper ---------- */
  const NOTICE_TYPES = {
    holiday:{ label:'Holiday', what:'Holiday for (occasion)', title: f => 'Holiday on ' + f.date, body: f => `This is to inform all parents and students that ${school()} will remain closed on ${f.date}${f.what ? ' on account of ' + f.what : ''}. Classes will resume on the next working day${f.extra ? '. ' + f.extra : '.'}` },
    exam:{ label:'Exam schedule', what:'Exam name', title: f => (f.what || 'Examination') + ' from ' + f.date, body: f => `The ${f.what || 'examination'} will begin on ${f.date}${f.time ? ' at ' + f.time : ''}. Students must bring their admit card and required stationery, and reach school 15 minutes early.${f.extra ? ' ' + f.extra : ''} We wish all our students the very best.` },
    fee:{ label:'Fee reminder', what:'Fee for (e.g. Term 2)', title: f => 'Fee reminder' + (f.what ? ': ' + f.what : ''), body: f => `Parents are kindly reminded that the ${f.what || 'school fee'} is due on ${f.date}. Please pay at the school office and keep your receipt safe. If already paid, please ignore this notice.${f.extra ? ' ' + f.extra : ''}` },
    event:{ label:'Event or function', what:'Event name', title: f => (f.what || 'School event') + ' on ' + f.date, body: f => `${school()} is happy to announce ${f.what || 'a school event'} on ${f.date}${f.time ? ' at ' + f.time : ''}${f.venue ? ', at ' + f.venue : ''}. Parents are warmly invited to attend.${f.extra ? ' ' + f.extra : ''}` },
    ptm:{ label:'Parent-teacher meeting', what:'Class or purpose (optional)', title: f => 'Parent-teacher meeting on ' + f.date, body: f => `A parent-teacher meeting${f.what ? ' (' + f.what + ')' : ''} will be held on ${f.date}${f.time ? ' at ' + f.time : ''}${f.venue ? ', at ' + f.venue : ''}. Parents are requested to attend and discuss their child's progress.${f.extra ? ' ' + f.extra : ''}` },
    closure:{ label:'Closure (weather or emergency)', what:'Reason', title: f => 'School closed on ' + f.date, body: f => `Due to ${f.what || 'unavoidable circumstances'}, ${school()} will remain closed on ${f.date}. Please stay safe. We will inform you about reopening.${f.extra ? ' ' + f.extra : ''}` },
  };
  let nf = { type:'holiday', date:'', what:'', time:'', venue:'', extra:'' };
  function noticeDraft(){
    const t = NOTICE_TYPES[nf.type]; const f = { ...nf, date: nf.date ? niceDate(nf.date) : '[date]' };
    return { title: t.title(f), body: t.body(f) };
  }
  window.siNf = (k, v) => { nf[k] = v; if(k === 'type') paintNotices(byId('siPane')); else paintNoticePreview(); };
  function paintNoticePreview(){
    const d = noticeDraft(), t = byId('siNoticeTitle'), b = byId('siNoticeBody');
    if(t) t.value = d.title; if(b) b.value = d.body;
  }
  function paintNotices(el){
    const T = NOTICE_TYPES[nf.type];
    const fld = (label, k, type, ph) => `<div class="f-field"><label>${label}</label><input class="input" type="${type || 'text'}" value="${esc(nf[k])}" placeholder="${esc(ph || '')}" oninput="siNf('${k}',this.value)"></div>`;
    el.innerHTML = `<p class="si-note">Pick what you want to announce, fill the few details, and get a ready notice with your school's name in it. You can edit the text before using it.</p>
      <div class="cm-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;max-width:900px">
        <div class="f-field"><label>Type of notice</label><select class="input" onchange="siNf('type',this.value)">${Object.keys(NOTICE_TYPES).map(k => `<option value="${k}" ${nf.type === k ? 'selected' : ''}>${NOTICE_TYPES[k].label}</option>`).join('')}</select></div>
        ${fld('Date', 'date', 'date')}${fld(T.what, 'what', 'text')}${fld('Time (optional)', 'time', 'text', 'for example 9:30 AM')}${fld('Place (optional)', 'venue', 'text')}${fld('Anything else to add (optional)', 'extra', 'text')}
      </div>
      <div class="f-field" style="margin-top:14px;max-width:900px"><label>Title</label><input class="input" id="siNoticeTitle"></div>
      <div class="f-field" style="max-width:900px"><label>Message</label><textarea class="si-draft" id="siNoticeBody"></textarea></div>
      <div class="si-bar"><button type="button" class="sf-btn sf-btn--soft" onclick="siNoticeCopy()">Copy text</button>
        ${can('announcements') ? '<button type="button" class="sf-btn sf-btn--primary" onclick="siNoticeUse()">Use in Announcements</button>' : ''}</div>
      <p class="si-fine">Nothing is published from here. "Use in Announcements" opens the new-message form with this text filled in so you can choose who receives it.</p>`;
    paintNoticePreview();
  }
  window.siNoticeCopy = async () => {
    const t = (byId('siNoticeTitle') || {}).value || '', b = (byId('siNoticeBody') || {}).value || '';
    msgs.push(t + '\n\n' + b); await window.siCopy(msgs.length - 1);
  };
  window.siNoticeUse = () => {
    const t = (byId('siNoticeTitle') || {}).value || '', b = (byId('siNoticeBody') || {}).value || '';
    try{ switchView('announcements'); }catch(e){}
    let tries = 0;
    const fill = () => {
      const a = byId('commsTitle'), c = byId('commsBodyText');
      if(a && c){ a.value = t; c.value = b; showToast('Notice text filled in. Choose who should receive it.'); return; }
      if(++tries < 12) setTimeout(fill, 250); else { msgs.push(t + '\n\n' + b); window.siCopy(msgs.length - 1); showToast('Could not fill the form, so the text was copied instead.'); }
    };
    setTimeout(fill, 300);
  };

  /* ---------- Data health ---------- */
  function healthChecks(){
    const list = activeStudents();
    const checks = [
      { k:'nophone', label:'No parent phone number', hint:'Cannot receive fee, attendance or notice messages.', test: s => !phoneOf(s) },
      { k:'badphone', label:'Phone number looks wrong', hint:'Not a 10-digit number.', test: s => { const raw = String(s.fatherPhone || s.motherPhone || s.guardianPhone || '').replace(/\D/g, ''); return raw && (raw.length < 10 || raw.length > 12); } },
      { k:'nodob', label:'Date of birth missing', hint:'Needed for certificates and age checks.', test: s => !s.dob },
      { k:'noclass', label:'Class or section missing', hint:'Will not appear in class lists.', test: s => !s.className || !s.section },
      { k:'noadm', label:'No admission number', hint:'', test: s => !String(s.admissionNo || '').trim() },
    ];
    const seen = new Map(); list.forEach(s => { const k = String(s.admissionNo || '').trim().toLowerCase(); if(k) seen.set(k, (seen.get(k) || 0) + 1); });
    checks.push({ k:'dupadm', label:'Same admission number used twice', hint:'Two children share one number.', test: s => (seen.get(String(s.admissionNo || '').trim().toLowerCase()) || 0) > 1 });
    const seen2 = new Map(); list.forEach(s => { const k = [nameOf(s).toLowerCase(), s.dob || '', s.className || ''].join('|'); if(s.dob) seen2.set(k, (seen2.get(k) || 0) + 1); });
    checks.push({ k:'dupstu', label:'Possible duplicate student', hint:'Same name, birth date and class appear more than once.', test: s => s.dob && (seen2.get([nameOf(s).toLowerCase(), s.dob, s.className || ''].join('|')) || 0) > 1 });
    checks.forEach(c => { c.rows = list.filter(c.test); });
    return { checks, total: list.length };
  }
  function paintHealth(el){
    if(!can('admissions')){ el.innerHTML = empty('Student records are not available for your login.'); return; }
    const { checks, total } = healthChecks();
    const issues = checks.reduce((a, c) => a + c.rows.length, 0);
    const sel = checks.find(c => c.k === st.healthType) || checks.find(c => c.rows.length) || checks[0];
    el.innerHTML = `<p class="si-note">Missing or doubtful details in student records. Fixing them keeps messages, certificates and reports correct. ${total} active students checked.</p>
      <div class="sf-kpis">${kpi('Records with issues', new Set(checks.flatMap(c => c.rows.map(s => s.id))).size, issues ? 'warn' : 'good')}${checks.map(c => kpi(c.label, c.rows.length, c.rows.length ? 'warn' : 'good')).join('')}</div>
      <div class="si-bar"><select class="input" style="max-width:320px" onchange="siSet('healthType',this.value)">${checks.map(c => `<option value="${c.k}" ${sel.k === c.k ? 'selected' : ''}>${esc(c.label)} (${c.rows.length})</option>`).join('')}</select>
        <span class="si-note" style="margin:0">${esc(sel.hint)}</span></div>
      ${sel.rows.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="sf-table si-table"><thead><tr><th>Student</th><th>Class</th><th>Admission no.</th><th></th></tr></thead><tbody>${sel.rows.slice(0, 300).map(s => `<tr><td><b>${esc(nameOf(s))}</b></td><td>${esc(classOf(s) || '—')}</td><td>${esc(s.admissionNo || '—')}</td><td class="si-acts"><button type="button" class="sf-btn sf-btn--soft" onclick="siOpen('${esc(s.id)}')">Open profile</button></td></tr>`).join('')}</tbody></table></div>`
        : empty('All clear for this check.')}`;
  }

  /* ---------- shell ---------- */
  function visibleTabs(){
    const ok = { fees: can('managefee') && planOk('managefee'), attendance: can('attendance') && planOk('attendance'), attention: true, enquiries: can('websiteinquiries'), notices: true, health: can('admissions') };
    return TABS.filter(t => ok[t.k]);
  }
  window.siSet = (k, v) => { st[k] = v; paintPane(); };
  window.siGo = k => { siTab = k; paintTabs(); paintPane(); };
  function paintTabs(){
    const el = byId('siTabs'); if(!el) return;
    el.innerHTML = visibleTabs().map(t => `<button type="button" class="mf-tab ${siTab === t.k ? 'active' : ''}" onclick="siGo('${t.k}')">${t.icon} ${t.label}</button>`).join('');
  }
  async function paintPane(){
    const el = byId('siPane'); if(!el) return;
    const tabs = visibleTabs(); if(!tabs.find(t => t.k === siTab)) siTab = tabs[0] ? tabs[0].k : 'notices';
    msgs.length = 0;
    try{
      if(siTab === 'fees') paintFees(el);
      else if(siTab === 'attendance') await paintAttendance(el);
      else if(siTab === 'attention') await paintAttention(el);
      else if(siTab === 'enquiries') await paintEnquiries(el);
      else if(siTab === 'notices') paintNotices(el);
      else if(siTab === 'health') paintHealth(el);
    }catch(e){ console.error('Smart Insights:', e); el.innerHTML = empty('Something went wrong while working this out.', 'Please refresh the page and try again.'); }
  }
  window.initInsightsView = function(){
    ensureCss(); paintTabs(); paintPane();
  };
  // Small dashboard card: the single most useful number per area, with a link in.
  window.insightsSummary = async function(){
    const out = { fees:0, feeAmount:0, enquiries:0, health:0 };
    try{ if(can('managefee') && planOk('managefee')){ const r = feeRows(); out.fees = r.length; out.feeAmount = r.reduce((a, x) => a + x.amount, 0); } }catch(e){}
    try{ if(can('websiteinquiries')) out.enquiries = enquiryRows().filter(r => r.q.status !== 'Contacted').length; }catch(e){}
    return out;
  };
  /* ---------- Dashboard card ---------- */
  async function paintDashCard(){
    if(!can('insights') || !byId('dashBanner')) return;
    ensureCss();
    let host = byId('dashInsights');
    if(!host){ host = document.createElement('div'); host.id = 'dashInsights'; byId('dashBanner').insertAdjacentElement('afterend', host); }
    const tiles = [];
    try{ if(can('managefee') && planOk('managefee')){ const r = feeRows(); const none = r.filter(x => x.paidState === 'none').length;
      tiles.push({ k:'fees', icon:'💰', n:r.length, label:'students with a late fee instalment', sub: r.length ? money(r.reduce((a, x) => a + x.amount, 0)) + ' · ' + none + ' paid nothing' : 'All clear' }); } }catch(e){}
    try{ if(can('managefee') && planOk('managefee')){ const t = feeRows('unpaid').filter(x => x.tuitionNone);
      tiles.push({ k:'tuition', icon:'🎓', n:t.length, label:'families have paid no tuition at all', sub: t.length ? money(t.reduce((a, x) => a + (x.tuitionLeft || x.amount), 0)) + ' tuition not yet paid' : 'All clear' }); } }catch(e){}
    try{ if(can('attendance') && planOk('attendance')){ await ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData); const a = attStats();
      tiles.push({ k:'attendance', icon:'🗓️', n:a.length, label:'children need an attendance follow-up', sub: a.length ? a.filter(x => x.reasons.includes('streak')).length + ' absent 3+ days in a row' : 'All clear' }); } }catch(e){}
    try{ if(can('websiteinquiries') && typeof admissionInquiries !== 'undefined'){ const q = enquiryRows().filter(x => x.q.status !== 'Contacted');
      tiles.push({ k:'enquiries', icon:'📨', n:q.length, label:'new admission enquiries not answered', sub: q.length ? 'Reply quickly to win the family' : 'All clear' }); } }catch(e){}
    if(!tiles.length){ host.innerHTML = ''; return; }
    host.innerHTML = `<div class="dash-section-title"><div><span class="eyebrow-sm">Smart Insights</span><h3>Needs your attention today</h3></div></div>
      <div class="si-dash">${tiles.map(t => `<button type="button" class="si-dash-tile ${t.n ? 'has' : ''}" onclick="siGoFrom('${t.k}')"><span class="si-dash-ico">${t.icon}</span><b>${t.n}</b><span class="si-dash-lbl">${t.label}</span><small>${esc(t.sub)}</small></button>`).join('')}</div>`;
  }
  window.siGoFrom = k => { if(k === 'tuition'){ k = 'fees'; st.feeScope = 'unpaid'; st.feeView = 'classes'; st.feeClass = ''; st.feePaid = ''; } else if(k === 'fees'){ st.feeScope = 'overdue'; } siTab = k; try{ switchView('insights'); }catch(e){} };
  (function hookDashboard(){
    if(typeof renderDashboard !== 'function') return;
    const base = renderDashboard;
    renderDashboard = async function(){ const r = await base.apply(this, arguments); setTimeout(() => { paintDashCard().catch(() => {}); }, 0); return r; };
  })();

  window.__siTest = { paintDashCard, feeRows, attStats, enquiryRows, healthChecks, noticeDraft, NOTICE_TYPES, nf: () => nf };
})();
