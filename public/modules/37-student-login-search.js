/* ============================================================================
   Student/Parent Logins: modern search bar + pick a student by class and section.
   Search box is drawn once (typing no longer redraws it, so the cursor stays put);
   only the results below change. Class -> Section -> Student drop-downs narrow the list.
   ========================================================================== */
(function(){
  const S = { cls: '', sec: '', sid: '' };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const nm = s => ((s.firstName || '') + ' ' + (s.lastName || '')).trim();
  const active = () => students.filter(s => typeof isActive === 'function' ? isActive(s) : true);
  const num = v => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : 999; };
  const classes = () => Array.from(new Set(active().map(s => s.className).filter(Boolean))).sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b)));
  const sections = () => Array.from(new Set(active().filter(s => !S.cls || s.className === S.cls).map(s => s.section).filter(Boolean))).sort();
  const pool = () => active().filter(s => (!S.cls || s.className === S.cls) && (!S.sec || s.section === S.sec));
  const query = () => { const el = document.getElementById('splSearch'); return el ? el.value.trim().toLowerCase() : ''; };

  const css = `
  .spl-bar{background:#fff;border:1px solid #dde3ee;border-radius:16px;padding:14px;margin-bottom:18px;box-shadow:0 2px 10px rgba(30,40,80,.05)}
  .spl-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
  .spl-search{position:relative;flex:1 1 320px;min-width:240px}
  .spl-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:#7a86a3;pointer-events:none}
  .spl-search input{width:100%;box-sizing:border-box;height:46px;border:1.5px solid #cfd7e6;border-radius:999px;padding:0 42px 0 42px;font-size:15px;background:#f7f9fd;outline:none;transition:.15s}
  .spl-search input:focus{border-color:#4f46e5;background:#fff;box-shadow:0 0 0 4px rgba(79,70,229,.12)}
  .spl-x{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:0;background:#e8ecf5;color:#33405c;cursor:pointer;font-size:16px;line-height:1;display:none}
  .spl-sel{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:#5b6784;text-transform:uppercase;letter-spacing:.04em}
  .spl-sel select{height:46px;min-width:130px;border:1.5px solid #cfd7e6;border-radius:12px;padding:0 10px;background:#fff;font-size:14px;font-weight:500;color:#1f2a44;text-transform:none;letter-spacing:0}
  .spl-sel.stu select{min-width:220px}
  .spl-meta{display:flex;gap:10px;align-items:center;margin-top:10px;font-size:13px;color:#4a5878;flex-wrap:wrap}
  .spl-chip{background:#eef1fb;border-radius:999px;padding:3px 10px;font-weight:600;color:#33405c}
  .spl-link{border:0;background:none;color:#4f46e5;font-weight:600;cursor:pointer;padding:0}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  function studentOptions(){
    const list = pool().sort((a, b) => nm(a).localeCompare(nm(b)));
    return opt('', list.length ? 'All students (' + list.length + ')' : 'No students here', S.sid) + list.map(s => opt(s.id, nm(s) + (s.admissionNo ? ' · ' + s.admissionNo : '') + (S.cls ? '' : ' · ' + s.className + (s.section ? '-' + s.section : '')), S.sid)).join('');
  }

  function results(){
    const q = query();
    const logins = users.filter(u => u.role === 'Student' || u.role === 'Parent');
    const inPool = new Set(pool().map(s => s.id));
    const filtering = !!(S.cls || S.sec || S.sid);
    const linkedIds = new Set(logins.map(u => u.linkedStudentId).filter(Boolean));
    let missing = active().filter(s => !linkedIds.has(s.id));
    let vis = logins;
    if(filtering){
      vis = vis.filter(u => u.linkedStudentId && inPool.has(u.linkedStudentId));
      missing = missing.filter(s => inPool.has(s.id));
    }
    if(S.sid){ vis = vis.filter(u => u.linkedStudentId === S.sid); missing = missing.filter(s => s.id === S.sid); }
    if(q){
      const label = u => { const s = u.linkedStudentId ? students.find(x => x.id === u.linkedStudentId) : null; return s ? nm(s) : ''; };
      vis = vis.filter(u => (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q) || label(u).toLowerCase().includes(q));
      missing = missing.filter(s => nm(s).toLowerCase().includes(q) || (s.admissionNo || '').toLowerCase().includes(q));
    }
    const rows = vis.map(u => {
      const l = u.linkedStudentId ? students.find(s => s.id === u.linkedStudentId) : null;
      return `<tr><td class="name-cell">${esc(u.name)}</td><td class="id-cell">${esc(u.username)}</td><td><span class="role-pill">${esc(u.role)}</span></td>
        <td>${l ? esc(nm(l)) + ' — ' + esc(l.className) + (l.section ? '-' + esc(l.section) : '') : '—'}</td>
        <td><button class="btn-edit-text" onclick="editUser('${u.id}')">Fix Login</button> &nbsp;·&nbsp;<button class="btn-edit-text" onclick="adminResetPassword('${u.id}')">Reset password</button> &nbsp;·&nbsp;<button class="btn-edit-text" onclick="adminViewAs('${u.id}')">View as</button> &nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteUser('${u.id}')">Delete</button></td></tr>`;
    }).join('');
    const mrows = missing.map(s => `<tr><td class="name-cell">${esc(nm(s))}</td><td>${esc(s.className)}${s.section ? '-' + esc(s.section) : ''}</td><td>${esc(s.admissionNo || '—')}</td>
      <td><button class="btn-edit-text" onclick="openUserModal('${nm(s).replace(/'/g, "\\'")}', 'Student', '${s.id}', 'studentparent')">+ Create Login</button></td></tr>`).join('');
    const meta = document.getElementById('splMeta');
    if(meta){
      meta.innerHTML = `<span class="spl-chip">${vis.length} login${vis.length === 1 ? '' : 's'}</span>` + (missing.length ? `<span class="spl-chip" style="background:#fff3d6">${missing.length} without a login</span>` : '') + ((filtering || q) ? `<button class="spl-link" onclick="splClear()">Clear search and filters</button>` : '');
    }
    const x = document.getElementById('splX'); if(x) x.style.display = q ? 'block' : 'none';
    return `${missing.length ? `<div class="profile-card" style="margin-bottom:20px;background:rgba(203,154,46,0.08);border-left:4px solid var(--gold);">
        <h4>⚠ ${missing.length} active student${missing.length === 1 ? '' : 's'} with no login yet</h4>
        <p style="font-size:0.8rem;color:var(--ink-soft);margin:8px 0 12px;">Nothing is broken for these — they simply don't have a Student or Parent login created. Click Create Login to set one up.</p>
        <div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Admission No.</th><th></th></tr></thead><tbody>${mrows}</tbody></table></div></div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Linked Student</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5"><div class="empty-state"><b>No matching logins</b></div></td></tr>`}</tbody></table></div>`;
  }
  function paint(){ const box = document.getElementById('splResults'); if(box) box.innerHTML = results(); }
  function refill(){
    const sc = document.getElementById('splSec'); if(sc) sc.innerHTML = opt('', 'All sections', S.sec) + sections().map(x => opt(x, x, S.sec)).join('');
    const ss = document.getElementById('splStu'); if(ss) ss.innerHTML = studentOptions();
  }
  window.splClear = function(){ S.cls = S.sec = S.sid = ''; const i = document.getElementById('splSearch'); if(i) i.value = ''; const c = document.getElementById('splCls'); if(c) c.value = ''; refill(); paint(); };
  window.splPick = function(kind, v){
    if(kind === 'cls'){ S.cls = v; if(S.sec && !sections().includes(S.sec)) S.sec = ''; S.sid = ''; }
    if(kind === 'sec'){ S.sec = v; S.sid = ''; }
    if(kind === 'stu'){ S.sid = v; }
    refill(); paint();
  };
  window.onStudentParentLoginSearch = function(){ paint(); };

  window.renderStudentParentLoginsView = function(body){
    if(!body) return;
    if(S.sid && !students.some(s => s.id === S.sid)) S.sid = '';
    body.innerHTML = `
      <p style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:14px;max-width:680px;">
        Type a name, admission number or username, or narrow it down by class and section and pick the student.
        Use <b>Reset password</b> to give someone a temporary password (they must choose their own when they sign in), <b>View as</b> to open their account and help them, or <b>Fix Login</b> to edit the login.
        Passwords are stored scrambled, so they cannot be read back.
      </p>
      <div class="urx-resetreqs"></div>
      <div class="spl-bar">
        <div class="spl-row">
          <div class="spl-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input id="splSearch" type="text" autocomplete="off" placeholder="Search name, admission no. or username" oninput="onStudentParentLoginSearch()">
            <button type="button" class="spl-x" id="splX" aria-label="Clear search" onclick="document.getElementById('splSearch').value='';onStudentParentLoginSearch();document.getElementById('splSearch').focus()">×</button>
          </div>
          <label class="spl-sel">Class<select id="splCls" onchange="splPick('cls',this.value)">${opt('', 'All classes', S.cls)}${classes().map(c => opt(c, c, S.cls)).join('')}</select></label>
          <label class="spl-sel">Section<select id="splSec" onchange="splPick('sec',this.value)">${opt('', 'All sections', S.sec)}${sections().map(x => opt(x, x, S.sec)).join('')}</select></label>
          <label class="spl-sel stu">Student<select id="splStu" onchange="splPick('stu',this.value)">${studentOptions()}</select></label>
          <button class="btn btn-primary" style="height:46px" onclick="openUserModal(undefined, undefined, undefined, 'studentparent')">+ Add Login</button>
        </div>
        <div class="spl-meta" id="splMeta"></div>
      </div>
      <div id="splResults"></div>`;
    paint();
    if(typeof urxLoadResetRequests === 'function') urxLoadResetRequests();
  };
})();
