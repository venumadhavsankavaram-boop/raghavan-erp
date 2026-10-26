/* Website module (sidebar: Website → Manage Website). One screen with tabs for everything the public school
   website shows: Overview, Home & Banner, Pages, Alumni & Achievements, Policies, Gallery, Notices, Enquiries.
   This file is screen layout only. Nothing about how data is stored or what the public website receives changed:
   content still lives under kv key 'website-extras' (public read: /api/website-extras), photos under
   'website-gallery', enquiries under the admission-inquiries key, and permissions are still 'websitegallery'
   and 'websiteinquiries' (plus 'noticeboard' for the Notices tab). */
(function(){
  const KEY = '/api/kv/website-extras';
  let webTab = 'overview', wcData = null, wcBusy = false, wcLoadOk = false, wcDirty = false, webSeq = 0, webFeedOk = null;
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
  /* Policy pages (Privacy, Terms, Fee/Refund, Admission). Written in the ERP, shown on the public site only when ticked.
     Starter drafts use simple formatting: "## Heading", "- bullet", blank line between paragraphs.
     {{school}} {{phone}} {{email}} {{address}} are filled in by the website. [[FILL IN: ...]] marks what the school must write itself. */
  const POLICIES = [
    { k:'privacy', icon:'🔒', title:'Privacy Policy', hint:'What the website collects (the admission enquiry form) and how it is used.',
      starter:`## What this page covers
This page explains what information {{school}} collects through this website and how it is used.

## What we collect
- Through the admission enquiry form: the parent or guardian's name, phone number, email (if given), the child's name and the class applied for, and any message you write.
- Basic technical information that every website receives, such as the type of browser, used only to keep the website working.

## How we use it
- To reply to your enquiry and help you with admission.
- To keep school records for children who are admitted. This is done in the school office, not on this website.

We do not sell your information or share it with advertisers.

## Who can see it
Only authorised staff of {{school}}. The company that supplies and supports our school software keeps the system secure.

## Photos
Photos in the gallery are from school events and are published by the school. If you would like a photo removed, please contact the school office.

## Your choices
You can ask the school office to correct or delete the details you sent us at any time.

## Contact
{{school}}, {{address}}
Phone: {{phone}}
Email: {{email}}` },
    { k:'terms', icon:'📄', title:'Terms of Use', hint:'Simple rules for using the website.',
      starter:`## Using this website
This website gives information about {{school}}. By using it you agree to these simple terms.

- The information is given in good faith for general guidance. Fees, dates and timings can change, so please confirm with the school office.
- Please do not misuse the website, try to break into it, or send false enquiries.
- The logo, photos and text belong to {{school}}. Please do not copy them without permission.
- The Parent and Student Login is only for registered families and staff. Keep your password private and do not share it.
- Links to other websites are given for convenience. We are not responsible for what those websites contain.

## Changes
We may update this page from time to time. The date at the top shows when it was last updated.

## Contact
{{school}}, {{address}}
Phone: {{phone}}
Email: {{email}}` },
    { k:'refund', icon:'💳', title:'Fee & Refund Policy', hint:'How fees are paid and when a refund is possible. The school must write its own rules.',
      starter:`## Paying fees
Fees are paid at the school office against a numbered receipt. Please keep your receipt safe, because it is your proof of payment.

## Refunds
[[FILL IN: write the school's real refund rules here, for example which fees can be refunded, within how many days, and how the refund is paid.]]

## Fees that are not refundable
[[FILL IN: for example, "The admission fee, once paid, is not refundable."]]

## How to ask for a refund
Please meet the school office with your receipt. An approved refund is recorded by the office and given to you in writing.

## Contact
{{school}}, {{address}}
Phone: {{phone}}
Email: {{email}}` },
    { k:'admission', icon:'📝', title:'Admission Policy', hint:'Optional. Age limits, documents needed and how admission works.',
      starter:`## How admission works
[[FILL IN: describe the steps, for example enquiry, visit, form, documents, fee payment.]]

## Age and class
[[FILL IN: the age needed for each class.]]

## Documents needed
[[FILL IN: for example birth certificate, transfer certificate, previous marks, photographs, Aadhaar.]]

## Contact
{{school}}, {{address}}
Phone: {{phone}}
Email: {{email}}` }
  ];
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  async function wcLoad(){
    wcLoadOk = false;
    try{ const r = await fetch(KEY, { credentials:'same-origin' }); wcLoadOk = r.ok; wcData = r.ok ? await r.json() : {}; }catch(e){ wcLoadOk = false; wcData = {}; }
    wcData = wcData || {};
    SECTIONS.forEach(s => { if(!Array.isArray(wcData[s.k])) wcData[s.k] = []; });
    ['admission','ratio','recognition','transport','academics','results','visible','policies'].forEach(k => { wcData[k] = wcData[k] || {}; });
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
  function policyHtml(){
    return `<section class="sf-card cm-post">
      <h3 class="cm-h">📜 Policy pages</h3>
      <p class="cm-sub">Privacy, terms and fee rules for the public website. They appear as links in the website footer only when you tick <b>Show on website</b>. Use the starter text, then edit it so it says what your school really does. Not legal advice: please read it carefully before showing it.</p>
      ${POLICIES.map(p => {
        const d = wcData.policies[p.k] || {};
        const pending = /\[\[FILL IN/i.test(d.body || '');
        return `<div class="wc-item">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;"><b>${p.icon} ${p.title}</b>
            <label class="wc-show"><input type="checkbox" ${d.show === true ? 'checked' : ''} onchange="wcPolSet('${p.k}','show',this.checked)"> Show on website</label></div>
          <p class="cm-sub" style="margin:4px 0 8px;">${p.hint}${d.updated ? ' · Last edited ' + E(d.updated.split('-').reverse().join('/')) : ''}</p>
          <textarea id="wcPol_${p.k}" rows="12" style="width:100%;" placeholder="Empty. Press “Use starter text” to begin." oninput="wcPolSet('${p.k}','body',this.value)">${E(d.body || '')}</textarea>
          <div class="wc-actions"><button type="button" class="sf-btn sf-btn--soft" onclick="wcPolStarter('${p.k}')">✨ Use starter text</button>
            <span class="cm-sub" id="wcPolNote_${p.k}" style="margin:0;color:#A80D5D;">${pending ? 'Replace every [[FILL IN: …]] before showing this page.' : ''}</span></div>
        </div>`;
      }).join('')}
    </section>`;
  }
  window.wcPolSet = (k, f, v) => {
    const p = (wcData.policies[k] = wcData.policies[k] || { title: (POLICIES.find(x => x.k === k) || {}).title || k });
    p[f] = v;
    if(f === 'body'){
      p.updated = todayIso();
      const n = document.getElementById('wcPolNote_' + k);
      if(n) n.textContent = /\[\[FILL IN/i.test(v) ? 'Replace every [[FILL IN: …]] before showing this page.' : '';
    }
  };
  window.wcPolStarter = async function(k){
    const def = POLICIES.find(x => x.k === k); if(!def) return;
    const ta = document.getElementById('wcPol_' + k); if(!ta) return;
    if(ta.value.trim()){
      const ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog('Replace what is written here with the starter text?', { title: 'Use starter text' }) : true;
      if(!ok) return;
    }
    ta.value = def.starter; wcPolSet(k, 'body', def.starter);
  };

  /* ================= Website module screen ================= */
  const byId = id => document.getElementById(id);
  const showEl = (id, on) => { const e = byId(id); if(e) e.style.display = on ? '' : 'none'; };
  const WEB_TABS = [
    { k:'overview', icon:'🏠', label:'Overview', perm:'websitegallery' },
    { k:'home', icon:'🎯', label:'Home & Banner', perm:'websitegallery' },
    { k:'pages', icon:'📄', label:'Pages', perm:'websitegallery' },
    { k:'people', icon:'🏆', label:'Alumni & Awards', perm:'websitegallery' },
    { k:'policies', icon:'📜', label:'Policies', perm:'websitegallery' },
    { k:'gallery', icon:'🖼️', label:'Gallery', perm:'websitegallery' },
    { k:'notices', icon:'📌', label:'Notices', perm:'noticeboard' },
    { k:'enquiries', icon:'💬', label:'Enquiries', perm:'websiteinquiries' }
  ];
  const allowedViews = () => { try{ return (typeof getRoleViews === 'function' && currentUser) ? (getRoleViews(currentUser.role) || []) : []; }catch(e){ return []; } };
  const webTabsAllowed = () => { const a = allowedViews(); return WEB_TABS.filter(t => a.includes(t.perm)); };
  const newEnquiries = () => (typeof admissionInquiries !== 'undefined' && Array.isArray(admissionInquiries)) ? admissionInquiries.filter(x => (x.status || 'New') === 'New').length : 0;
  const websiteNotices = () => (typeof commsMessages !== 'undefined' && Array.isArray(commsMessages) && typeof nbxIsWebsite === 'function')
    ? commsMessages.filter(n => nbxIsWebsite(n)).sort((a, b) => String(b.id).localeCompare(String(a.id))) : [];

  function ensureCss(){
    if(byId('webCss')) return;
    const st = document.createElement('style'); st.id = 'webCss';
    st.textContent = `.wc-item{border:1px solid var(--border);border-radius:14px;padding:14px;margin:12px 0;background:var(--cream)}
.wc-actions{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.wc-show{font-size:.82rem;font-weight:600}
.wc-vis{display:block;margin:6px 0 12px;color:var(--brand-navy)}
.wc-bar{position:sticky;bottom:0;background:var(--white);padding:12px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:3}
.web-tabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px}.web-tabs .mf-tab{padding:8px 10px;font-size:.82rem;white-space:nowrap}
.web-badge{display:inline-block;min-width:18px;padding:0 6px;margin-left:6px;border-radius:99px;background:#A80D5D;color:#fff;font-size:.7rem;font-weight:700;line-height:18px;text-align:center}
.web-unsaved{display:inline-block;padding:4px 10px;border-radius:99px;background:#FFF3D6;color:#7A5200;font-size:.78rem;font-weight:700}
.web-feed{font-size:.82rem;margin:0 0 12px}.web-feed b{font-weight:700}
.web-todo{margin:0;padding:0;list-style:none}.web-todo li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border)}.web-todo li:first-child{border-top:0}
.web-ov td small{display:block;color:var(--ink-soft)}
.web-warn{border:1px solid #E3B7B7;background:#FFF1F1;color:#8A1F1F;border-radius:14px;padding:14px;margin:0 0 14px}`;
    document.head.appendChild(st);
  }
  function paintTop(){
    const el = byId('webTopActions'); if(!el) return;
    let u = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.website) ? String(schoolInfo.website).trim() : '';
    if(u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    if(!/^https?:\/\/[^\s"'<>]+$/i.test(u)) u = '';
    el.innerHTML = (wcDirty ? '<span class="web-unsaved" id="webUnsavedTop">● Unsaved changes</span> ' : '') +
      (u ? `<a class="sf-btn sf-btn--soft" href="${E(u)}" target="_blank" rel="noopener">🌐 View website</a>` : '');
  }
  function paintTabs(){
    const el = byId('webTabs'); if(!el) return;
    el.innerHTML = webTabsAllowed().map(t => {
      const n = t.k === 'enquiries' ? newEnquiries() : 0;
      return `<button type="button" class="mf-tab ${webTab === t.k ? 'active' : ''}" onclick="webGo('${t.k}')">${t.icon} ${t.label}${n ? `<span class="web-badge" title="New enquiries waiting">${n}</span>` : ''}</button>`;
    }).join('');
  }
  function markDirty(){
    wcDirty = true;
    const a = byId('webUnsavedTop'); if(!a) paintTop();
    const b = byId('wcDirty'); if(b) b.textContent = '● Unsaved changes';
    const m = byId('wcMsg'); if(m && /^Saved/.test(m.textContent)) m.textContent = '';
  }

  /* ---- editable blocks (same fields and storage keys as before; only the grouping changed) ---- */
  const secOn = s => (wcData.visible || {})[s.visKey || s.k] !== false;
  const SEC = k => sectionHtml(SECTIONS.find(s => s.k === k));
  const BLOCKS = {
    recognition: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">🏛️ Recognition, registration &amp; board</h3>
        <p class="cm-sub">Shown in the website's recognition strip. Registration, UDISE and other numbers are deliberately NOT shown on the public site.</p>
        ${vis('recognition','Show the Recognition strip on the website')}
        <div class="form-grid">
          ${[['board','Board','State Board of Andhra Pradesh'],['medium','Medium of instruction','English'],['recognition','Recognition heading (shown as the strip title)','Recognised by Govt. of AP'],['timings','School timings (e.g. 8:45 AM – 4:00 PM)','']].map(x => `<div class="f-field"><label>${x[1]}</label><input type="text" value="${E(wcData.recognition[x[0]])}" oninput="wcSetKey('recognition','${x[0]}',this.value)" placeholder="${E(x[2])}"></div>`).join('')}
        </div>
      </section>`,
    admission: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">📢 Admissions banner</h3>
        <p class="cm-sub">A slim banner across the top of the website. Switch it on when admissions are open and off when they close.</p>
        <label class="wc-show"><input type="checkbox" ${wcData.admission.open ? 'checked' : ''} onchange="wcSetKey('admission','open',this.checked)"> Show the admissions banner</label>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Banner text</label><input type="text" value="${E(wcData.admission.heading)}" oninput="wcSetKey('admission','heading',this.value)" placeholder="Admissions open for 2027–28"></div>
          <div class="f-field"><label>Last date / extra note</label><input type="text" value="${E(wcData.admission.lastDate)}" oninput="wcSetKey('admission','lastDate',this.value)" placeholder="Last date: 31 March"></div>
          <div class="f-field"><label>Office hours (shown under the admission form)</label><input type="text" value="${E(wcData.admission.hours)}" oninput="wcSetKey('admission','hours',this.value)" placeholder="Mon–Sat, 9:00 AM – 4:00 PM"></div>
        </div>
      </section>`,
    results: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">📈 Latest results snapshot</h3>
        <p class="cm-sub">Shows as a highlight tile in "At a glance". Enter real figures only; leave blank to hide.</p>
        <div class="form-grid">
          <div class="f-field"><label>Exam / year (e.g. SSC 2026)</label><input type="text" value="${E(wcData.results.label)}" oninput="wcSetKey('results','label',this.value)"></div>
          <div class="f-field"><label>Pass percentage (e.g. 100%)</label><input type="text" value="${E(wcData.results.pass)}" oninput="wcSetKey('results','pass',this.value)"></div>
        </div>
      </section>`,
    glance: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">👩‍🏫 Teacher : student ratio</h3>
        <p class="cm-sub">Currently counted from the ERP: <b>${wcData._counts ? wcData._counts.students : '—'}</b> active students and <b>${wcData._counts ? wcData._counts.teachers : '—'}</b> staff whose designation contains "teacher". Type your own figure below to override.</p>
        ${vis('glance','Show the "At a glance" strip (students, teachers, ratio) on the website')}
        <div class="form-grid"><div class="f-field"><label>Show this instead (optional, e.g. 1 : 20)</label><input type="text" value="${E(wcData.ratio.manual)}" oninput="wcSetKey('ratio','manual',this.value)"></div></div>
      </section>`,
    transport: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">📍 Vehicle facility &amp; GPS</h3>
        <p class="cm-sub">Tick if your vehicles have GPS. The website's Vehicle Facility card then shows a "GPS enabled" badge (no tracking link is shown).</p>
        ${vis('transport','Show the Vehicle Facility card on the website')}
        <label class="wc-show"><input type="checkbox" ${wcData.transport.gps ? 'checked' : ''} onchange="wcSetKey('transport','gps',this.checked)"> Our vehicles are GPS-enabled</label>
        <div class="form-grid" style="margin-top:12px;"><div class="f-field full"><label>Short note (optional)</label><input type="text" value="${E(wcData.transport.note)}" oninput="wcSetKey('transport','note',this.value)" placeholder="e.g. Parents can ask the office about live location"></div></div>
      </section>`,
    academics: () => `<section class="sf-card cm-post">
        <h3 class="cm-h">📚 What is taught (optional)</h3>
        <p class="cm-sub">Leave blank to use the standard text. One point per line; replaces the list on that stage's card.</p>
        ${vis('academics','Show the Academics section on the website')}
        <div class="form-grid">
          ${[['preKg','Pre-KG (Baby, LKG, UKG)'],['primary','Primary (1st–5th)'],['high','High School (6th–10th)']].map(x => `<div class="f-field full"><label>${x[1]}</label><textarea rows="4" oninput="wcSetKey('academics','${x[0]}',this.value)">${E(wcData.academics[x[0]])}</textarea></div>`).join('')}
        </div>
      </section>`
  };
  const TAB_CONTENT = {
    home: { title: 'Home & Banner', blurb: 'What visitors see first: the recognition strip, the admissions banner, the results tile and the "At a glance" numbers.', cards: () => [BLOCKS.recognition(), BLOCKS.admission(), BLOCKS.results(), BLOCKS.glance()] },
    pages: { title: 'Pages', blurb: 'The text and facilities cards inside the website: what is taught, vehicles, safety and download buttons.', cards: () => [BLOCKS.academics(), BLOCKS.transport(), SEC('safety'), SEC('downloads')] },
    people: { title: 'Alumni & Achievements', blurb: 'Pride of the school. Only add what really happened.', cards: () => [SEC('alumni'), SEC('achievements')] },
    policies: { title: 'Policies', blurb: '', cards: () => [policyHtml()] }
  };
  function saveBar(){
    return `<div class="wc-bar">${typeof sfBtn === 'function' ? sfBtn('primary','','Save changes','wcSave()','sf-btn--lg') : '<button class="btn btn-primary" onclick="wcSave()">Save changes</button>'}
      <span class="web-unsaved" id="wcDirty" style="${wcDirty ? '' : 'display:none'}">● Unsaved changes</span>
      <span class="cm-sub" id="wcMsg" style="margin:0;">Saving keeps everything you changed on the Website pages.</span></div>`;
  }
  function paintContentTab(tab){
    const pane = byId('webPaneContent'); if(!pane) return;
    const def = TAB_CONTENT[tab]; if(!def) return;
    pane.innerHTML = (def.blurb ? `<p class="cm-sub" style="margin:0 0 6px;">${def.blurb}</p>` : '') + def.cards().join('') + saveBar();
    const d = byId('wcDirty'); if(d) d.style.display = wcDirty ? '' : 'none';
  }

  /* ---- data helpers ---- */
  window.wcSet = (k, i, f, v) => { wcData[k][i][f] = v; };
  window.wcSetKey = (g, f, v) => { wcData[g][f] = v; };
  window.wcAdd = k => { wcData[k].push({ id: 'w' + Date.now(), show: true }); markDirty(); paintContentTab(webTab); };
  window.wcRemove = async (k, i) => {
    const msg = 'Remove this item from the website?';
    const ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog(msg, { title: 'Remove item' }) : confirm(msg);
    if(!ok) return;
    wcData[k].splice(i, 1); markDirty(); paintContentTab(webTab);
  };
  // Anything typed or ticked marks the page as "unsaved" (the data itself is set by the original handlers).
  ['wcSet','wcSetKey','wcVis','wcPolSet'].forEach(n => { const f = window[n]; window[n] = function(){ const r = f.apply(this, arguments); markDirty(); return r; }; });

  window.wcSave = async function(){
    if(wcBusy) return;
    const msg = byId('wcMsg');
    const say = m => { if(msg) msg.textContent = m; if(typeof showToast === 'function') showToast(m); };
    if(!wcData || !wcLoadOk){ say('Saving is switched off because the current website content could not be loaded. Refresh the page and try again.'); return; }
    const unfinished = POLICIES.filter(p => { const d = wcData.policies[p.k] || {}; return d.show === true && /\[\[FILL IN/i.test(d.body || ''); });
    if(unfinished.length){
      say('Finish the ' + unfinished.map(p => p.title).join(' and ') + ' first (replace the [[FILL IN: …]] parts), or untick Show on website.'); return;
    }
    wcBusy = true;
    if(msg) msg.textContent = 'Saving…';
    try{
      const out = JSON.parse(JSON.stringify(wcData)); delete out._counts;
      const r = await fetch(KEY, { method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json', ...(typeof actorHeaders === 'function' ? actorHeaders() : {})}, body: JSON.stringify(out) });
      if(!r.ok) throw new Error('Could not save (' + r.status + ')');
      wcDirty = false;
      const d = byId('wcDirty'); if(d) d.style.display = 'none';
      paintTop();
      if(msg) msg.textContent = 'Saved. The website shows this within a minute.';
      if(typeof showToast === 'function') showToast('Website content saved');
    }catch(e){ say(e.message); }
    wcBusy = false;
  };

  /* ---- Overview ---- */
  function overviewData(){
    const v = k => (wcData.visible || {})[k] !== false;
    const rec = wcData.recognition || {}, ad = wcData.admission || {}, res = wcData.results || {}, tr = wcData.transport || {}, ac = wcData.academics || {}, ra = wcData.ratio || {};
    const rows = [], todo = [];
    const add = (tab, icon, name, state, text) => rows.push({ tab, icon, name, state, text });
    add('home','🏛️','Recognition strip', v('recognition') ? 'live' : 'off', v('recognition') ? (rec.recognition || rec.board || 'Standard text') : 'Hidden');
    if(ad.open && !String(ad.heading || '').trim()){ add('home','📢','Admissions banner','todo','On, but the banner text is empty'); todo.push({ tab:'home', text:'The admissions banner is switched on but has no text.' }); }
    else add('home','📢','Admissions banner', ad.open ? 'live' : 'off', ad.open ? (ad.heading || '') : 'Off');
    add('home','📈','Results snapshot', (res.label && res.pass) ? 'live' : 'off', (res.label && res.pass) ? `${res.label} · ${res.pass}` : 'Not filled in (tile not shown)');
    add('home','👩‍🏫','At a glance numbers', v('glance') ? 'live' : 'off', v('glance') ? (ra.manual ? `Ratio set to ${ra.manual}` : 'Counted from the ERP') : 'Hidden');
    const custom = ['preKg','primary','high'].filter(k => String(ac[k] || '').trim()).length;
    add('pages','📚','What is taught', v('academics') ? 'live' : 'off', v('academics') ? (custom ? `Your own text for ${custom} stage${custom > 1 ? 's' : ''}` : 'Standard text') : 'Hidden');
    add('pages','📍','Vehicle facility', v('transport') ? 'live' : 'off', v('transport') ? (tr.gps ? 'Shown, GPS enabled' : 'Shown') : 'Hidden');
    SECTIONS.forEach(s => {
      const n = (wcData[s.k] || []).filter(i => i && i.show !== false).length;
      const page = (s.k === 'alumni' || s.k === 'achievements') ? 'people' : 'pages';
      const on = secOn(s);
      add(page, s.icon, s.title, on && n ? 'live' : 'off', !on ? 'Hidden' : n ? `${n} shown` : 'Nothing added yet');
    });
    POLICIES.forEach(p => {
      const d = wcData.policies[p.k] || {}, body = String(d.body || '').trim(), pend = /\[\[FILL IN/i.test(body);
      if(d.show === true && body && !pend) add('policies', p.icon, p.title, 'live', 'Shown in the website footer');
      else if(body && pend){ add('policies','' + p.icon, p.title, 'todo', 'Draft not finished'); todo.push({ tab:'policies', text:`The ${p.title} draft still has [[FILL IN]] parts.` }); }
      else if(body) add('policies', p.icon, p.title, 'off', 'Written, not shown');
      else add('policies', p.icon, p.title, 'off', 'Not written');
    });
    const photos = (typeof websiteGallery !== 'undefined' && Array.isArray(websiteGallery)) ? websiteGallery.length : 0;
    add('gallery','🖼️','Gallery photos', photos ? 'live' : 'off', photos ? `${photos} photo${photos > 1 ? 's' : ''}` : 'No photos yet');
    const notices = websiteNotices().length;
    add('notices','📌','Notices on the website', notices ? 'live' : 'off', notices ? `${notices} notice${notices > 1 ? 's' : ''}` : 'None right now');
    const ne = newEnquiries();
    if(ne) todo.push({ tab:'enquiries', text:`${ne} new admission enquir${ne > 1 ? 'ies are' : 'y is'} waiting for a call.` });
    { let u = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.website) ? String(schoolInfo.website).trim() : '';
      if(!u) todo.push({ view:'schoolprofile', text:'Your website address is not set in School Profile, so the "View website" button is hidden.' }); }
    if(wcDirty) todo.push({ tab: webTab === 'overview' ? 'home' : webTab, text:'You have changes that are not saved yet.' });
    return { rows, todo, photos, notices, ne, live: rows.filter(r => r.state === 'live').length };
  }
  function paintOverview(){
    const pane = byId('webPaneOverview'); if(!pane) return;
    if(!wcLoadOk){ pane.innerHTML = `<div class="web-warn"><b>Could not load the website content.</b><br>Saving is switched off so nothing on the live website can be overwritten by mistake. Please refresh the page and try again.</div>`; return; }
    const o = overviewData();
    const badge = s => s === 'live' ? '<span class="sf-badge sf-badge--paid"><span aria-hidden="true">✓</span>Live</span>' : s === 'todo' ? '<span class="sf-badge sf-badge--overdue"><span aria-hidden="true">!</span>Needs attention</span>' : '<span class="sf-badge sf-badge--upcoming">Hidden</span>';
    const tabLabel = k => (WEB_TABS.find(t => t.k === k) || {}).label || k;
    const can = k => webTabsAllowed().some(t => t.k === k);
    const kpi = typeof sfKpi === 'function' ? sfKpi : (a, b) => `<div><b>${b}</b> ${a}</div>`;
    pane.innerHTML = `
      <p class="web-feed">${webFeedOk === null ? '' : webFeedOk ? '<b style="color:#1f7a4d;">● Connected.</b> The website can read these settings.' : '<b style="color:#A80D5D;">● Could not check the website feed.</b> Try again in a moment.'}</p>
      <section class="sf-kpis">
        ${kpi('Website parts showing', o.live, 'good', `out of ${o.rows.length} parts`)}
        ${kpi('Gallery photos', o.photos, 'plain', 'on the website')}
        ${kpi('Notices on website', o.notices, 'plain', 'public notices')}
        ${kpi('New enquiries', o.ne, o.ne ? 'danger' : 'plain', 'waiting for a call')}
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">✅ Needs attention</h3>
        ${o.todo.length ? `<ul class="web-todo">${o.todo.map(t => `<li><span>${E(t.text)}</span>${t.view ? (allowedViews().includes('setup') ? `<button type="button" class="sf-btn sf-btn--soft" onclick="switchView('${t.view}')">Open School Profile</button>` : '') : (can(t.tab) ? `<button type="button" class="sf-btn sf-btn--soft" onclick="webGo('${t.tab}')">Open ${E(tabLabel(t.tab))}</button>` : '')}</li>`).join('')}</ul>` : '<p class="cm-sub" style="margin:0;">Nothing needs attention right now. 🎉</p>'}
      </section>
      <section class="sf-card cm-post">
        <h3 class="cm-h">🌐 What visitors see</h3>
        <p class="cm-sub">Each line is one part of your public website and where to change it.</p>
        <div class="table-wrap" style="overflow-x:auto;"><table class="iv-table web-ov"><thead><tr><th>Part of the website</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>
          ${o.rows.map(r => `<tr><td><b>${r.icon} ${E(r.name)}</b></td><td>${badge(r.state)}</td><td>${E(r.text)}</td><td class="sf-actions">${can(r.tab) ? `<button type="button" class="sf-btn sf-btn--soft" onclick="webGo('${r.tab}')">${E(tabLabel(r.tab))}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  /* ---- Notices (read-only list; notices are still written in Communication → Notice Board) ---- */
  function paintNotices(){
    const pane = byId('webPaneNotices'); if(!pane) return;
    const list = websiteNotices();
    const canBoard = allowedViews().includes('noticeboard');
    pane.innerHTML = `<section class="sf-card cm-post">
      <h3 class="cm-h">📌 Notices on the website <span class="iv-count">${list.length}</span></h3>
      <p class="cm-sub">These public notices are shown on the website now. Notices are written and taken down in the <b>Notice Board</b> (under Communication), because one notice can also go to parents and staff.</p>
      ${canBoard ? `<button type="button" class="sf-btn sf-btn--primary" onclick="switchView('noticeboard')">Open the Notice Board</button>` : ''}
      ${list.length ? `<div class="table-wrap" style="overflow-x:auto;margin-top:12px;"><table class="iv-table"><thead><tr><th>Date</th><th>Notice</th><th>Posted by</th></tr></thead><tbody>
        ${list.slice(0, 50).map(n => `<tr><td>${E(n.sentDate || '')}</td><td><b>${E(n.title || '')}</b></td><td>${E(n.sentBy || '')}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state" style="margin-top:12px;"><b>No public notices right now</b>Post one from the Notice Board and tick Public website.</div>'}
    </section>`;
  }

  /* ---- tab switching ---- */
  async function ensureContent(force){
    if(wcData && wcDirty) return;
    if(wcData && wcLoadOk && !force) return;
    await wcLoad();
    try{ const r = await fetch('/api/website-extras'); webFeedOk = r.ok; if(r.ok){ const c = await r.json(); wcData._counts = c.counts; } }catch(e){ webFeedOk = false; }
  }
  async function webShow(tab, force){
    const my = ++webSeq;
    webTab = tab; ensureCss(); paintTop(); paintTabs();
    ['webPaneOverview','webPaneContent','websiteGalleryBody','webPaneNotices','websiteInquiriesBody'].forEach(id => showEl(id, false));
    const loading = '<div class="empty-state"><b>Loading…</b></div>';
    if(tab === 'overview' || TAB_CONTENT[tab]){
      const paneId = tab === 'overview' ? 'webPaneOverview' : 'webPaneContent';
      showEl(paneId, true); byId(paneId).innerHTML = loading;
      if(tab === 'overview'){ try{ if(typeof refreshAdmissionInquiries === 'function') await refreshAdmissionInquiries(); }catch(e){} }
      await ensureContent(force);
      if(my !== webSeq) return;
      if(tab === 'overview'){ paintOverview(); paintTabs(); return; }
      if(!wcLoadOk){ byId(paneId).innerHTML = `<div class="web-warn"><b>Could not load the website content.</b><br>Saving is switched off so nothing on the live website can be overwritten by mistake. Please refresh the page and try again.</div>`; return; }
      paintContentTab(tab);
    }else if(tab === 'gallery'){
      showEl('websiteGalleryBody', true); if(typeof initWebsiteGalleryView === 'function') initWebsiteGalleryView();
    }else if(tab === 'notices'){
      showEl('webPaneNotices', true); paintNotices();
    }else if(tab === 'enquiries'){
      showEl('websiteInquiriesBody', true);
      if(typeof initWebsiteInquiriesView === 'function'){ initWebsiteInquiriesView(); setTimeout(() => { if(my === webSeq) paintTabs(); }, 600); }
    }
  }
  window.webGo = k => webShow(k, false);
  window.initWebsiteView = async function(hint){
    const tabs = webTabsAllowed(); if(!tabs.length) return;
    const keep = !hint && tabs.some(t => t.k === webTab);
    const want = (hint && tabs.some(t => t.k === hint)) ? hint : (keep ? webTab : tabs[0].k);
    await webShow(want, true);
  };
})();
