/* ============================================================================
   Study Material
   * Teacher (own classes/subjects) and Admin/Principal: upload PDF / picture / video, see and remove uploads.
   * Student / Parent: "Study Material" tab — view only. PDFs and pictures are drawn onto a watermarked
     canvas (student name + admission no.), videos play without a download button, right-click and print are
     blocked. There is no download button and no direct file link in the page.
   Honest limit: nothing can stop someone photographing the screen — the watermark discourages sharing.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isStaff = () => ['Teacher','Admin','Principal'].includes(role());
  const isParent = () => ['Student','Parent'].includes(role());
  const MAX = 8 * 1024 * 1024;
  const dmy = iso => /^\d{4}/.test(iso || '') ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '';
  const sizeText = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const ICON = { pdf: '📕', image: '🖼️', video: '🎬', file: '📄' };

  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok) throw new Error((j && j.error) || 'Something went wrong');
    return j;
  }
  const L = (en, te) => (window.portalT ? window.portalT(en, te) : en);
  const toast = m => { try{ showToast(m); }catch(e){ console.log(m); } };

  function css(){
    if($('smCss')) return;
    const s = document.createElement('style'); s.id = 'smCss';
    s.textContent = `
      .sm-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:16px 18px;margin-bottom:14px;}
      .sm-card h3{margin:0 0 10px;font-size:1.05rem;color:var(--navy,#14325c);}
      .sm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;} .sm-form .full{grid-column:1/-1;}
      .sm-form label{font-size:.8rem;color:#667;display:block;margin-bottom:3px;} .sm-form input,.sm-form select,.sm-form textarea{width:100%;padding:9px;border:1px solid var(--border,#d6dcea);border-radius:10px;font:inherit;}
      .sm-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid #eef1f7;flex-wrap:wrap;} .sm-row:first-of-type{border-top:0;}
      .sm-ico{font-size:1.7rem;} .sm-main{flex:1;min-width:170px;} .sm-main b{color:var(--navy,#14325c);} .sm-sm{font-size:.82rem;color:#667;}
      .sm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px;}
      .sm-item{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:6px;border-left:6px solid #2F80ED;}
      .sm-item .t{font-weight:800;font-size:1.05rem;color:var(--navy,#14325c);} .sm-btn{margin-top:auto;align-self:flex-start;padding:10px 18px;border:0;border-radius:12px;background:var(--navy,#14325c);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;}
      .sm-subj{margin:18px 0 8px;font-size:1.1rem;color:var(--navy,#14325c);}
      #smViewer{position:fixed;inset:0;z-index:100000;background:#10131c;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;}
      #smViewer header{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#1b2030;color:#fff;} #smViewer header b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #smViewer header button{background:#fff;color:#14325c;border:0;border-radius:10px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:1rem;}
      #smBody{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;align-items:center;gap:10px;-webkit-touch-callout:none;}
      #smBody canvas{width:100%;max-width:900px;height:auto;background:#fff;border-radius:6px;pointer-events:none;}
      #smBody .sm-msg{color:#fff;padding:30px;text-align:center;}
      #smBody .sm-vwrap{position:relative;width:100%;max-width:900px;} #smBody video{width:100%;border-radius:6px;background:#000;}
      #smBody .sm-wm{position:absolute;inset:0;pointer-events:none;overflow:hidden;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;opacity:.16;color:#fff;font-weight:700;font-size:15px;transform:rotate(-20deg) scale(1.4);}
      @media print{ body.sm-open *{display:none!important;} }
    `;
    document.head.appendChild(s);
  }

  /* ---------- viewer ---------- */
  let pdfjsPromise = null;
  function loadPdfJs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if(pdfjsPromise) return pdfjsPromise;
    const bases = window.__PDFJS_BASES || ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/'];
    pdfjsPromise = new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        if(i >= bases.length){ pdfjsPromise = null; return reject(new Error('The viewer could not be loaded. Please check your internet and try again.')); }
        const base = bases[i++]; const sc = document.createElement('script'); sc.src = base + 'pdf.min.js';
        sc.onload = () => { try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; resolve(window.pdfjsLib); }catch(e){ next(); } };
        sc.onerror = () => { sc.remove(); next(); };
        document.head.appendChild(sc);
      };
      next();
    });
    return pdfjsPromise;
  }
  function stamp(ctx, w, h, text){
    ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = '#444'; ctx.font = 'bold ' + Math.max(16, Math.round(w / 32)) + 'px sans-serif';
    ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
    const step = Math.max(90, Math.round(w / 6)), tw = ctx.measureText(text).width + 50;
    for(let y = -h; y < h; y += step) for(let x = -w - ((y / step) % 2 ? tw / 2 : 0); x < w; x += tw) ctx.fillText(text, x, y);
    ctx.restore();
  }
  function closeViewer(){ const v = $('smViewer'); if(v) v.remove(); document.body.classList.remove('sm-open'); document.body.style.overflow = ''; }
  window.smCloseViewer = closeViewer;
  async function openViewer(item, wmText){
    css(); closeViewer();
    const v = document.createElement('div'); v.id = 'smViewer';
    v.innerHTML = `<header><b>${esc(item.title)}</b><button type="button" onclick="smCloseViewer()">${L('Close', 'మూసివేయండి')} ✕</button></header><div id="smBody"><div class="sm-msg">${L('Opening…', 'తెరుస్తోంది…')}</div></div>`;
    ['contextmenu','dragstart','copy','cut'].forEach(ev => v.addEventListener(ev, e => e.preventDefault()));
    document.body.appendChild(v); document.body.classList.add('sm-open'); document.body.style.overflow = 'hidden';
    const body = $('smBody'); const url = '/api/study-material/' + encodeURIComponent(item.id) + '/file';
    try{
      if(item.kind === 'video'){
        body.innerHTML = `<div class="sm-vwrap"><video controls playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture src="${url}"></video><div class="sm-wm">${Array(40).fill('<span>' + esc(wmText) + '</span>').join('')}</div></div>`;
        const vid = body.querySelector('video'); vid.addEventListener('contextmenu', e => e.preventDefault());
        vid.addEventListener('error', () => { body.innerHTML = '<div class="sm-msg">This video could not be played.</div>'; });
        return;
      }
      const res = await fetch(url, { credentials: 'include' }); if(!res.ok) throw new Error('This file is not available any more.');
      if(item.kind === 'image'){
        const blob = await res.blob(); const bmp = await createImageBitmap(blob);
        const sc = Math.min(1, 1600 / bmp.width); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
        const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height); stamp(ctx, c.width, c.height, wmText);
        body.innerHTML = ''; body.appendChild(c); return;
      }
      const pdfjs = await loadPdfJs(); const data = new Uint8Array(await res.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise; body.innerHTML = '';
      const dpr = Math.min(window.devicePixelRatio || 1, 2); const cssW = Math.min(body.clientWidth - 24, 900) || 360;
      for(let n = 1; n <= doc.numPages; n++){
        if(!$('smViewer')) return; // closed meanwhile
        const page = await doc.getPage(n); const base = page.getViewport({ scale: 1 }); const scale = (cssW * dpr) / base.width; const vp = page.getViewport({ scale });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); body.appendChild(c);
        const ctx = c.getContext('2d'); await page.render({ canvasContext: ctx, viewport: vp }).promise; stamp(ctx, c.width, c.height, wmText);
      }
    }catch(e){ if($('smBody')) $('smBody').innerHTML = '<div class="sm-msg">' + esc(e && e.message || 'Could not open this file.') + '</div>'; }
  }
  window.smView = function(id){ const it = (window.__smItems || []).find(x => x.id === id); if(!it) return; openViewer(it, window.__smWm || ''); };

  /* ---------- Student / Parent tab ---------- */
  window.renderMyMaterialTab = async function(body, s){
    css(); body.innerHTML = '<div class="empty-state">…</div>';
    let list = [];
    try{ list = await api('GET', '/api/study-material'); }catch(e){ body.innerHTML = '<div class="empty-state"><b>' + L('Could not load study material', 'స్టడీ మెటీరియల్ లోడ్ కాలేదు') + '</b>' + L('Please try again.', 'దయచేసి మళ్లీ ప్రయత్నించండి.') + '</div>'; return; }
    window.__smItems = list; window.__smWm = (s.firstName + ' ' + (s.lastName || '')).trim() + ' · ' + (s.admissionNo || '');
    if(!list.length){ body.innerHTML = '<div class="empty-state"><b>' + L('No study material yet', 'ఇంకా స్టడీ మెటీరియల్ లేదు') + '</b>' + L('When a teacher shares notes or videos, they will appear here.', 'టీచర్ నోట్స్ లేదా వీడియోలు షేర్ చేస్తే ఇక్కడ కనిపిస్తాయి.') + '</div>'; return; }
    const by = {}; list.forEach(x => { (by[x.subject || 'Other'] = by[x.subject || 'Other'] || []).push(x); });
    body.innerHTML = Object.keys(by).sort().map(sj => `<h3 class="sm-subj">${esc(sj)}</h3><div class="sm-grid">${by[sj].map(x => `
      <div class="sm-item"><div class="sm-ico" style="font-size:1.8rem">${ICON[x.kind] || ICON.file}</div><div class="t">${esc(x.title)}</div>
        ${x.description ? `<div class="sm-sm">${esc(x.description)}</div>` : ''}
        <div class="sm-sm">${esc(x.staffName || L('Teacher', 'టీచర్'))} · ${esc(dmy(x.visibleFrom || x.createdAt))}</div>
        <button type="button" class="sm-btn" onclick="smView('${esc(x.id)}')">${L('Open', 'తెరవండి')}</button></div>`).join('')}</div>`).join('') +
      '<p class="sm-sm" style="margin-top:16px;">' + L('These files are for viewing only and carry your name. Please do not share them.', 'ఈ ఫైళ్లు చూడటానికి మాత్రమే మరియు మీ పేరుతో ఉంటాయి. దయచేసి షేర్ చేయకండి.') + '</p>';
  };

  /* ---------- Staff page (Teacher / Admin / Principal) ---------- */
  function ensureShell(){
    if(!isStaff()) return;
    css();
    const dash = $('view-dashboard');
    if(dash && !$('view-material')){
      const v = document.createElement('div'); v.id = 'view-material'; v.style.display = 'none';
      dash.parentNode.insertBefore(v, dash);
    }
    const anchor = $('navSyllabus');
    if(anchor && !$('navMaterial')){
      const b = document.createElement('button'); b.className = 'sb-link'; b.id = 'navMaterial'; b.setAttribute('onclick', "switchView('material')");
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/></svg></span> Study Material';
      anchor.insertAdjacentElement('afterend', b);
    }
  }
  let staffItems = [], staffFilter = '';
  function targets(){
    if(role() === 'Teacher'){ const sc = myTeacherScope(); return (sc && sc.subjectSections) || []; }
    const out = [];
    subjectsList.forEach(sj => (sj.sections || sectionsForClass(sj.className)).forEach(sec => out.push({ className: sj.className, section: sec, subject: sj.name })));
    return out;
  }
  async function renderStaff(){
    const el = $('view-material'); if(!el) return;
    try{ staffItems = await api('GET', '/api/study-material'); }catch(e){ staffItems = []; }
    window.__smItems = staffItems; window.__smWm = (currentUser.name || currentUser.username || 'Staff') + ' · preview';
    const tg = targets();
    const classes = [...new Set(tg.map(t => t.className))];
    const shown = staffItems.filter(x => !staffFilter || x.className === staffFilter);
    el.innerHTML = `<div class="topbar"><div><h1>Study Material</h1><p>Share notes, worksheets and videos with a class. Students can view them but cannot download.</p></div></div>
      <div class="sm-card"><h3>Upload new material</h3>
        ${tg.length ? `<div class="sm-form">
          <div><label>Class</label><select id="smClass">${classes.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
          <div><label>Section</label><select id="smSection"></select></div>
          <div><label>Subject</label><select id="smSubject"></select></div>
          <div class="full"><label>Title</label><input id="smTitle" maxlength="200" placeholder="e.g. Chapter 3 notes"></div>
          <div class="full"><label>Note for students (optional)</label><textarea id="smDesc" rows="2" maxlength="1000"></textarea></div>
          <div><label>Visible from</label><input type="date" id="smFrom" value="${localDateStr(new Date())}"></div>
          <div><label>File — PDF, picture or video (max 8 MB)</label><input type="file" id="smFile" accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,.webm,application/pdf,image/*,video/mp4,video/webm"></div>
          <div class="full"><button type="button" class="btn btn-primary" id="smUp" onclick="smUpload()">Upload &amp; notify the class</button> <span class="sm-sm" id="smMsg"></span></div>
        </div>` : `<div class="sm-sm">${role() === 'Teacher' ? 'No classes or subjects are assigned to you yet — please ask the Admin.' : 'Set up classes and subjects first.'}</div>`}
      </div>
      <div class="sm-card"><h3>${role() === 'Teacher' ? 'My uploads' : 'All uploads'} ${classes.length > 1 || role() !== 'Teacher' ? `<select id="smFilter" style="margin-left:8px;font-weight:400;"><option value="">All classes</option>${[...new Set(staffItems.map(x => x.className))].map(c => `<option ${c === staffFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}</h3>
        ${shown.length ? shown.map(x => `<div class="sm-row"><div class="sm-ico">${ICON[x.kind] || ICON.file}</div>
          <div class="sm-main"><b>${esc(x.title)}</b><div class="sm-sm">${esc(x.className)}${x.section ? ' ' + esc(x.section) : ' (all sections)'} · ${esc(x.subject)} · ${esc(x.staffName || '')} · ${esc(sizeText(x.size))} · ${esc(dmy(x.createdAt))}${x.visibleFrom && x.visibleFrom > localDateStr(new Date()) ? ' · visible from ' + esc(dmy(x.visibleFrom)) : ''}</div></div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="smView('${esc(x.id)}')">View</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="smRemove('${esc(x.id)}')">Remove</button></div>`).join('') : '<div class="sm-sm">Nothing uploaded yet.</div>'}
      </div>`;
    if($('smClass')){ fillSec(); $('smClass').onchange = fillSec; $('smSection').onchange = fillSub; }
    if($('smFilter')) $('smFilter').onchange = e => { staffFilter = e.target.value; renderStaff(); };
  }
  function fillSec(){
    const tg = targets(), c = $('smClass').value;
    const secs = [...new Set(tg.filter(t => t.className === c).map(t => t.section))];
    $('smSection').innerHTML = secs.map(x => `<option>${esc(x)}</option>`).join(''); fillSub();
  }
  function fillSub(){
    const tg = targets(), c = $('smClass').value, sec = $('smSection').value;
    const subs = [...new Set(tg.filter(t => t.className === c && t.section === sec).map(t => t.subject))];
    $('smSubject').innerHTML = subs.map(x => `<option>${esc(x)}</option>`).join('');
  }
  window.smUpload = async function(){
    const f = $('smFile').files[0], title = $('smTitle').value.trim();
    if(!title){ toast('Please give the material a title.'); return; }
    if(!f){ toast('Please choose a file.'); return; }
    if(f.size > MAX){ toast('That file is over 8 MB. Please compress it and try again.'); return; }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const mime = f.type || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' })[ext] || '';
    const btn = $('smUp'); btn.disabled = true; $('smMsg').textContent = 'Uploading…';
    try{
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(f); });
      await api('POST', '/api/study-material', { className: $('smClass').value, section: $('smSection').value, subject: $('smSubject').value, title, description: $('smDesc').value, visibleFrom: $('smFrom').value, fileName: f.name, mime, dataUrl });
      toast('Uploaded. Students have been notified.'); renderStaff();
    }catch(e){ toast(e.message); btn.disabled = false; $('smMsg').textContent = ''; }
  };
  window.smRemove = async function(id){
    const ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog('Remove this material? Students will no longer see it.', { title: 'Remove material', okText: 'Remove', cancelText: 'Cancel' }) : true;
    if(!ok) return;
    try{ await api('DELETE', '/api/study-material/' + encodeURIComponent(id)); renderStaff(); }catch(e){ toast(e.message); }
  };

  const origSwitch = window.switchView;
  window.switchView = function(view){
    if(!isStaff()) return origSwitch.apply(this, arguments);
    ensureShell();
    if(view !== 'material'){
      const r = origSwitch.apply(this, arguments);
      const v = $('view-material'); if(v) v.style.display = 'none';
      const n = $('navMaterial'); if(n) n.classList.remove('active');
      return r;
    }
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-material') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navMaterial'); if(n) n.classList.add('active');
    $('view-material').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    renderStaff();
  };
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      try{ ensureShell(); if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility(); }catch(e){}
      return r;
    };
  }
})();
