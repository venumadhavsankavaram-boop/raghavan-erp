/* ============================================================================
   Fee Reports v2 — Paid / Payable / Due register, Defaulters due list,
   Fully-paid list, Class-wise summary and Receipts between dates.
   ----------------------------------------------------------------------------
   Loads after 13-reports-teacher-performance.js. It replaces the old
   "Fee Paid, Payable & Due" generator and adds four companion reports to the
   Accounts category of the Reports menu.

   One calculation engine feeds every report, so the numbers can never differ
   between them:
       Total Fee    = fees charged (tuition/bus/stock/hostel + extra fees)
       Concession   = Total Fee - Payable        (discounts + approved concessions)
       Payable      = Total Fee - Concession
       Paid         = receipts counted (voided receipts ignored, refunds netted)
       Due          = Payable - Paid, never below 0 per fee type
   An "As on date" option counts only receipts up to that day. A fee-type
   selection limits every figure to the ticked types.
   Each report asks its options in one small window, shows a live preview of
   the totals, then gives Excel or Print / PDF.
   ========================================================================== */
(function(){
  const RT = () => (typeof CATS !== 'undefined' ? CATS : { fee: 'Tuition Fee' });
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v));
  const num = v => Number(v) || 0;
  const inr = n => Math.round(num(n)).toLocaleString('en-IN');
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayISO = () => iso(new Date());
  const dmy = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
  const stamp = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const natural = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });

  // ---------- engine ----------
  function studentFigures(s, o){
    const types = o.types;
    const allTypes = types.length === Object.keys(RT()).length;
    let totalFee = 0, payable = 0, paid = 0, due = 0, excess = 0, lastPaid = '', lastReceipt = '';
    const perType = {};
    types.forEach(c => {
      const pays = payments.filter(p => p.studentId === s.id && p.category === c && (p.classAtPayment === s.className || !p.classAtPayment) && !p.voided && (!o.asOn || !p.date || String(p.date) <= o.asOn));
      const collected = pays.reduce((a, p) => a + (typeof payNet === 'function' ? payNet(p) : num(p.amount)), 0);
      let discount = c === 'stock' ? 0 : pays.reduce((a, p) => a + num(p.discount), 0);
      let expected = 0;
      if(c === 'hostel') expected = s.isBoarder === 'Yes' ? num(studentHostelFee(s)) : 0;
      else if(c === 'bus') expected = s.needsTransport === 'Yes' ? num(studentBusFare(s)) : 0;
      else expected = num((classStruct(s.className) || {})[c]);
      studentDiscounts.filter(d => d.studentId === s.id && d.status === 'Approved' && d.appliesTo === c).forEach(d => {
        discount += d.mode === 'percentage' ? Math.round(expected * num(d.value) / 100) : num(d.value);
      });
      const net = Math.max(expected - discount, 0);
      const rec = Math.max(net - collected, 0);
      totalFee += expected; payable += net; paid += collected; due += rec;
      excess += Math.max(collected - net, 0);
      perType[c] = { expected, net, collected, due: rec };
      pays.forEach(p => { const d = String(p.date || ''); if(d >= lastPaid){ lastPaid = d; lastReceipt = p.receiptNo || ''; } });
    });
    if(allTypes){
      studentExtraFees.filter(e => e.studentId === s.id).forEach(e => {
        const a = num(e.amount); totalFee += a; payable += a;
        if(e.paid) paid += a; else due += a;
      });
    }
    return { totalFee, concession: totalFee - payable, payable, paid, due, excess, lastPaid, lastReceipt, perType };
  }

  const SUM_KEYS = ['totalFee', 'concession', 'payable', 'paid', 'due'];
  const zero = () => ({ totalFee: 0, concession: 0, payable: 0, paid: 0, due: 0, count: 0, defaulters: 0 });
  function addTo(acc, r){ SUM_KEYS.forEach(k => { acc[k] += r[k]; }); acc.count++; if(r.due > 0) acc.defaulters++; return acc; }

  function buildRegister(filters, o){
    let list = (students || []).filter(s => !s.deleted);
    if(!o.includeInactive) list = list.filter(s => (typeof isActive === 'function' ? isActive(s) : true));
    list = applyStudentScope(list, filters);
    let rows = list.map(s => {
      const f = studentFigures(s, o);
      return Object.assign({
        id: s.id, admissionNo: s.admissionNo || '', rollNo: s.rollNo || '', name: ((s.firstName || '') + ' ' + (s.lastName || '')).trim(),
        className: s.className || '', section: s.section || '', father: s.fatherName || '',
        contact: s.fatherPhone || s.motherPhone || s.guardianPhone || s.contact || '', status: s.status || 'Active',
      }, f);
    });
    const show = o.show || 'all';
    rows = rows.filter(r => {
      if(r.payable <= 0 && r.totalFee <= 0 && show !== 'all') return false;
      if(show === 'due') return r.due > 0 && r.due >= num(o.minDue);
      if(show === 'paid') return r.payable > 0 && r.due === 0;
      if(show === 'nil') return r.payable > 0 && r.paid === 0;
      return true;
    });
    const cmp = {
      id: (a, b) => natural(a.admissionNo, b.admissionNo),
      roll: (a, b) => natural(a.section, b.section) || natural(a.rollNo, b.rollNo) || natural(a.name, b.name),
      name: (a, b) => natural(a.name, b.name),
      due: (a, b) => b.due - a.due || natural(a.name, b.name),
    }[o.sort || 'id'];
    const order = (typeof CLASS_LEVELS !== 'undefined' ? CLASS_LEVELS : []).slice();
    rows.forEach(r => { if(!order.includes(r.className)) order.push(r.className); });
    const groups = order.map(c => {
      const list = rows.filter(r => r.className === c).sort(cmp);
      const subtotal = list.reduce(addTo, zero());
      return { className: c, students: list, subtotal };
    }).filter(g => g.students.length);
    const grand = groups.reduce((a, g) => { SUM_KEYS.forEach(k => { a[k] += g.subtotal[k]; }); a.count += g.subtotal.count; a.defaulters += g.subtotal.defaulters; return a; }, zero());
    return { groups, grand, rows };
  }

  function buildReceipts(filters, o){
    let list = (payments || []).filter(p => !p.voided);
    if(o.from) list = list.filter(p => String(p.date || '') >= o.from);
    if(o.to) list = list.filter(p => String(p.date || '') <= o.to);
    if(o.mode) list = list.filter(p => (p.mode || '') === o.mode);
    if(o.user) list = list.filter(p => (p.collectedBy || '—') === o.user);
    if(o.types.length !== Object.keys(RT()).length) list = list.filter(p => o.types.includes(p.category));
    const byId = new Map((students || []).map(s => [s.id, s]));
    list = list.filter(p => {
      const s = byId.get(p.studentId);
      if(filters.studentId) return p.studentId === filters.studentId;
      if(filters.className && !(s && s.className === filters.className)) return false;
      if(filters.section && !(s && s.section === filters.section)) return false;
      return true;
    });
    const rows = list.map(p => {
      const s = byId.get(p.studentId) || {};
      return {
        receiptNo: p.receiptNo || '', date: p.date || '', admissionNo: s.admissionNo || '', name: p.studentName || ((s.firstName || '') + ' ' + (s.lastName || '')).trim(),
        className: p.classAtPayment || s.className || '', section: s.section || '', category: (typeof feeLabelFor === 'function' ? feeLabelFor(p) : (RT()[p.category] || p.category)),
        instalment: p.instalment || '', mode: p.mode || '', user: p.collectedBy || '—', amount: typeof payNet === 'function' ? payNet(p) : num(p.amount), discount: num(p.discount),
      };
    });
    rows.sort((a, b) => o.sort === 'receipt' ? natural(a.receiptNo, b.receiptNo) : (String(a.date).localeCompare(String(b.date)) || natural(a.receiptNo, b.receiptNo)));
    const sum = (arr, k) => arr.reduce((a, r) => a + r[k], 0);
    const group = k => { const m = new Map(); rows.forEach(r => { const key = r[k] || '—'; const g = m.get(key) || { key, count: 0, amount: 0, discount: 0 }; g.count++; g.amount += r.amount; g.discount += r.discount; m.set(key, g); }); return [...m.values()]; };
    return { rows, total: { count: rows.length, amount: sum(rows, 'amount'), discount: sum(rows, 'discount') }, byDay: group('date').sort((a, b) => a.key.localeCompare(b.key)), byMode: group('mode'), byType: group('category'), byUser: group('user') };
  }

  // ---------- header / filter text ----------
  function headBlock(){
    const si = (typeof schoolInfo !== 'undefined' && schoolInfo) || {};
    const lines = [si.name || 'School', si.address || '', [si.phone, si.email].filter(Boolean).join(' , ')].filter(Boolean);
    return lines;
  }
  function filterLine(filters, o, extra){
    const bits = [];
    bits.push(filters.studentId ? 'One student' : (filters.className ? filters.className + (filters.section ? ' — Section ' + filters.section : '') : 'All classes'));
    if(o.types && o.types.length !== Object.keys(RT()).length) bits.push('Fee types: ' + o.types.map(c => RT()[c]).join(', '));
    if(o.asOn && o.asOn < todayISO()) bits.push('As on ' + dmy(o.asOn));
    if(o.includeInactive) bits.push('Includes inactive students');
    if(extra) bits.push(extra);
    return bits.join('  ·  ');
  }
  const TITLES = {
    fee_due_payable_classwise: 'Fee Paid, Payable and Due Report for Student wise',
    fee_due_list: 'Fee Due List (Defaulters) — Student wise',
    fee_paid_list: 'Fully Paid Students — Fee Report',
    fee_class_summary: 'Class-wise Fee Summary (Payable, Paid and Due)',
    fee_receipts_between: 'Fee Receipts Between Dates',
  };

  // ---------- Excel ----------
  async function toExcel(id, filters, o){
    if(!(await ensureXLSX())) return;
    const wb = XLSX.utils.book_new();
    const head = headBlock();
    const top = () => [...head.map(h => [h]), [TITLES[id]], [filterLine(filters, o, o._extra)], []];
    const addSheet = (name, aoa, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    };
    if(id === 'fee_receipts_between'){
      const R = buildReceipts(filters, o);
      if(!R.rows.length){ showToast('No receipts found for these options.'); return; }
      const aoa = top();
      aoa.push(['S.No', 'Receipt No', 'Date', 'Student ID', 'Name', 'Class', 'Section', 'Fee Type', 'Instalment', 'Mode', 'Collected By', 'Amount', 'Discount']);
      R.rows.forEach((r, i) => aoa.push([i + 1, r.receiptNo, dmy(r.date), r.admissionNo, r.name, r.className, r.section, r.category, r.instalment, r.mode, r.user, r.amount, r.discount]));
      aoa.push(['', '', '', '', 'Total (' + R.total.count + ' receipts)', '', '', '', '', '', '', R.total.amount, R.total.discount]);
      aoa.push([], ['Generated on ' + stamp()]);
      addSheet('Receipts', aoa, [6, 14, 12, 16, 28, 14, 8, 16, 12, 12, 16, 12, 10]);
      const day = top(); day.push(['Date', 'Receipts', 'Amount', 'Discount']);
      R.byDay.forEach(g => day.push([dmy(g.key), g.count, g.amount, g.discount])); day.push(['Total', R.total.count, R.total.amount, R.total.discount]);
      addSheet('Day-wise', day, [14, 10, 14, 12]);
      const md = top(); md.push(['Mode', 'Receipts', 'Amount']); R.byMode.forEach(g => md.push([g.key, g.count, g.amount])); md.push([]); md.push(['Fee Type', 'Receipts', 'Amount']); R.byType.forEach(g => md.push([g.key, g.count, g.amount])); md.push([]); md.push(['Collected By', 'Receipts', 'Amount']); R.byUser.forEach(g => md.push([g.key, g.count, g.amount]));
      addSheet('Mode & Type', md, [20, 10, 14]);
      XLSX.writeFile(wb, `${slugifySchoolName()}_fee_receipts_${o.from || 'start'}_to_${o.to || 'today'}.xlsx`);
      return;
    }
    const R = buildRegister(filters, o);
    if(!R.groups.length){ showToast('No students match these options.'); return; }
    if(id === 'fee_class_summary'){
      const aoa = top();
      aoa.push(['S.No', 'Class', 'Students', 'Students with Due', 'Total Fee', 'Concession', 'Payable Fee', 'Paid Fee', 'Due Amount', 'Collected %']);
      R.groups.forEach((g, i) => aoa.push([i + 1, g.className, g.subtotal.count, g.subtotal.defaulters, g.subtotal.totalFee, g.subtotal.concession, g.subtotal.payable, g.subtotal.paid, g.subtotal.due, g.subtotal.payable ? Math.round(g.subtotal.paid * 1000 / g.subtotal.payable) / 10 : 0]));
      const G = R.grand;
      aoa.push(['', 'Grand Total', G.count, G.defaulters, G.totalFee, G.concession, G.payable, G.paid, G.due, G.payable ? Math.round(G.paid * 1000 / G.payable) / 10 : 0]);
      aoa.push([], ['Report Generated on ' + stamp()]);
      addSheet('Class Summary', aoa, [6, 18, 10, 16, 14, 12, 14, 14, 14, 12]);
      XLSX.writeFile(wb, `${slugifySchoolName()}_class_wise_fee_summary.xlsx`);
      return;
    }
    const withLast = id === 'fee_due_list';
    const cols = ['S.No', 'Student ID', 'Roll No.', 'Name', 'Class', 'Section', 'Contact No', 'Total Fee', 'Concession Fee', 'Payable Fee', 'Paid Fee', 'Due Amount'];
    if(withLast) cols.push('Last Paid On', 'Last Receipt No', 'Father Name');
    const aoa = top(); aoa.push(cols);
    let n = 1;
    R.groups.forEach(g => {
      aoa.push(['', '', '', 'Class : ' + g.className]);
      g.students.forEach(r => {
        const row = [n++, r.admissionNo, r.rollNo, r.name, r.className, r.section, r.contact, r.totalFee, r.concession, r.payable, r.paid, r.due];
        if(withLast) row.push(r.lastPaid ? dmy(r.lastPaid) : 'No payment', r.lastReceipt, r.father);
        aoa.push(row);
      });
      aoa.push(['', '', '', 'Total:', '', '', '', g.subtotal.totalFee, g.subtotal.concession, g.subtotal.payable, g.subtotal.paid, g.subtotal.due]);
      aoa.push([]);
    });
    const G = R.grand;
    aoa.push(['', '', '', 'Grand Total:', '', '', '', G.totalFee, G.concession, G.payable, G.paid, G.due]);
    aoa.push([], ['Report Generated on ' + stamp()]);
    addSheet(id === 'fee_due_list' ? 'Fee Due List' : 'Fee Report', aoa, [6, 16, 9, 28, 14, 8, 14, 12, 14, 12, 12, 12, 14, 16, 22]);
    XLSX.writeFile(wb, `${slugifySchoolName()}_${id}.xlsx`);
  }

  // ---------- Print / PDF ----------
  function toPrint(id, filters, o){
    const head = headBlock();
    const logo = (() => { try { return document.querySelector('.sb-brand img').src; } catch(e){ return ''; } })();
    const style = `
      @page{ size:A4 ${id === 'fee_receipts_between' ? 'landscape' : 'portrait'}; margin:12mm 10mm 14mm; @bottom-left{ content:"Report Generated on ${stamp()}"; font-size:9px; } @bottom-right{ content:"Page " counter(page) " of " counter(pages); font-size:9px; } }
      body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:10.5px; margin:0; } table{ font-size:10.5px; }
      .h{ text-align:center; margin-bottom:6px; } .h img{ width:34px;height:34px;border-radius:50%; vertical-align:middle; margin-right:8px; }
      .h b{ font-size:15px; } .h div{ font-size:11px; line-height:1.35; }
      .t{ text-align:center; font-weight:700; font-size:12px; margin:8px 0 2px; } .f{ text-align:center; color:#444; font-size:10px; margin-bottom:8px; }
      table{ width:100%; border-collapse:collapse; margin-bottom:6px; } thead{ display:table-header-group; } tr{ page-break-inside:avoid; }
      th,td{ border-bottom:1px solid #bbb; padding:3px 5px; text-align:left; vertical-align:top; } th{ border-top:1px solid #111; border-bottom:1px solid #111; background:#f2f2f2; font-size:10px; }
      td.n, th.n{ text-align:right; white-space:nowrap; } .cls{ font-weight:700; padding:6px 0 3px; }
      tr.sub td{ font-weight:700; border-top:1px solid #111; background:#fafafa; } tr.grand td{ font-weight:700; border-top:2px solid #111; border-bottom:2px solid #111; background:#eee; }
      .due{ font-weight:700; } .note{ color:#8a5300; font-size:9px; }`;
    const headHtml = `<div class="h">${logo ? `<img src="${esc(logo)}">` : ''}<b>${esc(head[0] || '')}</b>${head.slice(1).map(l => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="t">${esc(TITLES[id])}</div><div class="f">${esc(filterLine(filters, o, o._extra))}</div>`;
    let body = '';
    if(id === 'fee_receipts_between'){
      const R = buildReceipts(filters, o);
      if(!R.rows.length){ showToast('No receipts found for these options.'); return; }
      body = `<table><thead><tr><th>S.No</th><th>Receipt No</th><th>Date</th><th>Student ID</th><th>Name</th><th>Class</th><th>Fee Type</th><th>Instalment</th><th>Mode</th><th>Collected By</th><th class="n">Amount</th><th class="n">Discount</th></tr></thead><tbody>
        ${R.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.receiptNo)}</td><td>${dmy(r.date)}</td><td>${esc(r.admissionNo)}</td><td>${esc(r.name)}</td><td>${esc(r.className)}${r.section ? '-' + esc(r.section) : ''}</td><td>${esc(r.category)}</td><td>${esc(r.instalment)}</td><td>${esc(r.mode)}</td><td>${esc(r.user)}</td><td class="n">${inr(r.amount)}</td><td class="n">${inr(r.discount)}</td></tr>`).join('')}
        <tr class="grand"><td colspan="10">Total (${R.total.count} receipts)</td><td class="n">${inr(R.total.amount)}</td><td class="n">${inr(R.total.discount)}</td></tr></tbody></table>
        <table style="width:60%"><thead><tr><th>Mode</th><th class="n">Receipts</th><th class="n">Amount</th></tr></thead><tbody>${R.byMode.map(g => `<tr><td>${esc(g.key)}</td><td class="n">${g.count}</td><td class="n">${inr(g.amount)}</td></tr>`).join('')}</tbody></table>
        <table style="width:60%"><thead><tr><th>Collected By</th><th class="n">Receipts</th><th class="n">Amount</th></tr></thead><tbody>${R.byUser.map(g => `<tr><td>${esc(g.key)}</td><td class="n">${g.count}</td><td class="n">${inr(g.amount)}</td></tr>`).join('')}</tbody></table>`;
    } else {
      const R = buildRegister(filters, o);
      if(!R.groups.length){ showToast('No students match these options.'); return; }
      if(id === 'fee_class_summary'){
        const pc = x => x.payable ? (Math.round(x.paid * 1000 / x.payable) / 10) + '%' : '—';
        body = `<table><thead><tr><th>S.No</th><th>Class</th><th class="n">Students</th><th class="n">With Due</th><th class="n">Total Fee</th><th class="n">Concession</th><th class="n">Payable Fee</th><th class="n">Paid Fee</th><th class="n">Due Amount</th><th class="n">Collected</th></tr></thead><tbody>
          ${R.groups.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.className)}</td><td class="n">${g.subtotal.count}</td><td class="n">${g.subtotal.defaulters}</td><td class="n">${inr(g.subtotal.totalFee)}</td><td class="n">${inr(g.subtotal.concession)}</td><td class="n">${inr(g.subtotal.payable)}</td><td class="n">${inr(g.subtotal.paid)}</td><td class="n due">${inr(g.subtotal.due)}</td><td class="n">${pc(g.subtotal)}</td></tr>`).join('')}
          <tr class="grand"><td colspan="2">Grand Total</td><td class="n">${R.grand.count}</td><td class="n">${R.grand.defaulters}</td><td class="n">${inr(R.grand.totalFee)}</td><td class="n">${inr(R.grand.concession)}</td><td class="n">${inr(R.grand.payable)}</td><td class="n">${inr(R.grand.paid)}</td><td class="n">${inr(R.grand.due)}</td><td class="n">${pc(R.grand)}</td></tr></tbody></table>`;
      } else {
        let n = 1;
        const lastCol = id === 'fee_due_list';
        body = R.groups.map(g => `<div class="cls">Class : ${esc(g.className)}</div>
          <table><thead><tr><th>S.No.</th><th>Student ID</th><th>Roll No.</th><th>Name</th><th>Contact No</th><th class="n">Total Fee</th><th class="n">Concession</th><th class="n">Payable Fee</th><th class="n">Paid Fee</th><th class="n">Due Amount</th>${lastCol ? '<th>Last Paid</th>' : ''}</tr></thead><tbody>
          ${g.students.map(r => `<tr><td>${n++}</td><td>${esc(r.admissionNo)}</td><td>${esc(r.rollNo)}</td><td>${esc(r.name)}${r.excess > 0 ? `<div class="note">Paid ${inr(r.excess)} more than payable</div>` : ''}</td><td>${esc(r.contact)}</td><td class="n">${inr(r.totalFee)}</td><td class="n">${inr(r.concession)}</td><td class="n">${inr(r.payable)}</td><td class="n">${inr(r.paid)}</td><td class="n due">${inr(r.due)}</td>${lastCol ? `<td>${r.lastPaid ? dmy(r.lastPaid) : 'No payment'}</td>` : ''}</tr>`).join('')}
          <tr class="sub"><td colspan="5">Total:</td><td class="n">${inr(g.subtotal.totalFee)}</td><td class="n">${inr(g.subtotal.concession)}</td><td class="n">${inr(g.subtotal.payable)}</td><td class="n">${inr(g.subtotal.paid)}</td><td class="n">${inr(g.subtotal.due)}</td>${lastCol ? '<td></td>' : ''}</tr></tbody></table>`).join('')
          + `<table><tbody><tr class="grand"><td>Grand Total (${R.grand.count} students${R.grand.defaulters ? ', ' + R.grand.defaulters + ' with due' : ''})</td><td class="n">Total Fee ${inr(R.grand.totalFee)}</td><td class="n">Concession ${inr(R.grand.concession)}</td><td class="n">Payable ${inr(R.grand.payable)}</td><td class="n">Paid ${inr(R.grand.paid)}</td><td class="n">Due ${inr(R.grand.due)}</td></tr></tbody></table>`;
      }
    }
    const w = window.open('', '_blank');
    if(!w){ showToast('Your browser blocked the report window — allow pop-ups for this site and try again.'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(TITLES[id])}</title><style>${style}</style></head><body onload="window.print()">${headHtml}${body}</body></html>`);
    w.document.close();
  }

  // ---------- options window ----------
  const DEFAULTS = {
    fee_due_payable_classwise: { show: 'all', sort: 'id' },
    fee_due_list: { show: 'due', sort: 'id' },
    fee_paid_list: { show: 'paid', sort: 'id' },
    fee_class_summary: { show: 'all', sort: 'id' },
    fee_receipts_between: { sort: 'date' },
  };
  function readOptions(id){
    const g = k => document.getElementById('fr2_' + k);
    const types = Object.keys(RT()).filter(c => g('t_' + c) && g('t_' + c).checked);
    const o = {
      types: types.length ? types : Object.keys(RT()),
      asOn: g('asOn') && g('asOn').value && g('asOn').value < todayISO() ? g('asOn').value : '',
      includeInactive: !!(g('inactive') && g('inactive').checked),
      show: (DEFAULTS[id] || {}).show,
      sort: g('sort') ? g('sort').value : (DEFAULTS[id] || {}).sort,
      minDue: g('minDue') ? num(g('minDue').value) : 0,
      user: g('user') ? g('user').value : '', from: g('from') ? g('from').value : '', to: g('to') ? g('to').value : '', mode: g('mode') ? g('mode').value : '',
    };
    if(id === 'fee_due_payable_classwise' && g('show')) o.show = g('show').value;
    return o;
  }
  function currentFilters(base){
    const g = k => document.getElementById('fr2_' + k);
    return Object.assign({}, base, {
      className: g('cls') ? g('cls').value : base.className, section: g('sec') ? g('sec').value : base.section,
    });
  }
  window.fr2Refresh = function(){
    const st = window.__fr2; if(!st) return;
    const box = document.getElementById('fr2_preview'); if(!box) return;
    try{
      const o = readOptions(st.id), f = currentFilters(st.filters);
      if(st.id === 'fee_receipts_between'){
        const R = buildReceipts(f, o);
        box.innerHTML = `<b>${R.total.count}</b> receipts · total <b>₹${inr(R.total.amount)}</b>`;
      } else {
        const R = buildRegister(f, o);
        box.innerHTML = `<b>${R.grand.count}</b> students · Payable ₹${inr(R.grand.payable)} · Paid ₹${inr(R.grand.paid)} · <b style="color:#b3261e">Due ₹${inr(R.grand.due)}</b>${R.grand.defaulters ? ` (${R.grand.defaulters} with due)` : ''}`;
      }
    }catch(e){ box.textContent = ''; }
  };
  window.fr2Run = async function(format){
    const st = window.__fr2; if(!st) return;
    const o = readOptions(st.id), f = currentFilters(st.filters);
    if(st.id === 'fee_receipts_between' && o.from && o.to && o.from > o.to){ showToast('"From" date is after "To" date.'); return; }
    if(st.id === 'fee_receipts_between') o._extra = `${o.from ? dmy(o.from) : 'start'} to ${o.to ? dmy(o.to) : 'today'}${o.mode ? ' · ' + o.mode : ''}${o.user ? ' · by ' + o.user : ''}`;
    if(st.id === 'fee_due_list' && o.minDue) o._extra = 'Due of ₹' + inr(o.minDue) + ' or more';
    if(format === 'excel') await toExcel(st.id, f, o); else toPrint(st.id, f, o);
  };
  window.fr2Close = function(){ const el = document.getElementById('fr2_overlay'); if(el) el.remove(); window.__fr2 = null; };

  function openOptions(id, filters){
    window.fr2Close();
    window.__fr2 = { id, filters };
    const types = RT();
    const isRec = id === 'fee_receipts_between';
    const modes = [...new Set((payments || []).map(p => p.mode).filter(Boolean))].sort();
    const users = [...new Set((payments || []).map(p => p.collectedBy || '—'))].sort();
    const monthStart = (() => { const d = new Date(); d.setDate(1); return iso(d); })();
    const sel = (idn, opts, val) => `<select id="fr2_${idn}" onchange="fr2Refresh()" style="padding:7px 9px;border-radius:8px;border:1.5px solid var(--border);">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const row = (label, inner) => `<div style="display:flex;flex-direction:column;gap:4px;min-width:150px;"><label style="font-size:0.72rem;font-weight:700;color:var(--ink-soft);">${label}</label>${inner}</div>`;
    const date = (idn, v) => `<input type="date" id="fr2_${idn}" value="${v || ''}" onchange="fr2Refresh()" style="padding:7px 9px;border-radius:8px;border:1.5px solid var(--border);">`;
    const ft = filters.feeType;
    const html = `
      <div id="fr2_overlay" style="position:fixed;inset:0;background:rgba(20,16,50,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">
        <div style="background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;">
          <h3 style="margin:0 0 4px;">${esc(TITLES[id])}</h3>
          <p style="margin:0 0 14px;color:var(--ink-soft);font-size:0.8rem;">Choose what to include, check the preview, then download.</p>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">
            ${filters.studentId ? '' : row('Class', sel('cls', [['', 'All classes'], ...CLASS_LEVELS.map(c => [c, c])], filters.className || ''))}
            ${filters.studentId ? '' : row('Section', sel('sec', [['', 'All sections'], ...SECTIONS.map(s => [s, s])], filters.section || ''))}
            ${id === 'fee_due_payable_classwise' ? row('Show', sel('show', [['all', 'All students'], ['due', 'Only students with due'], ['paid', 'Only fully paid'], ['nil', 'Nothing paid yet']], 'all')) : ''}
            ${id === 'fee_due_list' ? row('Minimum due (₹)', `<input type="number" min="0" id="fr2_minDue" value="0" oninput="fr2Refresh()" style="padding:7px 9px;border-radius:8px;border:1.5px solid var(--border);width:130px;">`) : ''}
            ${isRec ? row('From', date('from', monthStart)) + row('To', date('to', todayISO())) + row('Payment mode', sel('mode', [['', 'All modes'], ...modes.map(m => [m, m])], '')) + row('Collected by', sel('user', [['', 'Everyone'], ...users.map(m => [m, m])], '')) : row('As on date', date('asOn', todayISO()))}
            ${row('Sort by', isRec ? sel('sort', [['date', 'Date'], ['receipt', 'Receipt no.']], 'date') : sel('sort', [['id', 'Student ID'], ['roll', 'Section & roll no.'], ['name', 'Name'], ['due', 'Highest due first']], 'id'))}
          </div>
          <div style="margin-bottom:12px;"><div style="font-size:0.72rem;font-weight:700;color:var(--ink-soft);margin-bottom:5px;">Fee types included</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;">${Object.keys(types).map(c => `<label style="font-size:0.82rem;display:flex;gap:5px;align-items:center;"><input type="checkbox" id="fr2_t_${c}" ${(!ft || ft === c) ? 'checked' : ''} onchange="fr2Refresh()"> ${esc(types[c])}</label>`).join('')}</div></div>
          ${isRec ? '' : `<label style="font-size:0.82rem;display:flex;gap:6px;align-items:center;margin-bottom:12px;"><input type="checkbox" id="fr2_inactive" onchange="fr2Refresh()"> Also include inactive students</label>`}
          <div id="fr2_preview" style="padding:10px 12px;border-radius:10px;background:#f4f1fb;font-size:0.82rem;margin-bottom:16px;"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost" onclick="fr2Close()">Cancel</button>
            <button type="button" class="btn btn-ghost" onclick="fr2Run('excel')">📥 Excel</button>
            <button type="button" class="btn btn-primary" onclick="fr2Run('pdf')">🖨 Print / PDF</button>
          </div>
        </div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    fr2Refresh();
  }

  window.generateFeeDuePayableReport = function(id, filters, format){
    if(!TITLES[id]) id = 'fee_due_payable_classwise';
    openOptions(id, filters || {});
  };

  // ---------- register in the Reports menu ----------
  (function register(){
    const add = [
      { id: 'fee_due_list', category: 'Accounts', name: 'Fee Due List — Defaulters (Student-wise)', icon: '⚠️', scopable: 'student', special: true,
        desc: 'Only students who still owe fees, grouped by class with contact number, last payment date and class totals. Choose class, fee types, minimum due and an "as on" date.' },
      { id: 'fee_paid_list', category: 'Accounts', name: 'Fully Paid Students', icon: '✅', scopable: 'student', special: true,
        desc: 'Students whose payable fee is fully paid, class-wise, with totals.' },
      { id: 'fee_class_summary', category: 'Accounts', name: 'Class-wise Fee Summary', icon: '🏫', scopable: 'student', special: true,
        desc: 'One line per class: students, students with due, total fee, concession, payable, paid, due and % collected — plus a grand total.' },
      { id: 'fee_receipts_between', category: 'Accounts', name: 'Fee Receipts Between Dates', icon: '🧾', scopable: 'student', special: true,
        desc: 'Every receipt in a date range (receipt no., student, fee type, mode, amount) with day-wise, mode-wise and fee-type totals.' },
    ];
    if(typeof REPORT_LIBRARY === 'undefined') return;
    const at = REPORT_LIBRARY.findIndex(r => r.id === 'fee_due_payable_classwise');
    const existing = new Set(REPORT_LIBRARY.map(r => r.id));
    const toAdd = add.filter(a => !existing.has(a.id));
    REPORT_LIBRARY.splice(at >= 0 ? at + 1 : REPORT_LIBRARY.length, 0, ...toAdd);
    const base = REPORT_LIBRARY.find(r => r.id === 'fee_due_payable_classwise');
    if(base) base.desc = 'Every student grouped by class with Total Fee, Concession, Fee Payable, Fee Paid and Due — class totals and a grand total, in your standard fee register format. Pick filters, check the preview, then Excel or Print / PDF.';
  })();

  // exposed for tests
  window.__feeReports = { buildRegister, buildReceipts, studentFigures };
})();
