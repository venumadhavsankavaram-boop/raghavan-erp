/* Website Content — alumni, achievements, safety points, vehicles + GPS tracking links, admission copy,
   teacher:student ratio. Lives as a second tab inside Website Gallery (same permission: websitegallery).
   Stored under kv key 'website-extras'; the public site reads it from /api/website-extras. */
(function(){
  const KEY = '/api/kv/website-extras';
  let wcTab = 'gallery', wcData = null, wcBusy = false;
  const E = v => (typeof cmEsc === 'function' ? cmEsc(v) : String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));
  const SECTIONS = [
    { k:'alumni', vis:'Show the Alumni section on the website', one:'alumnus', icon:'🎓', title:'Alumni', hint:'Former students you are proud of. Shown on the website with name, batch and what they do now.',
      fields:[['name','Name','text'],['batch','Batch / year passed 10th','text'],['now','What they do now','text'],['quote','Message to students (optional)','area']] },
    { k:'achievements', vis:'Show the Achievements section on the website', one:'achievement', icon:'🏆', title:'Achievements', hint:'Results, awards, sports and competitions. Only add what really happened.',
      fields:[['title','Achievement','text'],['year','Year','text'],['category','Type (Academics / Sports / Arts / Other)','text'],['detail','Details','area']] },
    { k:'safety', vis:'Show the safety / Women Safety facility on the website', one:'safety point', icon:'🛡️', title:'Extra safety facilities', hint:'Optional. Each point becomes a card inside the website Facilities section (replacing the standard Women &amp; Child Safety card). Write only measures the school actually follows.',
      fields:[['title','Heading (e.g. CCTV on campus)','text'],['detail','Details','area']] },
    { k:'downloads', vis:'Show the download buttons on the website', visKey:'explore', one:'download', icon:'📥', title:'Downloads & Forms', hint:'Forms, syllabus or calendar files people can download. Paste the link to the file (https://…). Shown as buttons under Facilities.',
      fields:[['title','Button name (e.g. Academic Calendar)','text'],['url','Link to the file (https://…)','text']] },
  ];
  async function wcLoad(){
    try{ const r = await fetch(KEY, { credentials:'same-origin' }); wcData = r.ok ? await r.json() : {}; }catch(e){ wcData = {}; }
    wcData = wcData || {};
    SECTIONS.forEach(s => { if(!Array.isArray(wcData[s.k])) wcData[s.k] = []; });
    ['admission','ratio','recognition','transport','academics','results','visible'].forEach(k => { wcData[k] = wcData[k] || {}; });
  }
  const vis = (k, label) => `<label class="wc-show wc-vis"><input type="checkbox" ${(wcData.visible || {})[k] !== false ? 'checked' : ''} onchange="wcVis('${k}',this.checked)"> 👁 ${label}</label>`;
  window.wcVis = (k, v) => { wcData.visible = wcData.visible || {}; wcData.visible[k] = !!v; };
  function fieldHtml(sk, i, f, val){
    const id = `wc_${sk}_${i}_${f[0]}`;
    const inp = f[2] === 'area'
      ? `<textarea id="${id}" rows="2" oninput="wcSet('${sk}',${i},'${f[0]}',this.value)">${E(val)}</textarea>`
      : `<input type="text" id="${id}" value="${E(val)}" oninput="wcSet('${sk}',${i},'${f[0]}',this.value)">`;
    return `<div class="f-field ${f[2] === 'area' ? 'full' : ''}"><label>${f[1]}</label>${inp}</div>`;
  }
  function sectionHtml(s){
    const arr = wcData[s.k];
    return `<section class="sf-card cm-post">
      <h3 class="cm-h">${s.icon} ${s.title} <span class="iv-count">${arr.length}</span></h3>
      <p class="cm-sub">${s.hint}</p>
      ${s.vis ? vis(s.visKey || s.k, s.vis) : ''}
      ${arr.map((it, i) => `<div class="wc-item">
        <div class="form-grid">${s.fields.map(f => fieldHtml(s.k, i, f, it[f[0]])).join('')}</div>
        <div class="wc-actions"><label class="wc-show"><input type="checkbox" ${it.show !== false ? 'checked' : ''} onchange="wcSet('${s.k}',${i},'show',this.checked)"> Show on website</label>
          <button type="button" class="cm-del" onclick="wcRemove('${s.k}',${i})">🗑 Remove</button></div>
      </div>`).join('') || '<div class="empty-state"><b>Nothing added yet</b>Use the button below.</div>'}
      <button type="button" class="sf-btn sf-btn--soft" onclick="wcAdd('${s.k}')">+ Add ${s.one}</button>
    </section>`;
  }
  function paintContent(body){
    const r = wcData.ratio;
    body.innerHTML = `
      <style>.wc-item{border:1px solid var(--border);border-radius:14px;padding:14px;margin:12px 0;background:var(--cream)}.wc-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.wc-show{font-size:.82rem;font-weight:600}.wc-vis{display:block;margin:6px 0 12px;color:var(--brand-navy)}.wc-bar{position:sticky;bottom:0;background:var(--white);padding:12px 0;display:flex;gap:12px;align-items:center;z-index:3}</style>
      <section class="sf-card cm-post">
        <h3 class="cm-h">🏛️ Recognition, registration &amp; board</h3>
        <p class="cm-sub">Shown in the website's recognition strip. Registration, UDISE and other numbers are deliberately NOT shown on the public site.</p>
        ${vis('recognition','Show the Recognition strip on the website')}
        <div class="form-grid">
          ${[['board','Board','State Board of Andhra Pradesh'],['medium','Medium of instruction','English'],['recognition','Recognition heading (shown as the strip title)','Recognised by Govt. of AP'],['timings','School timings (e.g. 8:45 AM – 4:00 PM)','']].map(x => `<div class="f-field"><label>${x[1]}</label><input type="text" value="${E(wcData.recognition[x[0]])}" oninput="wcSetKey('recognition','${x[0]}',this.value)" placeholder="${E(x[2])}"></div>`).join('')}
        </div>
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">📢 Admissions banner</h3>
        <p class="cm-sub">A slim banner across the top of the website. Switch it on when admissions are open and off when they close.</p>
        <label class="wc-show"><input type="checkbox" ${wcData.admission.open ? 'checked' : ''} onchange="wcSetKey('admission','open',this.checked)"> Show the admissions banner</label>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Banner text</label><input type="text" value="${E(wcData.admission.heading)}" oninput="wcSetKey('admission','heading',this.value)" placeholder="Admissions open for 2027–28"></div>
          <div class="f-field"><label>Last date / extra note</label><input type="text" value="${E(wcData.admission.lastDate)}" oninput="wcSetKey('admission','lastDate',this.value)" placeholder="Last date: 31 March"></div>
          <div class="f-field"><label>Office hours (shown under the admission form)</label><input type="text" value="${E(wcData.admission.hours)}" oninput="wcSetKey('admission','hours',this.value)" placeholder="Mon–Sat, 9:00 AM – 4:00 PM"></div>
        </div>
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">📈 Latest results snapshot</h3>
        <p class="cm-sub">Shows as a highlight tile in "At a glance". Enter real figures only; leave blank to hide.</p>
        <div class="form-grid">
          <div class="f-field"><label>Exam / year (e.g. SSC 2026)</label><input type="text" value="${E(wcData.results.label)}" oninput="wcSetKey('results','label',this.value)"></div>
          <div class="f-field"><label>Pass percentage (e.g. 100%)</label><input type="text" value="${E(wcData.results.pass)}" oninput="wcSetKey('results','pass',this.value)"></div>
        </div>
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">📍 Vehicle facility &amp; GPS</h3>
        <p class="cm-sub">Tick if your vehicles have GPS. The website's Vehicle Facility card then shows a "GPS enabled" badge (no tracking link is shown).</p>
        ${vis('transport','Show the Vehicle Facility card on the website')}
        <label class="wc-show"><input type="checkbox" ${wcData.transport.gps ? 'checked' : ''} onchange="wcSetKey('transport','gps',this.checked)"> Our vehicles are GPS-enabled</label>
        <div class="form-grid" style="margin-top:12px;"><div class="f-field full"><label>Short note (optional)</label><input type="text" value="${E(wcData.transport.note)}" oninput="wcSetKey('transport','note',this.value)" placeholder="e.g. Parents can ask the office about live location"></div></div>
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">📚 What is taught (optional)</h3>
        <p class="cm-sub">Leave blank to use the standard text. One point per line; replaces the list on that stage's card.</p>
        ${vis('academics','Show the Academics section on the website')}
        <div class="form-grid">
          ${[['preKg','Pre-KG (Baby, LKG, UKG)'],['primary','Primary (1st–5th)'],['high','High School (6th–10th)']].map(x => `<div class="f-field full"><label>${x[1]}</label><textarea rows="4" oninput="wcSetKey('academics','${x[0]}',this.value)">${E(wcData.academics[x[0]])}</textarea></div>`).join('')}
        </div>
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">👩‍🏫 Teacher : student ratio</h3>
        <p class="cm-sub">Currently counted from the ERP: <b>${wcData._counts ? wcData._counts.students : '—'}</b> active students and <b>${wcData._counts ? wcData._counts.teachers : '—'}</b> staff whose designation contains "teacher". Type your own figure below to override.</p>
        ${vis('glance','Show the "At a glance" strip (students, teachers, ratio) on the website')}
        <div class="form-grid"><div class="f-field"><label>Show this instead (optional, e.g. 1 : 20)</label><input type="text" value="${E(r.manual)}" oninput="wcSetKey('ratio','manual',this.value)"></div></div>
      </section>
      ${SECTIONS.map(sectionHtml).join('')}
      <div class="wc-bar">${typeof sfBtn === 'function' ? sfBtn('primary','','Save website content','wcSave()','sf-btn--lg') : '<button class="btn btn-primary" onclick="wcSave()">Save website content</button>'}
        <span class="cm-sub" id="wcMsg" style="margin:0;"></span></div>`;
  }
  window.wcSet = (k, i, f, v) => { wcData[k][i][f] = v; };
  window.wcSetKey = (g, f, v) => { wcData[g][f] = v; };
  window.wcAdd = k => { wcData[k].push({ id: 'w' + Date.now(), show: true }); paintContent(document.getElementById('websiteGalleryBody')); wcShell(); };
  window.wcRemove = (k, i) => { if(!confirm('Remove this item from the website?')) return; wcData[k].splice(i, 1); paintContent(document.getElementById('websiteGalleryBody')); wcShell(); };
  window.wcSave = async function(){
    if(wcBusy) return; wcBusy = true;
    const msg = document.getElementById('wcMsg'); if(msg) msg.textContent = 'Saving…';
    try{
      const out = JSON.parse(JSON.stringify(wcData)); delete out._counts;
      const r = await fetch(KEY, { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json', ...(typeof actorHeaders === 'function' ? actorHeaders() : {})}, body: JSON.stringify(out) });
      if(!r.ok) throw new Error('Could not save (' + r.status + ')');
      if(msg) msg.textContent = 'Saved — the website shows this within a minute.';
      if(typeof showToast === 'function') showToast('Website content saved');
    }catch(e){ if(msg) msg.textContent = e.message; if(typeof showToast === 'function') showToast(e.message); }
    wcBusy = false;
  };
  window.wcSwitch = async function(t){
    wcTab = t;
    const body = document.getElementById('websiteGalleryBody'); if(!body) return;
    if(t === 'content'){
      body.innerHTML = '<div class="empty-state"><b>Loading…</b></div>';
      await wcLoad();
      try{ const c = await (await fetch('/api/website-extras')).json(); wcData._counts = c.counts; }catch(e){}
      paintContent(body); wcShell();
    }else{ renderWebsiteGallery(body); }
  };
  function tabsHtml(){
    return `<div class="mf-tabs" id="wcTabs" style="margin-bottom:14px;">
      <button type="button" class="mf-tab ${wcTab === 'gallery' ? 'active' : ''}" onclick="wcSwitch('gallery')">🖼️ Photos</button>
      <button type="button" class="mf-tab ${wcTab === 'content' ? 'active' : ''}" onclick="wcSwitch('content')">🌐 Website Content</button></div>`;
  }
  function wcShell(){
    const body = document.getElementById('websiteGalleryBody'); if(!body) return;
    const old = document.getElementById('wcTabs'); if(old) old.remove();
    body.insertAdjacentHTML('afterbegin', tabsHtml());
  }
  // Wrap the gallery renderer: Photos tab as before, with the tab strip on top; the Website Content tab is only for people allowed to edit this module.
  const _render = window.renderWebsiteGallery || (typeof renderWebsiteGallery === 'function' ? renderWebsiteGallery : null);
  if(_render){
    window.renderWebsiteGallery = renderWebsiteGallery = function(body){
      if(wcTab === 'content' && body && body.id === 'websiteGalleryBody'){ paintContent(body); return wcShell(); }
      _render(body); wcShell();
    };
  }
  const _init = typeof initWebsiteGalleryView === 'function' ? initWebsiteGalleryView : null;
  if(_init) window.initWebsiteGalleryView = initWebsiteGalleryView = function(){ wcTab = 'gallery'; _init(); };
  const h = document.querySelector('#view-websitegallery .topbar h1'); if(h) h.textContent = 'Website Gallery & Content';
})();
