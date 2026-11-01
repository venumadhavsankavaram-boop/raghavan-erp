/* ============================================================================
   Fee dues for the class teacher (own class only) + Admin switch.
   * Teacher "My Day": a "Fee reminders" card for the class teacher, only when the Admin has switched it on.
     Shows name, admission no., pending amount and days overdue; "Remind parent" sends a fixed polite message.
   * Admin/Principal: a small switch + "days overdue" box at the top of Manage Fee.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMgr = () => { try { return !!currentUser && ['Admin','Principal'].includes(currentUser.role); } catch(e){ return false; } };
  const money = n => { try{ return (typeof fmtMoney === 'function') ? fmtMoney(n) : '₹' + Number(n || 0).toLocaleString('en-IN'); }catch(e){ return '₹' + n; } };
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; throw err; }
    return j;
  }

  /* ---------- Teacher side ---------- */
  let feeData = null;
  function lastText(iso){
    if(!iso) return '';
    const d = new Date(iso); if(isNaN(d)) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? 'Reminded today' : 'Reminded ' + days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }
  function draw(slot){
    const d = feeData; if(!d || !d.enabled){ slot.innerHTML = ''; return; }
    const rows = d.students.map(s => {
      const recent = s.lastReminded && (Date.now() - new Date(s.lastReminded).getTime()) < 3 * 86400000;
      return `<div class="md-row">
        <div class="md-main"><b>${esc(s.name)}</b><div class="md-sm">${s.admissionNo ? 'Adm. ' + esc(s.admissionNo) + ' · ' : ''}${s.daysOverdue} days overdue${s.lastReminded ? ' · ' + esc(lastText(s.lastReminded)) : ''}</div></div>
        <div style="font-weight:700;">${esc(money(s.amount))}</div>
        <div class="md-actions"><button class="btn btn-ghost btn-sm" ${recent ? 'disabled' : ''} onclick="classFeeRemind('${esc(s.id)}')">${recent ? 'Reminded' : 'Remind parent'}</button></div>
      </div>`;
    }).join('');
    slot.innerHTML = `<div class="md-card"><h3>Fee reminders — ${esc(d.className)} · Section ${esc(d.section)} ${d.students.length ? `<span class="md-pill">${d.students.length}</span>` : ''}</h3>
      ${rows || '<div class="md-empty">No student in your class is overdue by ' + d.minDaysOverdue + '+ days. 🎉</div>'}
      ${rows ? '<div class="md-sm" style="margin-top:8px;">Only you can see this. "Remind parent" sends a standard polite message to the parent login. Please do not discuss dues in class.</div>' : ''}</div>`;
  }
  window.classFeeRemind = async function(id){
    const slot = $('myDayFeeSlot'); if(!slot) return;
    const s = feeData && feeData.students.find(x => x.id === id);
    const ok = (typeof showConfirmDialog === 'function')
      ? await showConfirmDialog('Send a standard fee reminder to ' + (s ? s.name : 'this student') + "'s parent login?", { title: 'Remind parent', okText: 'Send', cancelText: 'Cancel' })
      : true;
    if(!ok) return;
    try{
      await api('POST', '/api/class-fee-dues/remind', { studentId: id });
      if(typeof showToast === 'function') showToast('Reminder sent to the parent.');
      if(s) s.lastReminded = new Date().toISOString();
    }catch(e){ if(typeof showToast === 'function') showToast(e.message); }
    draw(slot);
  };
  window.myDayAfterRender = async function(el, scope){
    const slot = $('myDayFeeSlot');
    if(!slot || !scope || !scope.classTeacherOf) return;
    try{ feeData = await api('GET', '/api/class-fee-dues'); draw(slot); }catch(e){ slot.innerHTML = ''; }
  };

  /* ---------- Admin / Principal switch (top of Manage Fee) ---------- */
  async function adminCard(){
    if(!isMgr()) return;
    const host = $('view-managefee'); if(!host) return;
    let card = $('teacherFeeCard');
    if(!card){
      card = document.createElement('div'); card.id = 'teacherFeeCard';
      card.style.cssText = 'background:#fff;border:1px solid #e3e8f3;border-radius:14px;padding:12px 16px;margin:0 0 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';
      host.insertBefore(card, host.firstChild);
    }
    let st; try{ st = (await api('GET', '/api/teacher-fee-settings')).settings; }catch(e){ card.style.display = 'none'; return; }
    const paint = () => {
      card.innerHTML = `<div style="flex:1;min-width:220px;"><b>Class teachers can see overdue fees of their own class</b><div style="font-size:0.82rem;color:#667;">Name, pending amount and days overdue only, plus a "Remind parent" button. Off by default.</div></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;"><input type="checkbox" id="tfcOn" ${st.enabled ? 'checked' : ''}> ${st.enabled ? 'On' : 'Off'}</label>
        <label style="font-size:0.85rem;">Show after <input type="number" id="tfcDays" min="1" max="90" value="${st.minDaysOverdue}" style="width:60px;"> days overdue</label>`;
      const save = async () => {
        try{ st = (await api('PUT', '/api/teacher-fee-settings', { enabled: $('tfcOn').checked, minDaysOverdue: $('tfcDays').value })).settings; if(typeof showToast === 'function') showToast('Saved'); }
        catch(e){ if(typeof showToast === 'function') showToast(e.message); }
        paint();
      };
      $('tfcOn').onchange = save; $('tfcDays').onchange = save;
    };
    paint();
  }
  if(typeof switchView === 'function'){
    const o = switchView;
    window.switchView = function(view){
      const r = o.apply(this, arguments);
      if(view === 'managefee'){ try{ adminCard(); }catch(e){} }
      return r;
    };
  }
})();
