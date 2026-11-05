/* Auto clean-up of old messages (Admin): a card under "Automatic backups" where the Admin picks, for each kind of
   message, whether the server deletes old ones by itself and after how many days. Everything is OFF until switched on. */
(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  const HELP = {
    notifications: 'The bell / phone alerts parents, students and staff have received.',
    notices: 'Old notices and messages in Communications (this also removes them from the school website).',
    requests: 'Password-reset and attendance/marks correction requests that are already finished.',
    sentlog: 'The server’s private note of which fee reminders were already sent. Keep this long, or reminders may be sent twice.'
  };
  async function api(method, body){
    const r = await fetch('/api/cleanup' + (body === 'run' ? '/run' : ''), { method: body === 'run' ? 'POST' : method, headers: {'Content-Type':'application/json'}, body: (body && body !== 'run') ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if(!r.ok) throw new Error(d.error || ('HTTP ' + r.status)); return d;
  }
  function draw(card, d){
    const box = card.querySelector('#cuBody');
    const rows = Object.keys(d.items).map(k => {
      const it = d.items[k];
      return '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">' +
        '<label style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><input type="checkbox" data-k="' + k + '" class="cuOn"' + (it.on ? ' checked' : '') + '> <b>' + esc(it.label) + '</b>' +
        '<span style="margin-left:auto;font-size:0.8rem;">delete older than <input type="number" class="cuDays" data-k="' + k + '" min="' + it.min + '" max="3650" value="' + it.days + '" style="width:70px;padding:4px 6px;border:1px solid var(--border);border-radius:8px;"> days</span></label>' +
        '<div style="font-size:0.75rem;color:var(--ink-soft);margin-top:4px;">' + esc(HELP[k] || '') + ' (shortest allowed: ' + it.min + ' days) · <b>' + Number(it.old).toLocaleString('en-IN') + '</b> old item(s) right now · space used by all of these now: <b>' + (it.kb >= 1024 ? (it.kb / 1024).toFixed(1) + ' MB' : (it.kb || 0) + ' KB') + '</b></div></div>';
    }).join('');
    let last = '';
    if(d.last && d.last.at) last = 'Last clean-up: ' + new Date(d.last.at).toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) + ' · removed ' + Number(d.last.total || 0).toLocaleString('en-IN') + ' item(s).';
    box.innerHTML = rows + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn btn-primary btn-sm" id="cuSave">Save</button><button class="btn btn-sm" id="cuRun">Clean up now</button><span style="font-size:0.78rem;color:var(--ink-soft);">' + esc(last) + '</span></div>';
    const collect = () => { const o = {}; box.querySelectorAll('.cuOn').forEach(c => { o[c.dataset.k] = { on: c.checked, days: Number(box.querySelector('.cuDays[data-k="' + c.dataset.k + '"]').value) }; }); return o; };
    box.querySelector('#cuSave').onclick = async () => {
      try{ await api('PUT', collect()); if(window.showToast) showToast('Clean-up settings saved.'); load(card); }catch(e){ if(window.showToast) showToast('Could not save (' + e.message + ').'); }
    };
    box.querySelector('#cuRun').onclick = async () => {
      let go = true; try{ go = await showConfirmDialog('Delete the old items for every switched-ON type now? This cannot be undone (a backup copy from last night is on the server).'); }catch(e){}
      if(!go) return;
      try{ await api('PUT', collect()); const r = await api('POST', 'run'); if(window.showToast) showToast('Removed ' + Number(r.total).toLocaleString('en-IN') + ' old item(s).'); load(card); }catch(e){ if(window.showToast) showToast('Could not clean up (' + e.message + ').'); }
    };
  }
  async function load(card){
    try{ draw(card, await api('GET')); }catch(e){ card.querySelector('#cuBody').textContent = 'Could not load (' + e.message + ').'; }
  }
  function mount(){
    if(typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'Admin') return;
    const anchor = document.getElementById('autoBackupCard');
    if(!anchor || document.getElementById('autoCleanupCard')) return;
    const card = document.createElement('div');
    card.id = 'autoCleanupCard'; card.className = anchor.className; card.style.marginTop = '14px';
    card.innerHTML = '<h3 style="margin:0 0 4px;">Auto clean-up of old messages</h3>' +
      '<div style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:10px;">Keeps the system light. Tick a type and choose how many days to keep; the server then deletes older ones by itself every night. Nothing is deleted until you tick it and press Save. Student, fee, attendance and marks records are never touched here.</div>' +
      '<div id="cuBody">Loading…</div>';
    anchor.insertAdjacentElement('afterend', card);
    load(card);
  }
  setInterval(mount, 1500);
})();
