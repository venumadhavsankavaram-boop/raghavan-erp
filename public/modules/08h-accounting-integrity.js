/* ============================================================================
   Money Check - accounting integrity for fee collections (read-only scan + guarded repair)

   WHY: accounting is the heart of the ERP, so when money records stop agreeing with each
   other the school must hear about it straight away, in plain words, not find out at
   year-end. This module only READS the data already loaded in the browser. The one thing
   it can change is a fee row's "paid so far" figure, and only when an Admin confirms.

   Checks (each one is a rule the books must always satisfy):
     1. Duplicate receipt line  - the same fee line twice on one receipt number
     2. Extra-fee paid mismatch - the fee row says paid X, active receipts add up to Y
     3. Over-collection         - active receipts for a fee add up to more than the fee
     4. Orphan payment          - a receipt points to a fee row / student that is gone
     5. Bad record              - zero/negative amount, impossible or future date
     6. Voided without reason   - audit trail incomplete
   Server side, the same rules 1 and 3 now refuse the save (see checkPaymentRules in server.js).
   ============================================================================ */
(function(){
  'use strict';

  var AC_SEV = { bad: 3, warn: 2, info: 1 };

  function acNum(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function acIsActive(p){ return !p.voided; }                     // 0 / null / false / '' => active
  function acEsc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function acMoney(n){ try{ return (typeof fmtMoney === 'function') ? fmtMoney(n) : 'Rs ' + n; }catch(e){ return 'Rs ' + n; } }
  function acToday(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* Pure function: takes the loaded arrays, returns a list of issues. No DOM, no network. */
  function acScan(data){
    var pays = (data && data.payments) || [];
    var fees = (data && data.extraFees) || [];
    var studs = (data && data.students) || [];
    var today = (data && data.today) || acToday();
    var issues = [];
    var studentById = {}; studs.forEach(function(s){ studentById[s.id] = s; });
    var feeById = {}; fees.forEach(function(f){ feeById[f.id] = f; });
    function nameOf(p){ var s = studentById[p.studentId]; return (s && (s.name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim())) || p.studentName || '(unknown student)'; }
    function add(sev, code, title, detail, extra){ var o = { sev: sev, code: code, title: title, detail: detail }; if(extra) for(var k in extra) o[k] = extra[k]; issues.push(o); }

    var active = pays.filter(acIsActive);

    // 1. same receipt line twice
    var lines = {};
    active.forEach(function(p){
      var k = [p.receiptNo || '', p.studentId || '', p.category || '', p.extraFeeId || '', p.instalment || ''].join('|');
      (lines[k] = lines[k] || []).push(p);
    });
    Object.keys(lines).forEach(function(k){
      var g = lines[k]; if(g.length < 2 || !g[0].receiptNo) return;
      add('bad', 'DUP_RECEIPT_LINE', 'Receipt ' + g[0].receiptNo + ' is counted ' + g.length + ' times for ' + nameOf(g[0]),
        g.map(function(p){ return (p.extraFeeName || p.category) + ' ' + acMoney(acNum(p.amount)) + ' on ' + (p.date || '?'); }).join('  |  ') + '. Keep the genuine one and void the other.',
        { studentId: g[0].studentId, paymentIds: g.map(function(p){ return p.id; }) });
    });

    // 2 + 3. extra fee paid vs receipts
    var sumByFee = {};
    active.forEach(function(p){ if(p.category === 'extra' && p.extraFeeId) sumByFee[p.extraFeeId] = (sumByFee[p.extraFeeId] || 0) + acNum(p.amount); });
    fees.forEach(function(f){
      var got = Math.round((sumByFee[f.id] || 0) * 100) / 100, amt = acNum(f.amount), stored = Math.round(acNum(f.paidAmount) * 100) / 100;
      var st = studentById[f.studentId]; var who = st ? (st.name || ((st.firstName || '') + ' ' + (st.lastName || '')).trim()) : '(unknown student)';
      if(amt > 0 && got > amt + 0.009){
        add('bad', 'OVER_COLLECTED', who + ': "' + f.name + '" collected ' + acMoney(got) + ' on a ' + acMoney(amt) + ' fee',
          'Receipts add up to more than the fee. One of them is probably a duplicate - void it.', { studentId: f.studentId, feeId: f.id });
      }
      if(Math.abs(got - stored) > 0.009){
        add('warn', 'EXTRA_PAID_MISMATCH', who + ': "' + f.name + '" shows paid ' + acMoney(stored) + ' but receipts add up to ' + acMoney(got),
          'The fee row and the receipts disagree, so the Extra Fees tab and the Dashboard may show different totals.' + ((amt > 0 && got > amt + 0.009) ? ' Void the duplicate receipt first, then run this check again.' : ''),
          { studentId: f.studentId, feeId: f.id, should: got,
            // Never "repair" up to a doubled figure: if receipts exceed the fee, void the duplicate first.
            repairable: !(amt > 0 && got > amt + 0.009) });
      }
    });

    // 4. orphans
    Object.keys(sumByFee).forEach(function(id){
      if(!feeById[id]){
        var p = active.filter(function(x){ return x.extraFeeId === id; })[0];
        add('warn', 'ORPHAN_EXTRA_PAYMENT', 'Receipt ' + (p && p.receiptNo) + ' points to a fee that no longer exists',
          nameOf(p) + ' - ' + acMoney(sumByFee[id]) + '. The money is counted, but the fee line it belonged to is missing.', { studentId: p && p.studentId });
      }
    });
    active.forEach(function(p){
      if(!studentById[p.studentId]){
        add('warn', 'ORPHAN_STUDENT_PAYMENT', 'Receipt ' + p.receiptNo + ' belongs to a student who is not in the list',
          (p.studentName || '?') + ' - ' + acMoney(acNum(p.amount)) + ' on ' + (p.date || '?') + '. Was the student record deleted?', { paymentIds: [p.id] });
      }
    });

    // 5. bad records
    active.forEach(function(p){
      if(!(acNum(p.amount) > 0)){
        add('warn', 'BAD_AMOUNT', 'Receipt ' + p.receiptNo + ' has an amount of ' + acMoney(acNum(p.amount)), nameOf(p) + ' - ' + (p.extraFeeName || p.category) + '.', { studentId: p.studentId });
      }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')){
        add('warn', 'BAD_DATE', 'Receipt ' + p.receiptNo + ' has no valid date', nameOf(p) + ' - date reads "' + (p.date || '') + '".', { studentId: p.studentId });
      } else if(p.date > today){
        add('warn', 'FUTURE_DATE', 'Receipt ' + p.receiptNo + ' is dated in the future (' + p.date + ')', nameOf(p) + '. Check the date was typed correctly.', { studentId: p.studentId });
      }
    });

    // 6. audit trail
    pays.forEach(function(p){
      if(p.voided && !String(p.voidReason || '').trim()){
        add('info', 'VOID_NO_REASON', 'Voided receipt ' + p.receiptNo + ' has no reason recorded', nameOf(p) + ' - ' + acMoney(acNum(p.amount)) + '.', { studentId: p.studentId });
      }
    });

    issues.sort(function(a, b){ return AC_SEV[b.sev] - AC_SEV[a.sev]; });
    return issues;
  }

  function acData(){
    return {
      payments: (typeof payments !== 'undefined') ? payments : [],
      extraFees: (typeof studentExtraFees !== 'undefined') ? studentExtraFees : [],
      students: (typeof students !== 'undefined') ? students : [],
      today: acToday()
    };
  }
  function acCanSee(){ try{ return typeof isManagementUser === 'function' ? !!isManagementUser() : (currentUser && /admin|principal/i.test(currentUser.role || '')); }catch(e){ return false; } }

  /* ---------- UI ---------- */
  var acLast = [];
  function acBtn(){ return document.getElementById('acMoneyCheckBtn'); }
  function acPaintBadge(){
    var b = acBtn(); if(!b) return;
    if(!acData().payments.length){ b.textContent = '🛡 Money Check'; b.style.color = ''; return; }
    acLast = acScan(acData());
    var bad = acLast.filter(function(i){ return i.sev === 'bad'; }).length, rest = acLast.length - bad;
    if(!acLast.length){ b.textContent = '🛡 Money Check ✓'; b.style.color = '#1a7f4b'; b.title = 'All fee records agree. Click to run the check again.'; }
    else { b.textContent = '⚠ Money Check: ' + acLast.length; b.style.color = bad ? '#c0392b' : '#b9770e'; b.title = bad + ' serious, ' + rest + ' to review. Click to see them.'; }
  }
  function acInjectButton(){
    if(!acCanSee() || acBtn()) return;
    var anchor = document.getElementById('mfAyBadge'); if(!anchor || !anchor.parentNode) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'acMoneyCheckBtn'; b.className = 'btn btn-ghost'; b.textContent = '🛡 Money Check';
    b.onclick = function(){ acOpen(); };
    anchor.parentNode.insertBefore(b, anchor);
  }
  function acOpen(){
    var data = acData(); acLast = acScan(data);
    var old = document.getElementById('acMoneyCheckOverlay'); if(old) old.remove();
    var ov = document.createElement('div'); ov.id = 'acMoneyCheckOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(20,16,40,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.onclick = function(e){ if(e.target === ov) ov.remove(); };
    var bad = acLast.filter(function(i){ return i.sev === 'bad'; }).length;
    var rows = acLast.map(function(i, ix){
      var col = i.sev === 'bad' ? '#c0392b' : i.sev === 'warn' ? '#b9770e' : '#5d6d7e';
      var lab = i.sev === 'bad' ? 'SERIOUS' : i.sev === 'warn' ? 'REVIEW' : 'NOTE';
      var fix = (i.repairable && acCanSee()) ? '<button type="button" class="btn btn-ghost" style="margin-top:6px;" onclick="acRepairPaid(' + ix + ')">Set paid to ' + acEsc(acMoney(i.should)) + ' (matches receipts)</button>' : '';
      return '<div style="border:1.5px solid var(--border);border-left:5px solid ' + col + ';border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;">' +
        '<div style="font-size:.66rem;font-weight:800;letter-spacing:.06em;color:' + col + ';">' + lab + '</div>' +
        '<div style="font-weight:700;color:var(--navy);margin:2px 0;">' + acEsc(i.title) + '</div>' +
        '<div style="font-size:.8rem;color:var(--ink-soft);">' + acEsc(i.detail) + '</div>' + fix + '</div>';
    }).join('');
    var active = data.payments.filter(acIsActive);
    var total = active.reduce(function(s, p){ return s + acNum(p.amount); }, 0);
    ov.innerHTML = '<div style="background:var(--cream,#fffaf2);border-radius:16px;max-width:760px;width:100%;max-height:88vh;overflow:auto;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div><h3 style="margin:0;color:var(--navy);">🛡 Money Check</h3>' +
      '<div style="font-size:.78rem;color:var(--ink-soft);margin-top:2px;">Checked ' + active.length + ' active receipts (' + acEsc(acMoney(total)) + ') and ' + data.extraFees.length + ' extra-fee lines just now.</div></div>' +
      '<button type="button" class="btn btn-ghost" onclick="document.getElementById(\'acMoneyCheckOverlay\').remove()">Close</button></div>' +
      '<div style="margin:14px 0;padding:12px 14px;border-radius:12px;font-weight:700;background:' + (acLast.length ? (bad ? '#fdecea' : '#fef5e7') : '#e8f6ef') + ';color:' + (acLast.length ? (bad ? '#c0392b' : '#b9770e') : '#1a7f4b') + ';">' +
      (acLast.length ? (acLast.length + ' thing(s) need your eyes' + (bad ? ' - ' + bad + ' serious' : '') + '.') : '✓ Everything agrees. No duplicates, no mismatches.') + '</div>' + rows +
      '<div style="font-size:.72rem;color:var(--ink-soft);margin-top:8px;">This check only reads your records. The one button above changes a fee row’s "paid" figure to match its receipts, after you confirm.</div></div>';
    document.body.appendChild(ov);
  }
  window.acRepairPaid = async function(ix){
    var i = acLast[ix]; if(!i || !i.repairable || !acCanSee()) return;
    var f = (typeof studentExtraFees !== 'undefined' ? studentExtraFees : []).filter(function(x){ return x.id === i.feeId; })[0]; if(!f) return;
    var ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog('Change "' + f.name + '" paid amount from ' + acMoney(acNum(f.paidAmount)) + ' to ' + acMoney(i.should) + '?\n\nThis only makes the fee row agree with its active receipts. No receipt is changed.', { title: 'Repair paid amount', okText: 'Repair' }) : true;
    if(!ok) return;
    f.paidAmount = i.should; f.paid = acNum(f.amount) > 0 && f.paidAmount >= acNum(f.amount);
    try{ await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees); if(typeof showToast === 'function') showToast('Paid amount repaired.', 'burst'); }
    catch(e){ if(typeof showToast === 'function') showToast('Could not save the repair (' + e.message + ').'); }
    try{ if(typeof renderDashboard === 'function') renderDashboard(); if(typeof renderFeeBody === 'function') renderFeeBody(); }catch(e){}
    acOpen(); acPaintBadge();
  };

  /* Hooks. The functions below are defined by other modules that may load after this file, so the
     hooks are installed immediately if possible and again once every script has run (window load). */
  var acHooked = { save: false, render: false };
  function acHook(){
    /* Business-rule refusals from the server (code 'RULE') must show the real reason, not "internet dropped". */
    if(!acHooked.save && typeof saveKeySafely === 'function'){
      acHooked.save = true;
      saveKeySafely = async function(key, arr, what){
        window.__saveRejected = null;
        var ok = await storageSet(key, arr);
        while(ok === false){
          if(window.__saveRejected){
            var msg = window.__saveRejected; window.__saveRejected = null;
            if(typeof showConfirmDialog === 'function') await showConfirmDialog(msg, { title: 'Not saved - accounting rule', okText: 'OK', cancelText: 'Close' });
            return false;
          }
          var retry = await showConfirmDialog(
            (what || 'This entry') + ' could NOT be saved to the server \u2014 most likely the internet connection dropped. ' +
            'Check the connection, then press "Retry save".',
            { title: 'Not saved yet', okText: 'Retry save', cancelText: 'Stop \u2014 do not save' });
          if(!retry) return false;
          ok = await storageSet(key, arr);
        }
        return true;
      };
    }
    /* Keep the badge fresh whenever the fee screen redraws. */
    if(!acHooked.render && typeof renderFeeBody === 'function'){
      acHooked.render = true;
      var _rfb = renderFeeBody, tmr = null;
      renderFeeBody = function(){
        var r = _rfb.apply(this, arguments);
        clearTimeout(tmr); tmr = setTimeout(function(){ try{ acPaintReceiptStrip(); }catch(e){} try{ acInjectButton(); acPaintBadge(); }catch(e){} }, 400);
        return r;
      };
    }
  }

  /* ---------- the latest receipt numbers, always visible on the fee page ---------- */
  var acSeen = null, acSeenAt = 0;
  function acRecNo(no){ var m = /(\d+)$/.exec(String(no || '')); return m ? parseInt(m[1], 10) : 0; }
  function acPaintReceiptStrip(){
    var host = document.getElementById('feeBody'); if(!host || !host.parentNode) return;
    var bar = document.getElementById('acReceiptStrip');
    if(!bar){
      bar = document.createElement('div'); bar.id = 'acReceiptStrip';
      bar.style.cssText = 'margin:8px 0 12px;padding:9px 12px;border-radius:10px;font-size:.86rem;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;border:1px solid #e3def7;background:#f6f3ff;color:#2b2150;';
      host.parentNode.insertBefore(bar, host);
    }
    var list = (typeof payments !== 'undefined' && Array.isArray(payments)) ? payments : [];
    var prefix = ''; try{ if(typeof receiptPrefix === 'function') prefix = receiptPrefix(); }catch(e){}
    var by = new Map();
    list.forEach(function(p){
      if(!p || !p.receiptNo) return;
      var no = String(p.receiptNo); if(prefix && no.indexOf(prefix) !== 0) return;
      var n = acRecNo(no); if(!n) return;
      var e = by.get(no); if(!e){ e = { no: no, n: n, who: p.studentName || '', amt: 0, live: false, date: p.date || '' }; by.set(no, e); }
      if(!p.voided){ e.live = true; e.amt += Number(p.amount) || 0; e.who = p.studentName || e.who; e.date = p.date || e.date; }
    });
    var arr = Array.from(by.values()).sort(function(a, b){ return b.n - a.n; }).slice(0, 3);
    if(!arr.length){ bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    if(acSeen && arr[0].no !== acSeen) acSeenAt = Date.now();
    acSeen = arr[0].no;
    var fresh = acSeenAt && (Date.now() - acSeenAt) < 90000;
    bar.style.background = fresh ? '#e8f7ee' : '#f6f3ff'; bar.style.borderColor = fresh ? '#9fd8b4' : '#e3def7';
    var money = function(v){ try{ return typeof fmtMoney === 'function' ? fmtMoney(v) : String(v); }catch(e){ return String(v); } };
    var esc = function(t){ return String(t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); };
    bar.innerHTML = '<b>' + (fresh ? '✔ Receipt issued: ' : '🧾 Latest receipts: ') + '</b>' + arr.map(function(e, i){
      return '<span' + (i === 0 ? ' style="font-weight:700"' : '') + '>' + esc(e.no) + (e.live ? '' : ' (void)') + ' <span style="opacity:.75">· ' + esc(e.who) + ' · ' + (e.live ? money(e.amt) : 'voided') + '</span></span>';
    }).join('<span style="opacity:.4">|</span>');
  }

  acHook();
  window.addEventListener('load', acHook);
  document.addEventListener('DOMContentLoaded', acHook);

  window.acScan = acScan; window.acOpenMoneyCheck = acOpen;
})();
