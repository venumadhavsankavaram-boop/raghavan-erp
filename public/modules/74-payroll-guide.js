/* 74 — Payroll: "Month-end payroll" guide strip. Shows the four steps in order with live status for the chosen month.
   Read-only: it changes no data and blocks nothing; the buttons only open the screens/rows that already exist. */
(function () {
  'use strict';
  if (typeof renderStaffPayrollTab !== 'function') return;
  const orig = renderStaffPayrollTab;
  const fmt = v => (typeof fmtMoney === 'function' ? fmtMoney(v) : '₹' + v);
  let open = false;
  try { open = sessionStorage.getItem('prgOpen') === '1'; } catch (e) {}

  function stats() {
    const m = staffPayrollMonth;
    const deptF = document.getElementById('staffDeptFilter') ? document.getElementById('staffDeptFilter').value : '';
    const list = payrollStaffList().filter(st => !deptF || st.department === deptF);
    let marked = 0, drafts = 0, approved = 0, adv = 0, advN = 0;
    list.forEach(st => {
      try { const pp = typeof payrollPeriod === 'function' ? payrollPeriod(m) : { from: m + '-01', to: m + '-31' }; if (computeStaffAttendanceStats(st.id, pp.from, pp.to).total > 0) marked++; } catch (e) {}
      const d = staffPayrollRowData(st.id, m);
      if (d.rec && d.rec.status === 'Approved') approved++; else if (d.rec) drafts++;
      const a = Number(d.preview && d.preview.advanceDeduction) || 0; if (a > 0) { adv += a; advN++; }
    });
    return { n: list.length, marked, drafts, approved, adv, advN };
  }

  window.togglePayrollGuide = function () {
    open = !open; try { sessionStorage.setItem('prgOpen', open ? '1' : '0'); } catch (e) {}
    const b = document.getElementById('prgBox'); if (b) b.outerHTML = html();
  };

  function html() {
    const s = stats(), left = s.n - s.approved;
    const steps = [
      { ok: s.n > 0 && s.marked === s.n, t: 'Attendance', d: s.marked + ' of ' + s.n + ' staff have attendance marked this month.', a: ['Open Staff Attendance', "switchView('staffattendance')"] },
      { ok: true, t: 'Advances', d: s.advN ? s.advN + (s.advN === 1 ? ' staff member has' : ' staff have') + ' an advance recovered this month — ' + fmt(s.adv) + ' is deducted automatically.' : 'No advance to recover this month.', a: null },
      { ok: s.n > 0 && s.drafts + s.approved === s.n, t: 'Review', d: 'Check each row — add bonus or other deductions, then press Save Draft. ' + (s.drafts + s.approved) + ' of ' + s.n + ' reviewed.', a: null },
      { ok: s.n > 0 && s.approved === s.n, t: 'Approve & pay', d: s.approved + ' of ' + s.n + ' approved' + (left > 0 ? ' — ' + left + ' left. Approved rows lock and the salary is booked in Accounting.' : ' — payroll for this month is complete. Print payslips from each row.'), a: null },
    ];
    const firstOpen = steps.findIndex(x => !x.ok);
    const bar = steps.map((x, i) => `<div style="flex:1;min-width:0;text-align:center;border-top:4px solid ${x.ok ? '#1b7f4b' : i === firstOpen ? 'var(--magenta,#c2185b)' : '#e3e0f0'};padding-top:6px;font-size:.78rem;font-weight:700;color:${x.ok ? '#1b7f4b' : i === firstOpen ? 'var(--magenta,#c2185b)' : 'var(--ink-soft,#5b5a73)'}">${x.ok ? '✓ ' : (i + 1) + '. '}${x.t}</div>`).join('');
    const mLabel = new Date(staffPayrollMonth + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const head = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><b style="color:var(--navy,#1a1a4b)">🧾 Month-end payroll — ${mLabel}</b> <span style="font-size:.82rem;color:var(--ink-soft,#5b5a73)">${s.approved === s.n && s.n ? 'All done ✓' : 'Four steps, in order.'}</span></div><button type="button" onclick="togglePayrollGuide()" style="background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer">${open ? 'Hide steps' : 'Show steps'}</button></div>`;
    const body = open ? `<div style="display:flex;gap:6px;margin-top:10px">${bar}</div><ol style="margin:12px 0 0 18px;padding:0;font-size:.86rem;color:var(--ink-soft,#5b5a73);line-height:1.6">${steps.map(x => `<li style="${x.ok ? 'color:#1b7f4b' : ''}"><b>${x.t}:</b> ${x.d}${x.a ? ` <button type="button" onclick="${x.a[1]}" style="background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer;padding:0">${x.a[0]} →</button>` : ''}</li>`).join('')}</ol>` : '';
    return `<div id="prgBox" style="margin:0 0 16px;border:1.5px solid var(--border,#e3e0f0);border-radius:16px;background:#fff;padding:12px 16px">${head}${body}</div>`;
  }

  renderStaffPayrollTab = function (body) {
    orig(body);
    try { document.querySelectorAll('#prgBox').forEach(e => e.remove()); body.insertAdjacentHTML('afterbegin', html()); } catch (e) {}
  };
})();
