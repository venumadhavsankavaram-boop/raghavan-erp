/* ============================================================================
   Scouts & Guides (sidebar: Facilities -> Scouts & Guides).
   Units (Scouts, Guides, Cubs, Bulbuls ...), their members, meetings/activities with attendance,
   badge / level awards and printable certificates + a unit report.

   Self-contained: it adds its own sidebar button and screen, and wraps switchView so the screen opens
   like any other. Saved under the kv key 'scouts-guides' (module key 'scouts' for permissions).
   Admin and Principal manage everything. A Teacher only works on the units where they are the leader.
   Student / Parent logins never open this screen (they see a view-only card in their own portal).
   ========================================================================== */
(function(){
  'use strict';
  const KEY = 'scouts-guides';
  const KINDS = ['Scouts', 'Guides', 'Cubs', 'Bulbuls', 'Rovers', 'Rangers'];
  const DEFAULT_LEVELS = ['Pravesh (Entry)', 'Pratham Sopan', 'Dwitiya Sopan', 'Tritiya Sopan', 'Rajya Puraskar', 'Rashtrapati Award'];
  const MGR_ROLES = ['Admin', 'Principal'];
  let D = null, loaded = false, tab = 'units', selUnit = '', busy = false;
  const st = { q: '', cls: '', sec: '', actUnit: '', repUnit: '' };

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const $ = id => document.getElementById(id);
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '-' + m[2] + '-' + m[1] : (s || ''); };
  const stName = s => s ? (((s.firstName || '') + ' ' + (s.lastName || '')).trim() || '(no name)') : '(removed student)';
  const live = x => (typeof isActive === 'function') ? isActive(x) : (!x.status || String(x.status).toLowerCase() === 'active');
  const stList = () => (typeof students !== 'undefined' && Array.isArray(students)) ? students : [];
  const staffs = () => (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList : [];
  const toast = m => { if(typeof showToast === 'function') showToast(m); };

  /* ---------- pure logic (also used by the tests) ---------- */
  function newData(){ return { units: [], activities: [], awards: [], levels: DEFAULT_LEVELS.slice() }; }
  function normalise(d){
    d = (d && typeof d === 'object') ? d : {};
    return {
      units: Array.isArray(d.units) ? d.units : [], activities: Array.isArray(d.activities) ? d.activities : [],
      awards: Array.isArray(d.awards) ? d.awards : [],
      levels: (Array.isArray(d.levels) && d.levels.length) ? d.levels.filter(x => String(x || '').trim()) : DEFAULT_LEVELS.slice()
    };
  }
  /* May this person change this unit? Admin / Principal: any unit. Anyone else: only the unit they lead. */
  function canEditUnit(role, myStaffId, unit){
    if(!unit) return false;
    if(MGR_ROLES.indexOf(role) >= 0) return true;
    if(['Teacher', 'Staff'].indexOf(role) < 0) return false;
    return !!myStaffId && unit.leaderStaffId === myStaffId;
  }
  function unitActivities(data, unitId){ return data.activities.filter(a => a.unitId === unitId).sort((a, b) => String(b.date).localeCompare(String(a.date))); }
  function attendanceOf(data, unitId, studentId){
    const acts = unitActivities(data, unitId);
    const total = acts.length, present = acts.filter(a => (a.present || []).indexOf(studentId) >= 0).length;
    return { present: present, total: total, pct: total ? Math.round(present / total * 100) : 0 };
  }
  function awardsOf(data, studentId){ return data.awards.filter(a => a.studentId === studentId).sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  /* One student can be in only one unit at a time: adding to a unit removes them from any other. */
  function addMembers(data, unitId, ids){
    const set = new Set(ids);
    data.units.forEach(u => { u.members = (u.members || []).filter(m => !set.has(m)); });
    const u = data.units.find(x => x.id === unitId); if(!u) return 0;
    ids.forEach(i => { if(u.members.indexOf(i) < 0) u.members.push(i); });
    return ids.length;
  }
  function removeMember(data, unitId, studentId){
    const u = data.units.find(x => x.id === unitId); if(u) u.members = (u.members || []).filter(m => m !== studentId);
  }
  function unitOfStudent(data, studentId){ return data.units.find(u => (u.members || []).indexOf(studentId) >= 0) || null; }
  window.SG = { newData, normalise, canEditUnit, unitActivities, attendanceOf, awardsOf, addMembers, removeMember, unitOfStudent, DEFAULT_LEVELS, KINDS };

  /* ---------- who am I ---------- */
  const role = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : '';
  const isMgr = () => MGR_ROLES.indexOf(role()) >= 0;
  const myStaff = () => { try{ return staffs().find(s => s.linkedUserId === currentUser.id) || null; }catch(e){ return null; } };
  const myUnits = () => D.units.filter(u => canEditUnit(role(), (myStaff() || {}).id, u));
  const canEdit = u => canEditUnit(role(), (myStaff() || {}).id, u);

  /* ---------- data ---------- */
  async function load(){
    try{ D = normalise(await storageGet(KEY, newData())); loaded = true; }catch(e){ D = newData(); loaded = false; }
  }
  async function save(msg){
    if(busy) return false; busy = true;
    try{ await storageSet(KEY, D); if(msg) toast(msg); busy = false; return true; }
    catch(e){ busy = false; toast('Could not save. Please try again.'); return false; }
  }

  /* ---------- styles + shell ---------- */
  function css(){
    if($('sgCss')) return;
    const s = document.createElement('style'); s.id = 'sgCss';
    s.textContent = `
    .sg-wrap{display:grid;gap:16px}
    .sg-card{background:#fff;border:1px solid var(--border,#e4e1f0);border-radius:16px;padding:18px 20px}
    .sg-card h3{margin:0 0 6px;font-size:1.02rem;color:var(--navy,#211a4e)} .sg-sub{margin:0 0 12px;font-size:.82rem;color:var(--ink-soft,#5b5a73);line-height:1.5}
    .sg-units{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
    .sg-unit{border:1px solid var(--border,#e4e1f0);border-radius:14px;padding:14px 16px;background:linear-gradient(135deg,#f6f4ff,#fff);cursor:pointer;transition:box-shadow .15s}
    .sg-unit:hover,.sg-unit.on{box-shadow:0 0 0 2px var(--navy,#211a4e)} .sg-unit b{display:block;font-size:1rem;color:var(--navy,#211a4e)} .sg-unit small{display:block;color:var(--ink-soft,#5b5a73);margin-top:3px}
    .sg-pill{display:inline-block;font-size:.68rem;font-weight:700;letter-spacing:.04em;padding:3px 9px;border-radius:999px;background:rgba(24,143,134,.14);color:#0e6f68;margin-bottom:6px}
    .sg-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px} .sg-row .f-field{min-width:150px;flex:1 1 150px}
    .sg-table{width:100%;border-collapse:collapse;font-size:.86rem} .sg-table th{text-align:left;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft,#5b5a73);padding:8px 10px;border-bottom:1px solid var(--border,#e4e1f0)}
    .sg-table td{padding:9px 10px;border-bottom:1px solid rgba(0,0,0,.05);vertical-align:middle} .sg-table-wrap{overflow-x:auto}
    .sg-empty{padding:26px;text-align:center;color:var(--ink-soft,#5b5a73);border:1px dashed var(--border,#e4e1f0);border-radius:14px;font-size:.88rem}
    .sg-chk{display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:.88rem;cursor:pointer} .sg-chk input{width:18px;height:18px}
    .sg-scroll{max-height:340px;overflow:auto;border:1px solid var(--border,#e4e1f0);border-radius:12px;padding:6px 10px}
    .sg-tag{display:inline-block;background:rgba(203,154,46,.18);color:#7a5a10;border-radius:999px;padding:2px 10px;font-size:.74rem;font-weight:600;margin:2px 4px 2px 0}
    .sg-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}`;
    document.head.appendChild(s);
  }
  function installShell(){
    const v = $('view-scouts'); if(!v) return false;
    if(!$('sgBody')){
      v.innerHTML = `<div class="topbar"><div><h1>Scouts &amp; Guides</h1><p>Units, members, meetings and activities, badges and certificates.</p></div></div>
      <div class="mf-tabs" id="sgTabs">
        <button type="button" class="mf-tab" data-t="units">⚜️ Units &amp; Members</button>
        <button type="button" class="mf-tab" data-t="activities">📅 Activities</button>
        <button type="button" class="mf-tab" data-t="badges">🏅 Badges</button>
        <button type="button" class="mf-tab" data-t="reports">📄 Reports &amp; Certificates</button>
      </div><div id="sgBody" class="sg-wrap"></div>`;
      v.querySelectorAll('#sgTabs .mf-tab').forEach(b => b.addEventListener('click', () => { tab = b.getAttribute('data-t'); render(); }));
    }
    return true;
  }

  /* ---------- screens ---------- */
  function render(){
    const body = $('sgBody'); if(!body || !D) return;
    document.querySelectorAll('#sgTabs .mf-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-t') === tab));
    if(!isMgr() && !myUnits().length && tab !== 'units') tab = 'units';
    body.innerHTML = tab === 'units' ? unitsHtml() : tab === 'activities' ? activitiesHtml() : tab === 'badges' ? badgesHtml() : reportsHtml();
  }
  const kpi = (l, v, n) => (typeof sfKpi === 'function') ? sfKpi(l, v, 'plain', n) : `<div class="sg-card"><b>${v}</b> ${l}</div>`;
  const btn = (kind, label, fn) => (typeof sfBtn === 'function') ? sfBtn(kind, '', label, fn) : `<button type="button" class="btn btn-primary" onclick="${fn}">${label}</button>`;
  const leaderName = u => { const s = staffs().find(x => x.id === u.leaderStaffId); return s ? ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.name || '' : ''; };
  const visibleUnits = () => isMgr() ? D.units : myUnits();
  const unitOpts = (list, sel) => list.map(u => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('');

  function unitsHtml(){
    const list = visibleUnits();
    const total = new Set(D.units.reduce((a, u) => a.concat(u.members || []), [])).size;
    let h = `<section class="sf-kpis">${kpi('Units', D.units.length, 'Scouts, Guides and more')}${kpi('Members', total, 'students enrolled')}${kpi('Activities', D.activities.length, 'meetings and events logged')}${kpi('Badges awarded', D.awards.length, 'all units')}</section>`;
    if(isMgr()){
      const staffOpts = '<option value="">— choose a teacher —</option>' + staffs().filter(live).map(s => `<option value="${esc(s.id)}">${esc(((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.name || s.id)}</option>`).join('');
      h += `<div class="sg-card"><h3>Create a unit</h3><p class="sg-sub">For example a Scouts unit for boys and a Guides unit for girls. The leader is usually a teacher; only the leader (and Admin / Principal) can change that unit.</p>
        <div class="sg-row"><div class="f-field"><label>Type</label><select class="input" id="sgKind">${KINDS.map(k => `<option>${k}</option>`).join('')}</select></div>
        <div class="f-field"><label>Unit name</label><input class="input" id="sgName" placeholder="e.g. Raghavan Scouts Troop"></div>
        <div class="f-field"><label>Leader</label><select class="input" id="sgLeader">${staffOpts}</select></div>
        <div>${btn('primary', 'Add unit', 'sgAddUnit()')}</div></div></div>`;
    }
    if(!list.length){
      h += `<div class="sg-empty">${isMgr() ? 'No units yet. Create the first unit above.' : 'You are not the leader of any unit yet. Ask the Admin to assign you as a unit leader.'}</div>`;
      return h;
    }
    h += `<div class="sg-card"><h3>Units</h3><p class="sg-sub">Click a unit to manage its members.</p><div class="sg-units">${list.map(u => `<div class="sg-unit ${u.id === selUnit ? 'on' : ''}" onclick="sgPick('${esc(u.id)}')"><span class="sg-pill">${esc(u.kind)}</span><b>${esc(u.name)}</b><small>Leader: ${esc(leaderName(u) || 'not assigned')}</small><small>${(u.members || []).length} member${(u.members || []).length === 1 ? '' : 's'}</small></div>`).join('')}</div></div>`;
    const u = list.find(x => x.id === selUnit);
    if(u) h += memberPanel(u);
    return h;
  }
  function memberPanel(u){
    const members = (u.members || []).map(id => stList().find(s => s.id === id) || { id: id, firstName: '(removed student)' });
    members.sort((a, b) => stName(a).localeCompare(stName(b)));
    const classes = [...new Set(stList().map(s => s.className).filter(Boolean))];
    const ed = canEdit(u);
    let h = `<div class="sg-card"><h3>${esc(u.name)} — members</h3>`;
    if(isMgr()){
      const staffOpts = '<option value="">— not assigned —</option>' + staffs().map(s => `<option value="${esc(s.id)}" ${s.id === u.leaderStaffId ? 'selected' : ''}>${esc(((s.firstName || '') + ' ' + (s.lastName || '')).trim() || s.name || s.id)}</option>`).join('');
      h += `<div class="sg-row"><div class="f-field"><label>Unit name</label><input class="input" value="${esc(u.name)}" onchange="sgRenameUnit('${esc(u.id)}',this.value)"></div>
        <div class="f-field"><label>Leader</label><select class="input" onchange="sgSetLeader('${esc(u.id)}',this.value)">${staffOpts}</select></div>
        <div>${btn('soft', 'Delete unit', "sgDeleteUnit('" + esc(u.id) + "')")}</div></div>`;
    }
    h += members.length ? `<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Name</th><th>Class</th><th>Attendance</th><th>Badges</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${members.map(s => {
      const a = attendanceOf(D, u.id, s.id), aw = awardsOf(D, s.id);
      return `<tr><td>${esc(stName(s))}</td><td>${esc((s.className || '') + (s.section ? ' ' + s.section : ''))}</td><td>${a.total ? a.present + ' / ' + a.total + ' (' + a.pct + '%)' : '—'}</td><td>${aw.length ? aw.map(x => `<span class="sg-tag">${esc(x.level)}</span>`).join('') : '—'}</td>${ed ? `<td><button type="button" class="btn btn-ghost" onclick="sgRemoveMember('${esc(u.id)}','${esc(s.id)}')">Remove</button></td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>` : '<div class="sg-empty">No members yet.</div>';
    if(ed){
      h += `<h3 style="margin-top:18px;">Add students</h3><p class="sg-sub">A student can be in one unit only. Adding a student here moves them out of any other unit.</p>
        <div class="sg-row"><div class="f-field"><label>Class</label><select class="input" onchange="sgSetFilter('cls',this.value)"><option value="">All classes</option>${classes.map(c => `<option ${c === st.cls ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="f-field"><label>Search name</label><input class="input" value="${esc(st.q)}" oninput="sgSetFilter('q',this.value,true)" id="sgSearch" placeholder="Type a name"></div></div>
        <div class="sg-scroll" id="sgPool">${poolHtml(u)}</div><div class="sg-actions">${btn('primary', 'Add selected students', "sgAddMembers('" + esc(u.id) + "')")}</div>`;
    }
    return h + '</div>';
  }
  function poolHtml(u){
    const q = st.q.trim().toLowerCase();
    const list = stList().filter(s => live(s) && (u.members || []).indexOf(s.id) < 0 && (!st.cls || s.className === st.cls) && (!q || stName(s).toLowerCase().indexOf(q) >= 0)).sort((a, b) => stName(a).localeCompare(stName(b))).slice(0, 200);
    if(!list.length) return '<div class="sg-empty" style="border:0">No students match.</div>';
    return list.map(s => { const o = unitOfStudent(D, s.id); return `<label class="sg-chk"><input type="checkbox" class="sg-pick" value="${esc(s.id)}"> ${esc(stName(s))} <small style="color:var(--ink-soft)">${esc((s.className || '') + (s.section ? ' ' + s.section : ''))}${o ? ' · now in ' + esc(o.name) : ''}</small></label>`; }).join('');
  }

  function activitiesHtml(){
    const list = visibleUnits();
    if(!list.length) return '<div class="sg-empty">No units to show.</div>';
    if(!st.actUnit || !list.some(u => u.id === st.actUnit)) st.actUnit = list[0].id;
    const u = list.find(x => x.id === st.actUnit), ed = canEdit(u);
    const acts = unitActivities(D, u.id);
    let h = `<div class="sg-card"><div class="sg-row"><div class="f-field"><label>Unit</label><select class="input" onchange="sgSetFilter('actUnit',this.value)">${unitOpts(list, u.id)}</select></div></div>`;
    if(ed){
      const members = (u.members || []).map(id => stList().find(s => s.id === id)).filter(Boolean).sort((a, b) => stName(a).localeCompare(stName(b)));
      h += `<h3>Log a meeting or activity</h3><div class="sg-row"><div class="f-field"><label>Date</label><input type="date" class="input" id="sgActDate" value="${today()}"></div>
        <div class="f-field" style="flex:2 1 220px"><label>Title</label><input class="input" id="sgActTitle" placeholder="e.g. Weekly parade, Cleanliness drive, Camp"></div>
        <div class="f-field"><label>Place</label><input class="input" id="sgActPlace" placeholder="Optional"></div></div>
        <div class="f-field full"><label>Notes (optional)</label><textarea class="input" id="sgActNotes" rows="2"></textarea></div>
        <p class="sg-sub" style="margin-top:10px;">Tick who attended${members.length ? ' (everyone is ticked to start with)' : ''}.</p>
        ${members.length ? `<div class="sg-scroll">${members.map(s => `<label class="sg-chk"><input type="checkbox" class="sg-att" value="${esc(s.id)}" checked> ${esc(stName(s))}</label>`).join('')}</div>` : '<div class="sg-empty">Add members to this unit first.</div>'}
        <div class="sg-actions">${btn('primary', 'Save activity', 'sgSaveActivity()')}</div>`;
    }
    h += '</div>';
    h += `<div class="sg-card"><h3>Activities of ${esc(u.name)}</h3>${acts.length ? `<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Date</th><th>Title</th><th>Place</th><th>Present</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${acts.map(a => `<tr><td>${esc(fmtDate(a.date))}</td><td>${esc(a.title)}${a.notes ? `<br><small style="color:var(--ink-soft)">${esc(a.notes)}</small>` : ''}</td><td>${esc(a.place || '')}</td><td>${(a.present || []).length} / ${(u.members || []).length}</td>${ed ? `<td><button type="button" class="btn btn-ghost" onclick="sgDeleteActivity('${esc(a.id)}')">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="sg-empty">No activities logged yet.</div>'}</div>`;
    return h;
  }

  function badgesHtml(){
    const list = visibleUnits();
    if(!list.length) return '<div class="sg-empty">No units to show.</div>';
    const u = list.find(x => x.id === st.repUnit) || list[0]; st.repUnit = u.id;
    const ed = canEdit(u);
    const members = (u.members || []).map(id => stList().find(s => s.id === id)).filter(Boolean).sort((a, b) => stName(a).localeCompare(stName(b)));
    let h = `<div class="sg-card"><div class="sg-row"><div class="f-field"><label>Unit</label><select class="input" onchange="sgSetFilter('repUnit',this.value)">${unitOpts(list, u.id)}</select></div></div>`;
    if(ed){
      h += `<h3>Award a badge or level</h3><div class="sg-row"><div class="f-field"><label>Student</label><select class="input" id="sgAwStu">${members.map(s => `<option value="${esc(s.id)}">${esc(stName(s))}</option>`).join('')}</select></div>
        <div class="f-field"><label>Badge / level</label><select class="input" id="sgAwLevel">${D.levels.map(l => `<option>${esc(l)}</option>`).join('')}<option value="__other">Other (type below)…</option></select></div>
        <div class="f-field"><label>If other</label><input class="input" id="sgAwOther" placeholder="Badge name"></div>
        <div class="f-field"><label>Date</label><input type="date" class="input" id="sgAwDate" value="${today()}"></div>
        <div class="f-field"><label>Note (optional)</label><input class="input" id="sgAwNote"></div>
        <div>${btn('primary', 'Award', 'sgAward()')}</div></div>`;
    }
    h += '</div>';
    if(isMgr()){
      h += `<div class="sg-card"><h3>Badge &amp; level list</h3><p class="sg-sub">One per line, lowest to highest. These start with the usual Bharat Scouts &amp; Guides stages. Edit them to match what your unit follows.</p>
        <textarea class="input" id="sgLevels" rows="6">${esc(D.levels.join('\n'))}</textarea><div class="sg-actions">${btn('soft', 'Save list', 'sgSaveLevels()')}</div></div>`;
    }
    const rows = D.awards.filter(a => (u.members || []).indexOf(a.studentId) >= 0).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    h += `<div class="sg-card"><h3>Awarded in ${esc(u.name)}</h3>${rows.length ? `<div class="sg-table-wrap"><table class="sg-table"><thead><tr><th>Date</th><th>Student</th><th>Badge / level</th><th>Note</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(a => `<tr><td>${esc(fmtDate(a.date))}</td><td>${esc(stName(stList().find(s => s.id === a.studentId)))}</td><td><span class="sg-tag">${esc(a.level)}</span></td><td>${esc(a.note || '')}</td>${ed ? `<td><button type="button" class="btn btn-ghost" onclick="sgDeleteAward('${esc(a.id)}')">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="sg-empty">No badges awarded yet.</div>'}</div>`;
    return h;
  }

  function reportsHtml(){
    const list = visibleUnits();
    if(!list.length) return '<div class="sg-empty">No units to show.</div>';
    const u = list.find(x => x.id === st.repUnit) || list[0]; st.repUnit = u.id;
    const members = (u.members || []).map(id => stList().find(s => s.id === id)).filter(Boolean).sort((a, b) => stName(a).localeCompare(stName(b)));
    return `<div class="sg-card"><div class="sg-row"><div class="f-field"><label>Unit</label><select class="input" onchange="sgSetFilter('repUnit',this.value)">${unitOpts(list, u.id)}</select></div></div>
      <h3>Unit report</h3><p class="sg-sub">A printable list of the unit's members, attendance and badges.</p><div class="sg-actions">${btn('primary', 'Print unit report', "sgPrintReport('" + esc(u.id) + "')")}</div></div>
      <div class="sg-card"><h3>Participation certificates</h3><p class="sg-sub">One certificate per student, with the attendance and badges recorded so far.</p>
      ${members.length ? `<div class="sg-actions">${btn('primary', 'Print all certificates', "sgPrintCerts('" + esc(u.id) + "','')")}</div><div class="sg-table-wrap" style="margin-top:12px"><table class="sg-table"><tbody>${members.map(s => `<tr><td>${esc(stName(s))}</td><td style="text-align:right"><button type="button" class="btn btn-ghost" onclick="sgPrintCerts('${esc(u.id)}','${esc(s.id)}')">Print certificate</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="sg-empty">No members yet.</div>'}</div>`;
  }

  /* ---------- printing ---------- */
  function schoolName(){ return (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.name) || 'School'; }
  function printHtml(html){
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    f.onload = () => { try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Could not open the print window.'); } setTimeout(() => f.remove(), 180000); };
    f.srcdoc = html;
  }
  const PCSS = `body{font-family:Arial,Helvetica,sans-serif;color:#1d1b33;margin:0}.page{padding:14mm}h1{font-size:18pt;margin:0 0 2mm;color:#211a4e}h2{font-size:12pt;margin:0 0 6mm;color:#555;font-weight:400}
    table{width:100%;border-collapse:collapse;font-size:10pt}th,td{border:1px solid #bbb;padding:2mm 2.5mm;text-align:left;vertical-align:top}th{background:#f1eefb}
    .cert{page-break-after:always;border:3mm double #CB9A2E;margin:10mm;padding:16mm 12mm;text-align:center;min-height:150mm;box-sizing:border-box}.cert:last-child{page-break-after:auto}
    .cert .sch{font-size:15pt;letter-spacing:.04em;color:#211a4e;font-weight:700}.cert h1{font-size:26pt;margin:10mm 0 4mm;color:#CB9A2E}.cert .nm{font-size:22pt;font-weight:700;margin:8mm 0 4mm;color:#211a4e;border-bottom:1px solid #999;display:inline-block;padding:0 10mm 1mm}
    .cert p{font-size:12pt;line-height:1.7;margin:3mm 0}.cert .sig{display:flex;justify-content:space-between;margin-top:26mm;font-size:10pt}.cert .sig span{border-top:1px solid #444;padding-top:1.5mm;min-width:55mm}`;
  window.sgPrintReport = function(unitId){
    const u = D.units.find(x => x.id === unitId); if(!u) return;
    const members = (u.members || []).map(id => stList().find(s => s.id === id)).filter(Boolean).sort((a, b) => stName(a).localeCompare(stName(b)));
    const acts = unitActivities(D, u.id).slice().reverse();
    const rows = members.map((s, i) => { const a = attendanceOf(D, u.id, s.id); return `<tr><td>${i + 1}</td><td>${esc(stName(s))}</td><td>${esc((s.className || '') + (s.section ? ' ' + s.section : ''))}</td><td>${a.total ? a.present + ' / ' + a.total + ' (' + a.pct + '%)' : '—'}</td><td>${awardsOf(D, s.id).map(x => esc(x.level)).join(', ') || '—'}</td></tr>`; }).join('');
    const arows = acts.map(a => `<tr><td>${esc(fmtDate(a.date))}</td><td>${esc(a.title)}</td><td>${esc(a.place || '')}</td><td>${(a.present || []).length} / ${members.length}</td></tr>`).join('');
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(u.name)} report</title><style>${PCSS}</style></head><body><div class="page"><h1>${esc(schoolName())}</h1><h2>${esc(u.kind)} unit report — ${esc(u.name)} · Leader: ${esc(leaderName(u) || '—')} · Printed ${esc(fmtDate(today()))}</h2>
      <table><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Attendance</th><th>Badges</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No members</td></tr>'}</tbody></table>
      <h2 style="margin-top:8mm">Activities</h2><table><thead><tr><th>Date</th><th>Title</th><th>Place</th><th>Present</th></tr></thead><tbody>${arows || '<tr><td colspan="4">No activities logged</td></tr>'}</tbody></table></div></body></html>`);
  };
  window.sgPrintCerts = function(unitId, studentId){
    const u = D.units.find(x => x.id === unitId); if(!u) return;
    const ids = studentId ? [studentId] : (u.members || []);
    const pages = ids.map(id => stList().find(s => s.id === id)).filter(Boolean).sort((a, b) => stName(a).localeCompare(stName(b))).map(s => {
      const a = attendanceOf(D, u.id, s.id), aw = awardsOf(D, s.id);
      return `<div class="cert"><div class="sch">${esc(schoolName())}</div><h1>Certificate of Participation</h1><p>This is to certify that</p><div class="nm">${esc(stName(s))}</div>
        <p>of ${esc((s.className || '') + (s.section ? ' ' + s.section : ''))} has taken part in the activities of the<br><b>${esc(u.name)} (${esc(u.kind)})</b>${a.total ? ` and attended ${a.present} of ${a.total} meetings and activities` : ''}.</p>
        ${aw.length ? `<p>Badges and levels earned: <b>${aw.map(x => esc(x.level)).join(', ')}</b></p>` : ''}
        <div class="sig"><span>Unit Leader</span><span>Principal</span></div><p style="font-size:9pt;color:#777;margin-top:8mm">Date: ${esc(fmtDate(today()))}</p></div>`;
    }).join('');
    if(!pages){ toast('No students to print.'); return; }
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Certificates</title><style>${PCSS}</style></head><body>${pages}</body></html>`);
  };

  /* ---------- actions ---------- */
  const val = id => ($(id) ? $(id).value : '');
  window.sgPick = id => { selUnit = (selUnit === id) ? '' : id; st.q = ''; st.cls = ''; render(); };
  window.sgSetFilter = (k, v, keepFocus) => { st[k] = v; if(k === 'q' && $('sgPool')){ const u = D.units.find(x => x.id === selUnit); if(u) $('sgPool').innerHTML = poolHtml(u); return; } render(); };
  window.sgAddUnit = async () => {
    if(!isMgr()) return;
    const name = val('sgName').trim(); if(!name){ toast('Type a name for the unit.'); return; }
    if(D.units.some(u => u.name.toLowerCase() === name.toLowerCase())){ toast('A unit with this name already exists.'); return; }
    const u = { id: uid('su'), kind: val('sgKind') || 'Scouts', name: name, leaderStaffId: val('sgLeader'), members: [] };
    D.units.push(u); selUnit = u.id; if(await save('Unit created')) render();
  };
  window.sgRenameUnit = async (id, v) => { if(!isMgr()) return; const u = D.units.find(x => x.id === id); v = String(v || '').trim(); if(!u || !v) return; u.name = v; await save('Saved'); render(); };
  window.sgSetLeader = async (id, v) => { if(!isMgr()) return; const u = D.units.find(x => x.id === id); if(!u) return; u.leaderStaffId = v; await save('Leader saved'); render(); };
  window.sgDeleteUnit = async id => {
    if(!isMgr()) return; const u = D.units.find(x => x.id === id); if(!u) return;
    if(!window.confirm('Delete the unit "' + u.name + '" with its activities? Badges already awarded stay in the records of the students.')) return;
    D.units = D.units.filter(x => x.id !== id); D.activities = D.activities.filter(a => a.unitId !== id); selUnit = '';
    if(await save('Unit deleted')) render();
  };
  window.sgAddMembers = async id => {
    const u = D.units.find(x => x.id === id); if(!u || !canEdit(u)) return;
    const ids = Array.from(document.querySelectorAll('.sg-pick:checked')).map(c => c.value);
    if(!ids.length){ toast('Tick at least one student.'); return; }
    addMembers(D, id, ids); if(await save(ids.length + ' student' + (ids.length === 1 ? '' : 's') + ' added')) render();
  };
  window.sgRemoveMember = async (id, sid) => {
    const u = D.units.find(x => x.id === id); if(!u || !canEdit(u)) return;
    removeMember(D, id, sid); if(await save('Removed')) render();
  };
  window.sgSaveActivity = async () => {
    const u = D.units.find(x => x.id === st.actUnit); if(!u || !canEdit(u)) return;
    const title = val('sgActTitle').trim(), date = val('sgActDate');
    if(!title){ toast('Type a title for the activity.'); return; } if(!date){ toast('Choose the date.'); return; }
    const present = Array.from(document.querySelectorAll('.sg-att:checked')).map(c => c.value);
    D.activities.push({ id: uid('sa'), unitId: u.id, date: date, title: title, place: val('sgActPlace').trim(), notes: val('sgActNotes').trim(), present: present });
    if(await save('Activity saved')) render();
  };
  window.sgDeleteActivity = async id => {
    const a = D.activities.find(x => x.id === id); const u = a && D.units.find(x => x.id === a.unitId); if(!a || !canEdit(u)) return;
    if(!window.confirm('Delete this activity and its attendance?')) return;
    D.activities = D.activities.filter(x => x.id !== id); if(await save('Deleted')) render();
  };
  window.sgAward = async () => {
    const u = D.units.find(x => x.id === st.repUnit); if(!u || !canEdit(u)) return;
    const sid = val('sgAwStu'); let level = val('sgAwLevel'); if(level === '__other') level = val('sgAwOther').trim();
    if(!sid){ toast('Choose a student.'); return; } if(!level){ toast('Choose or type the badge.'); return; }
    if(D.awards.some(a => a.studentId === sid && a.level === level)){ toast('This student already has that badge.'); return; }
    D.awards.push({ id: uid('sw'), studentId: sid, unitId: u.id, level: level, date: val('sgAwDate') || today(), note: val('sgAwNote').trim() });
    if(await save('Badge awarded')) render();
  };
  window.sgDeleteAward = async id => {
    const a = D.awards.find(x => x.id === id); const u = a && D.units.find(x => x.id === a.unitId); if(!a || !canEdit(u)) return;
    if(!window.confirm('Delete this badge record?')) return;
    D.awards = D.awards.filter(x => x.id !== id); if(await save('Deleted')) render();
  };
  window.sgSaveLevels = async () => {
    if(!isMgr()) return;
    const lines = val('sgLevels').split('\n').map(x => x.trim()).filter(Boolean);
    if(!lines.length){ toast('Type at least one badge or level.'); return; }
    D.levels = lines; if(await save('List saved')) render();
  };

  /* ---------- open the screen ---------- */
  async function open(){
    css(); if(!installShell()) return;
    await load();
    if(!isMgr() && !myUnits().length) tab = 'units';
    if(!selUnit){ const l = visibleUnits(); if(l.length === 1) selUnit = l[0].id; }
    render();
  }
  window.initScoutsView = open;
})();
