/* Automatic server backups (Admin): adds a card under the "Download Backup" box listing the copies the server
   saves by itself every night (last 30), with "Take one now" and a download link on each. Look-and-feel only; data
   comes from /api/backup/auto. Does nothing for non-Admins. */
(function(){
  function fmtSize(b){ return b >= 1048576 ? (b/1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b/1024)) + ' KB'; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  async function load(card){
    const list = card.querySelector('#autoBackupList');
    try{
      const r = await fetch('/api/backup/auto'); if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      renderSettings(card, d.settings);
      if(!d.backups.length){ list.innerHTML = '<span style="color:var(--ink-soft);">No copy yet — the first one is saved automatically at the time set above, or press “Take one now”.</span>'; return; }
      list.innerHTML = '<div style="color:var(--ink-soft);margin-bottom:6px;">Newest first · the server keeps the last ' + d.keep + '</div>' +
        '<div style="max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:10px;"><table style="width:100%;font-size:0.78rem;"><tbody>' +
        d.backups.map(b => '<tr><td style="padding:5px 10px;">' + esc(new Date(String(b.at).replace(' ','T') + (/Z$/.test(String(b.at))?'':'Z')).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) +
          ' <span style="opacity:.6">' + (b.kind === 'manual' ? '(taken by hand)' : '(automatic)') + '</span></td><td style="padding:5px 10px;text-align:right;">' + Number(b.rows).toLocaleString('en-IN') + ' records · ' + fmtSize(b.bytes) +
          '</td><td style="padding:5px 10px;text-align:right;"><a href="#" data-bk="' + b.id + '" data-day="' + esc(b.day) + '" style="color:var(--teal);font-weight:600;">Download</a></td></tr>').join('') + '</tbody></table></div>';
    }catch(e){ list.textContent = 'Could not load (' + e.message + ').'; }
  }
  function renderSettings(card, st){
    const box = card.querySelector('#autoBackupSettings'); if(!box || !st) return;
    const sel = 'padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface,#fff);color:inherit;';
    box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;">' +
      '<b style="color:' + (st.enabled ? 'var(--teal)' : 'var(--magenta)') + ';">' + (st.enabled ? '● Automatic backup is ON' : '○ Automatic backup is STOPPED') + '</b>' +
      '<button class="btn btn-sm" id="abToggle">' + (st.enabled ? 'Stop' : 'Start') + '</button>' +
      '<label style="font-size:0.78rem;">Time <input type="time" id="abTime" value="' + st.time + '" style="' + sel + '"></label>' +
      '<label style="font-size:0.78rem;">How often <select id="abEvery" style="' + sel + '">' + [[1,'Every day'],[2,'Every 2 days'],[3,'Every 3 days'],[7,'Every week']].map(o => '<option value="' + o[0] + '"' + (o[0] === st.everyDays ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<label style="font-size:0.78rem;">Keep last <select id="abKeep" style="' + sel + '">' + [7,14,30,60,90].map(n => '<option' + (n === st.keep ? ' selected' : '') + '>' + n + '</option>').join('') + '</select> copies</label>' +
      '<button class="btn btn-primary btn-sm" id="abSave">Save</button></div>';
    const save = async function(patch){
      const body = Object.assign({}, st, { time: box.querySelector('#abTime').value || st.time, everyDays: Number(box.querySelector('#abEvery').value), keep: Number(box.querySelector('#abKeep').value) }, patch || {});
      try{ const r = await fetch('/api/backup/auto/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
        if(window.showToast) showToast('Backup settings saved.'); load(card);
      }catch(e){ if(window.showToast) showToast('Could not save (' + e.message + ').'); }
    };
    box.querySelector('#abSave').onclick = () => save();
    box.querySelector('#abToggle').onclick = () => save({ enabled: !st.enabled });
  }
  async function download(id, day, a){
    const t = a.textContent; a.textContent = 'Preparing…';
    try{
      const r = await fetch('/api/backup/auto/' + id); if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error || 'HTTP ' + r.status);
      const blob = await r.blob(); const u = URL.createObjectURL(blob);
      const l = document.createElement('a'); l.href = u; l.download = 'erp-backup-' + day + '.json'; document.body.appendChild(l); l.click(); l.remove(); URL.revokeObjectURL(u);
    }catch(e){ if(window.showToast) showToast('Could not download (' + e.message + ').'); }
    a.textContent = t;
  }
  function build(anchor){
    if(document.getElementById('autoBackupCard')) return;
    const host = anchor.closest('.card') || anchor.parentElement;
    const card = document.createElement('div');
    card.id = 'autoBackupCard';
    card.className = host.className || 'card';
    card.style.marginTop = '14px';
    card.innerHTML = '<h3 style="margin:0 0 4px;">Automatic backups on the server</h3>' +
      '<div style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:10px;">On the schedule set below the server saves a full copy of all school records by itself, so you are covered even on a day you forget to download one. This is in addition to your own downloaded backup — keep doing that now and then.</div>' +
      '<div id="autoBackupSettings"></div><button class="btn btn-primary btn-sm" id="autoBackupNow">Take one now</button><div id="autoBackupList" style="margin-top:12px;font-size:0.8rem;">Loading…</div>';
    host.insertAdjacentElement('afterend', card);
    card.querySelector('#autoBackupNow').onclick = async function(){
      const b = this; b.disabled = true; const t = b.textContent; b.textContent = 'Saving…';
      try{ const r = await fetch('/api/backup/auto/run', { method:'POST' }); const d = await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
        if(window.showToast) showToast('Backup saved on the server: ' + Number(d.rows).toLocaleString('en-IN') + ' records.'); }
      catch(e){ if(window.showToast) showToast('Could not save (' + e.message + ').'); }
      b.disabled = false; b.textContent = t; load(card);
    };
    card.addEventListener('click', function(e){ const a = e.target.closest('a[data-bk]'); if(!a) return; e.preventDefault(); download(a.dataset.bk, a.dataset.day, a); });
    load(card);
  }
  function check(){
    const btn = document.getElementById('backupDownloadBtn');
    if(btn && !document.getElementById('autoBackupCard')) build(btn);
  }
  new MutationObserver(check).observe(document.documentElement, { childList:true, subtree:true });
  check();
})();

/* TEST COPY ribbon: the preview runs on its own test database (server env TEST_MODE=true); /api/demo-info then says test:true. */
(function(){
  fetch('/api/demo-info', { cache:'no-store' }).then(r => r.ok ? r.json() : null).then(info => {
    if(!info || !info.test || info.demo || document.getElementById('testRibbon')) return;
    const t = document.createElement('div');
    t.id = 'testRibbon';
    t.textContent = 'TEST COPY \u2014 this is not the live school. Changes here never reach the real records; no messages or payments are sent.';
    t.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#d9730d;color:#fff;text-align:center;font:600 12px system-ui,sans-serif;padding:5px 10px;';
    document.body.appendChild(t);
    document.title = 'TEST \u2014 ' + document.title;
    const st = document.createElement('style');
    st.textContent = '.main{padding-bottom:48px !important}';
    document.head.appendChild(st);
  }).catch(() => {});
})();
