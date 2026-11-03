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
      renderSettings(card, d.settings, d.backups && d.backups[0] ? d.backups[0].bytes : 0);
      if(!d.backups.length){ list.innerHTML = '<span style="color:var(--ink-soft);">No copy yet — the first one is saved automatically at the time set above, or press “Take one now”.</span>'; return; }
      list.innerHTML = '<div style="color:var(--ink-soft);margin-bottom:6px;">Newest first · the server keeps the last ' + d.keep + '</div>' +
        '<div style="max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:10px;"><table style="width:100%;font-size:0.78rem;"><tbody>' +
        d.backups.map(b => '<tr><td style="padding:5px 10px;">' + esc(new Date(String(b.at).replace(' ','T') + (/Z$/.test(String(b.at))?'':'Z')).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) +
          ' <span style="opacity:.6">' + (b.kind === 'manual' ? '(taken by hand)' : '(automatic)') + '</span></td><td style="padding:5px 10px;text-align:right;">' + Number(b.rows).toLocaleString('en-IN') + ' records · ' + fmtSize(b.bytes) +
          '</td><td style="padding:5px 10px;text-align:right;"><a href="#" data-bk="' + b.id + '" data-day="' + esc(b.day) + '" style="color:var(--teal);font-weight:600;">Download</a></td></tr>').join('') + '</tbody></table></div>';
    }catch(e){ list.textContent = 'Could not load (' + e.message + ').'; }
  }
  function renderSettings(card, st, lastBytes){
    const box = card.querySelector('#autoBackupSettings'); if(!box || !st) return;
    const sel = 'padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface,#fff);color:inherit;';
    box.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:12px;margin-bottom:12px;">' +
      '<b style="color:' + (st.enabled ? 'var(--teal)' : 'var(--magenta)') + ';">' + (st.enabled ? '● Automatic backup is ON' : '○ Automatic backup is STOPPED') + '</b>' +
      '<button class="btn btn-sm" id="abToggle">' + (st.enabled ? 'Stop' : 'Start') + '</button>' +
      '<label style="font-size:0.78rem;">Time <input type="time" id="abTime" value="' + st.time + '" style="' + sel + '"></label>' +
      '<label style="font-size:0.78rem;">How often <select id="abEvery" style="' + sel + '">' + [[1,'Every day'],[2,'Every 2 days'],[3,'Every 3 days'],[7,'Every week']].map(o => '<option value="' + o[0] + '"' + (o[0] === st.everyDays ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<label style="font-size:0.78rem;">Keep last <input type="number" id="abKeep" min="2" max="90" step="1" value="' + st.keep + '" style="width:64px;' + sel + '"> copies</label>' +
      '<span id="abKeepHint" style="font-size:0.75rem;color:var(--ink-soft);"></span>' +
      '<button class="btn btn-primary btn-sm" id="abSave">Save</button></div>';
    const hint = function(){
      const n = Math.max(2, Math.min(90, Math.round(Number(box.querySelector('#abKeep').value) || 0)));
      box.querySelector('#abKeepHint').textContent = lastBytes ? '≈ ' + fmtSize(lastBytes * n) + ' of server space at today\'s size' : '';
    };
    box.querySelector('#abKeep').oninput = hint; hint();
    const save = async function(patch){
      const body = Object.assign({}, st, { time: box.querySelector('#abTime').value || st.time, everyDays: Number(box.querySelector('#abEvery').value), keep: Math.max(2, Math.min(90, Math.round(Number(box.querySelector('#abKeep').value) || st.keep))) }, patch || {});
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

  function ago(iso){
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if(!(m >= 0)) return ''; if(m < 60) return m + ' min ago'; if(m < 2880) return Math.round(m / 60) + ' hours ago'; return Math.round(m / 1440) + ' days ago';
  }
  function row(ok, text){ return '<div style="padding:3px 0;">' + (ok ? '✅' : '⚠️') + ' ' + text + '</div>'; }
  async function loadHealth(hc){
    const box = hc.querySelector('#siteHealthBody');
    try{
      const r = await fetch('/api/health/details'); if(!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const b = d.backup || {}, last = b.last;
      let h = row(d.db.ok, 'Database answering (' + d.db.ms + ' ms)');
      if(b.failure) h += row(false, '<b>Last backup attempt failed</b> (' + esc(b.failure.message) + ') ' + ago(b.failure.at));
      else if(!b.enabled) h += row(false, 'Automatic backups are switched <b>off</b>');
      else if(!last) h += row(false, 'No backup saved yet (the first one is made automatically)');
      else h += row(Date.now() - Date.parse(last.at) < (b.everyDays + 2) * 86400000, 'Last backup ' + ago(last.at) + ' · ' + Number(last.rows).toLocaleString('en-IN') + ' records');
      h += row(d.push.configured, d.push.configured ? 'Phone notifications are set up' : 'Phone notifications are <b>not set up</b> (parents and staff get no phone alerts)');
      h += row(d.problemsLast24h === 0, d.problemsLast24h === 0 ? 'No server problems in the last 24 hours' : d.problemsLast24h + ' server problem(s) in the last 24 hours — see Admin Tools → Server problems');
      if(d.biggestTables && d.biggestTables.length) h += '<details style="margin-top:6px;"><summary style="cursor:pointer;">Biggest tables in the database</summary>' + d.biggestTables.map(t => '<div style="padding:1px 0;">' + esc(t.name) + ' — ' + t.mb + ' MB · about ' + Number(t.rows).toLocaleString('en-IN') + ' rows</div>').join('') + '</details>';
      h += '<div style="color:var(--ink-soft);margin-top:4px;">Server running for ' + (d.uptimeMinutes >= 120 ? Math.round(d.uptimeMinutes / 60) + ' hours' : d.uptimeMinutes + ' minutes') + ' · memory ' + d.memoryMb + ' MB</div>';
      box.innerHTML = h;
    }catch(e){ box.innerHTML = '<span style="color:#b3261e;">Could not read the health check (' + esc(e.message) + ').</span>'; }
  }

  /* ---- Photo shrinker: shrinks old full-size photos (students + staff) so the database and backups stay small ---- */
  const PS = { scan: null, running: false };
  const mb = b => (b / 1048576).toFixed(1) + ' MB';
  function shrinkDataUrl(src, maxDim, quality){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try{
          let w = img.width, h = img.height;
          if(w > maxDim || h > maxDim){ if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; } }
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        }catch(e){ reject(e); }
      };
      img.onerror = () => reject(new Error('unreadable image'));
      img.src = src;
    });
  }
  async function psApi(method, url, body){
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j;
  }
  async function psScan(box){
    box.innerHTML = 'Checking photos…';
    try{
      const d = await psApi('GET', '/api/photo-shrink/scan'); PS.scan = d;
      const big = (d.students.bigCount + d.staff.bigCount), bigBytes = d.students.bigBytes + d.staff.bigBytes;
      if(!big){ box.innerHTML = '✅ All ' + (d.students.photos + d.staff.photos) + ' photos are already small. Nothing to shrink.'; return; }
      box.innerHTML = '<b>' + big + '</b> photos (' + d.students.bigCount + ' student, ' + d.staff.bigCount + ' staff) take <b>' + mb(bigBytes) + '</b>. After shrinking they would take about <b>' + mb(big * 30000) + '</b>. ' +
        'Shrinking cannot be undone, so a fresh backup is saved first.' +
        '<div style="margin-top:8px;"><button class="btn btn-primary btn-sm" id="psGo">Shrink ' + big + ' photos</button></div><div id="psProg" style="margin-top:8px;"></div>';
      box.querySelector('#psGo').onclick = () => psRun(box);
    }catch(e){ box.innerHTML = '<span style="color:#b3261e;">' + esc(e.message) + '</span>'; }
  }
  async function psRun(box){
    if(PS.running) return;
    let go = true; try{ go = await showConfirmDialog('Shrink the large photos now? A fresh backup is saved first. Keep this page open until it finishes.'); }catch(e){}
    if(!go) return;
    PS.running = true; const prog = box.querySelector('#psProg'), btn = box.querySelector('#psGo'); btn.disabled = true;
    try{
      prog.textContent = 'Saving a fresh backup first…';
      await psApi('POST', '/api/backup/auto/run');
      const jobs = []; ['students', 'staff'].forEach(t => PS.scan[t].bigIds.forEach(id => jobs.push({ t, id })));
      let done = 0, saved = 0, failed = 0, shrunk = 0;
      for(const j of jobs){
        try{
          const cur = await psApi('GET', '/api/photo-shrink/photo?table=' + j.t + '&id=' + encodeURIComponent(j.id));
          let q = 0.82, out = await shrinkDataUrl(cur.photo, 480, q);
          if(out.length > 90000){ out = await shrinkDataUrl(cur.photo, 400, 0.7); }
          const r = await psApi('POST', '/api/photo-shrink/save', { table: j.t, id: j.id, photo: out });
          if(!r.skipped){ shrunk++; saved += (r.before - r.after); }
        }catch(e){ failed++; }
        done++;
        if(done % 5 === 0 || done === jobs.length) prog.innerHTML = 'Working… ' + done + ' of ' + jobs.length + ' (saved ' + mb(saved) + ')';
      }
      try{ await psApi('POST', '/api/photo-shrink/done', { count: shrunk, savedBytes: saved }); }catch(e){}
      prog.innerHTML = '<b style="color:#0b7a5a;">✓ Done.</b> ' + shrunk + ' photos shrunk, ' + mb(saved) + ' saved' + (failed ? ' · ' + failed + ' could not be shrunk and were left as they were' : '') + '. Press <b>Take one now</b> in the backup card to see the smaller backup size. Older backups stay big until they rotate out.';
    }catch(e){ prog.innerHTML = '<span style="color:#b3261e;">Stopped: ' + esc(e.message) + '. Nothing was lost; photos not yet shrunk are unchanged.</span>'; }
    PS.running = false;
  }
  function buildHealth(after){
    if(document.getElementById('siteHealthCard')) return;
    const hc = document.createElement('div');
    hc.id = 'siteHealthCard'; hc.className = after.className; hc.style.marginTop = '14px';
    const url = location.origin + '/api/health';
    hc.innerHTML = '<h3 style="margin:0 0 4px;">Site health</h3>' +
      '<div style="font-size:0.8rem;color:var(--ink-soft);margin-bottom:8px;">A quick look at whether everything is working. You also get a phone alert if a nightly backup fails. To be told when the whole site is <b>down</b>, point a free uptime monitor at this address:</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;"><code style="padding:4px 8px;background:#f1f4fa;border-radius:8px;word-break:break-all;">' + esc(url) + '</code><button class="btn btn-sm" id="siteHealthCopy">Copy address</button><button class="btn btn-sm" id="siteHealthRefresh">Refresh</button></div>' +
      '<div id="siteHealthBody" style="font-size:0.85rem;">Checking…</div>' +
      '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border,#e1e6f0);font-size:0.85rem;"><b>Photo size</b><div style="color:var(--ink-soft);margin:2px 0 6px;">Old photos were saved at full camera size, which makes the database and every backup large. This shrinks them to a small, sharp size.</div><div id="psBox"><button class="btn btn-sm" id="psCheck">Check photo sizes</button></div></div>';
    after.insertAdjacentElement('beforebegin', hc);
    hc.querySelector('#siteHealthCopy').onclick = async () => { try{ await navigator.clipboard.writeText(url); if(window.showToast) showToast('Address copied.'); }catch(e){ if(window.showToast) showToast('Could not copy.'); } };
    hc.querySelector('#siteHealthRefresh').onclick = () => loadHealth(hc);
    hc.querySelector('#psCheck').onclick = () => psScan(hc.querySelector('#psBox'));
    loadHealth(hc);
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
    buildHealth(card);
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
