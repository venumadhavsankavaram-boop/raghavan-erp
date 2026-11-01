/* ============================================================================
   Online Exams — timed papers students take in the portal.
   * Teacher: builds a paper (MCQ, True/False, written answers) for a class they teach, sets the opening and
     closing time and the time allowed, and submits it. Admin/Principal approves it (or sends it back with a note).
   * Student: sees the exam on Home and in the "Online Exams" tab; once the window opens they start it, a countdown
     (kept by the server) runs, answers autosave, and the paper submits itself when time is up. One attempt.
   * Marking: MCQ / True-False are marked automatically; written answers are marked by the teacher.
   * Results stay separate from report-card marks and reach the student only when the teacher releases them.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isTeacher = () => role() === 'Teacher';
  const isMgr = () => ['Admin','Principal'].includes(role());
  const isStaff = () => isTeacher() || isMgr();
  const L = (en, te) => (typeof window.portalT === 'function') ? window.portalT(en, te) : en;
  const pad = n => String(n).padStart(2, '0');
  const fmt = ms => { const d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toLocalInput = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const toast = m => { try{ showToast(m); }catch(e){ console.log(m); } };
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const mk = n => (Math.round(n * 100) / 100);
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; throw err; }
    return j;
  }
  const PILL = {
    Submitted: ['#fdf0d0', '#8a5a00', 'Waiting for approval'],
    Approved:  ['#dff5e6', '#17703a', 'Approved'],
    Returned:  ['#fde4e1', '#b3261e', 'Sent back — please edit'],
  };
  const pill = st => { const p = PILL[st] || ['#eee', '#444', st]; return `<span class="oe-pill" style="background:${p[0]};color:${p[1]};">${esc(p[2])}</span>`; };

  function css(){
    if($('oeCss')) return;
    const s = document.createElement('style'); s.id = 'oeCss';
    s.textContent = `
      .oe-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:16px 18px;margin-bottom:14px;}
      .oe-card h3{margin:0 0 10px;font-size:1.05rem;color:var(--navy,#14325c);display:flex;justify-content:space-between;gap:8px;align-items:center;}
      .oe-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;} .oe-form .full{grid-column:1/-1;}
      .oe-form label,.oe-q label.l{font-size:.8rem;color:#667;display:block;margin-bottom:3px;}
      .oe-form input,.oe-form select,.oe-form textarea,.oe-q input[type=text],.oe-q input[type=number],.oe-q select,.oe-q textarea{width:100%;padding:9px;border:1px solid var(--border,#d6dcea);border-radius:10px;font:inherit;box-sizing:border-box;}
      .oe-pill{font-weight:700;font-size:.74rem;padding:3px 10px;border-radius:999px;white-space:nowrap;}
      .oe-row{padding:13px 0;border-top:1px solid #eef1f7;} .oe-row:first-of-type{border-top:0;}
      .oe-top{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;} .oe-top b{color:var(--navy,#14325c);font-size:1rem;}
      .oe-sm{font-size:.84rem;color:#667;margin-top:3px;white-space:pre-wrap;} .oe-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
      .oe-note{background:#fff5f4;border-left:4px solid #d93025;padding:8px 10px;border-radius:8px;margin-top:8px;font-size:.88rem;}
      .oe-q{border:1px solid #dfe5f1;border-radius:14px;padding:12px;margin-bottom:10px;background:#fbfcff;}
      .oe-q .hd{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:700;color:var(--navy,#14325c);}
      .oe-q .opt{display:flex;gap:8px;align-items:center;margin:6px 0;} .oe-q .opt input[type=text]{flex:1;}
      .oe-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px;}
      .oe-tile{background:#f4f7fd;border-radius:12px;padding:10px 12px;} .oe-tile b{display:block;font-size:1.3rem;color:var(--navy,#14325c);} .oe-tile span{font-size:.78rem;color:#667;}
      .oe-table{width:100%;border-collapse:collapse;font-size:.9rem;} .oe-table th,.oe-table td{text-align:left;padding:8px 6px;border-top:1px solid #eef1f7;} .oe-table th{font-size:.76rem;color:#667;border-top:0;}
      .oe-bar{height:8px;background:#e8edf6;border-radius:6px;overflow:hidden;min-width:80px;} .oe-bar i{display:block;height:100%;background:#2F80ED;}
      .oe-ans-ok{color:#17703a;font-weight:700;} .oe-ans-bad{color:#b3261e;font-weight:700;}
      /* student side */
      .oes-item{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:18px;padding:16px 18px;margin-bottom:12px;border-left:6px solid #2F80ED;display:flex;flex-direction:column;gap:6px;}
      .oes-item .t{font-weight:800;font-size:1.12rem;color:var(--navy,#14325c);} .oes-item .s{font-size:.98rem;color:#556;}
      .oes-btn{align-self:flex-start;margin-top:6px;padding:12px 22px;border:0;border-radius:12px;background:var(--navy,#14325c);color:#fff;font-weight:800;font-size:1.02rem;cursor:pointer;}
      .oes-btn.ghost{background:#eef3fb;color:var(--navy,#14325c);} .oes-btn[disabled]{opacity:.5;cursor:default;}
      #oeRun{position:fixed;inset:0;z-index:100000;background:#f3f6fc;display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;}
      #oeRun header{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#14325c;color:#fff;} #oeRun header b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #oeTimer{font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums;background:#fff;color:#14325c;border-radius:10px;padding:4px 12px;} #oeTimer.low{background:#d93025;color:#fff;animation:oePulse 1s infinite;}
      @keyframes oePulse{50%{opacity:.7}}
      #oeRunBody{flex:1;overflow:auto;padding:14px;max-width:820px;width:100%;margin:0 auto;box-sizing:border-box;}
      .oe-pal{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;} .oe-pal button{width:40px;height:40px;border-radius:10px;border:1px solid #cfd8ea;background:#fff;font-weight:700;cursor:pointer;font-size:.95rem;}
      .oe-pal button.done{background:#dff5e6;border-color:#8fd3a6;} .oe-pal button.cur{outline:3px solid #2F80ED;}
      .oe-qbox{background:#fff;border-radius:16px;padding:18px;border:1px solid #e3e8f3;} .oe-qbox .qt{font-size:1.2rem;font-weight:700;color:#14325c;white-space:pre-wrap;margin-bottom:14px;}
      .oe-choice{display:flex;gap:12px;align-items:center;padding:14px;border:2px solid #dbe3f2;border-radius:14px;margin:8px 0;cursor:pointer;font-size:1.08rem;background:#fff;}
      .oe-choice.sel{border-color:#2F80ED;background:#eaf2ff;} .oe-choice i{width:22px;height:22px;border-radius:50%;border:2px solid #9bb0d3;flex:none;} .oe-choice.sel i{background:#2F80ED;border-color:#2F80ED;box-shadow:inset 0 0 0 4px #eaf2ff;}
      #oeRun textarea{width:100%;min-height:140px;padding:12px;border:2px solid #dbe3f2;border-radius:14px;font:inherit;font-size:1.05rem;box-sizing:border-box;-webkit-user-select:text;user-select:text;}
      .oe-foot{display:flex;gap:10px;justify-content:space-between;padding:10px 14px;background:#fff;border-top:1px solid #e3e8f3;}
      .oe-modal{position:absolute;inset:0;background:rgba(10,20,40,.55);display:flex;align-items:center;justify-content:center;padding:20px;} .oe-modal>div{background:#fff;border-radius:18px;padding:22px;max-width:420px;width:100%;}
    `;
    document.head.appendChild(s);
  }

  /* ====================================================================== STAFF PAGE ===== */
  function ensureShell(){
    if(!isStaff()) return;
    css();
    const dash = $('view-dashboard');
    if(dash && !$('view-onlineexams')){
      const v = document.createElement('div'); v.id = 'view-onlineexams'; v.style.display = 'none';
      dash.parentNode.insertBefore(v, dash);
    }
    const anchor = $('navExamPlans') || $('navMaterial') || $('navSyllabus');
    if(anchor && !$('navOnlineExams')){
      const b = document.createElement('button'); b.className = 'sb-link'; b.id = 'navOnlineExams'; b.setAttribute('onclick', "switchView('onlineexams')");
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg></span> Online Exams';
      anchor.insertAdjacentElement('afterend', b);
    }
  }

  let exams = [], draft = null, noteFor = null, viewing = null, resData = null, marking = null;
  const targets = () => { const sc = (typeof myTeacherScope === 'function') ? myTeacherScope() : null; return (sc && sc.subjectSections) || []; };
  const blankQ = type => type === 'tf' ? { type: 'tf', text: '', answer: 0, marks: 1 } : type === 'short' ? { type: 'short', text: '', keyAnswer: '', marks: 5 } : { type: 'mcq', text: '', options: ['', '', '', ''], answer: 0, marks: 1 };
  const newDraft = () => { const t = targets()[0] || {}; const now = Date.now(); const start = Math.ceil((now + 3600000) / 900000) * 900000; return { id: '', title: '', className: t.className || '', section: t.section || '', subject: t.subject || '', durationMin: 30, startMs: start, endMs: start + 3 * 3600000, instructions: '', questions: [blankQ('mcq')] }; };

  function collect(){
    if(!draft || !$('oeTitle')) return;
    draft.title = $('oeTitle').value; draft.className = $('oeClass').value; draft.section = $('oeSection').value; draft.subject = $('oeSubject').value;
    draft.durationMin = parseInt($('oeDur').value, 10) || 0; draft.instructions = $('oeInstr').value;
    if($('oeStart').value) draft.startMs = new Date($('oeStart').value).getTime(); if($('oeEnd').value) draft.endMs = new Date($('oeEnd').value).getTime();
    draft.questions.forEach((q, i) => {
      const t = $('oeqt' + i); if(!t) return; q.text = t.value; q.marks = $('oeqm' + i).value;
      if(q.type === 'mcq') q.options = q.options.map((o, k) => { const e = $('oeqo' + i + '_' + k); return e ? e.value : o; });
      if(q.type === 'short'){ const k = $('oeqk' + i); if(k) q.keyAnswer = k.value; }
      const ch = document.querySelector('input[name="oeqa' + i + '"]:checked'); if(ch) q.answer = parseInt(ch.value, 10);
    });
  }

  function questionEditor(q, i){
    const head = `<div class="hd"><span>Question ${i + 1} · ${q.type === 'mcq' ? 'Multiple choice' : q.type === 'tf' ? 'True / False' : 'Written answer'}</span>
      <button class="btn btn-ghost btn-sm" type="button" onclick="oeRemoveQ(${i})">Remove</button></div>`;
    let body = `<label class="l">Question</label><textarea id="oeqt${i}" rows="2" maxlength="2000">${esc(q.text)}</textarea>`;
    if(q.type === 'mcq'){
      body += `<label class="l" style="margin-top:8px;">Options — tick the correct one</label>` + q.options.map((o, k) => `<div class="opt"><input type="radio" name="oeqa${i}" value="${k}" ${q.answer === k ? 'checked' : ''}><input type="text" id="oeqo${i}_${k}" maxlength="500" placeholder="Option ${String.fromCharCode(65 + k)}" value="${esc(o)}">${q.options.length > 2 ? `<button class="btn btn-ghost btn-sm" type="button" onclick="oeRemoveOpt(${i},${k})">✕</button>` : ''}</div>`).join('') +
        (q.options.length < 6 ? `<button class="btn btn-ghost btn-sm" type="button" onclick="oeAddOpt(${i})">+ Add option</button>` : '');
    }else if(q.type === 'tf'){
      body += `<label class="l" style="margin-top:8px;">Correct answer</label><div class="opt"><label><input type="radio" name="oeqa${i}" value="0" ${q.answer === 0 ? 'checked' : ''}> True</label> <label style="margin-left:14px"><input type="radio" name="oeqa${i}" value="1" ${q.answer === 1 ? 'checked' : ''}> False</label></div>`;
    }else{
      body += `<label class="l" style="margin-top:8px;">Model answer (only you and the Principal see this — helps while marking)</label><textarea id="oeqk${i}" rows="2" maxlength="2000">${esc(q.keyAnswer || '')}</textarea>`;
    }
    body += `<div style="max-width:140px;margin-top:8px;"><label class="l">Marks</label><input type="number" id="oeqm${i}" min="0.5" max="100" step="0.5" value="${esc(q.marks)}"></div>`;
    return `<div class="oe-q">${head}${body}</div>`;
  }

  function builderHtml(){
    const tg = targets();
    if(!tg.length) return `<div class="oe-sm">${(typeof myTeacherScope === 'function' && (myTeacherScope() || {}).unlinked) ? 'Your login is not linked to a staff profile yet — please ask the Admin.' : 'No classes or subjects are assigned to you yet — please ask the Admin.'}</div>`;
    const d = draft; const classes = [...new Set(tg.map(t => t.className))];
    const total = mk(d.questions.reduce((a, q) => a + num(q.marks), 0));
    return `<div class="oe-form">
      <div class="full"><label>Exam title</label><input id="oeTitle" maxlength="200" placeholder="e.g. Maths — Unit test 2" value="${esc(d.title)}"></div>
      <div><label>Class</label><select id="oeClass">${classes.map(c => `<option ${c === d.className ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label>Section</label><select id="oeSection"></select></div>
      <div><label>Subject</label><select id="oeSubject"></select></div>
      <div><label>Time allowed (minutes)</label><input type="number" id="oeDur" min="1" max="300" value="${esc(d.durationMin)}"></div>
      <div><label>Students can start from</label><input type="datetime-local" id="oeStart" value="${toLocalInput(d.startMs)}"></div>
      <div><label>Exam closes at</label><input type="datetime-local" id="oeEnd" value="${toLocalInput(d.endMs)}"></div>
      <div class="full oe-sm">Each student gets the full time allowed from the moment they press Start, but never beyond the closing time. Choose a closing time at least as long after the start as the time allowed.</div>
      <div class="full"><label>Instructions for students (optional)</label><textarea id="oeInstr" rows="2" maxlength="2000" placeholder="e.g. Answer all questions. Do not leave the screen.">${esc(d.instructions)}</textarea></div>
    </div>
    <h3 style="margin:16px 0 8px;font-size:1rem;color:var(--navy,#14325c);">Questions <span class="oe-sm">· ${d.questions.length} question${d.questions.length === 1 ? '' : 's'} · ${total} marks in total</span></h3>
    ${d.questions.map(questionEditor).join('')}
    <div class="oe-acts"><button class="btn btn-ghost btn-sm" type="button" onclick="oeAddQ('mcq')">+ Multiple choice</button><button class="btn btn-ghost btn-sm" type="button" onclick="oeAddQ('tf')">+ True / False</button><button class="btn btn-ghost btn-sm" type="button" onclick="oeAddQ('short')">+ Written answer</button></div>
    <div class="oe-acts" style="margin-top:16px;"><button class="btn btn-primary" id="oeSave" type="button" onclick="oeSubmit()">${d.id ? 'Resubmit for approval' : 'Submit for approval'}</button>${d.id ? ' <button class="btn btn-ghost" type="button" onclick="oeEdit(null)">Cancel</button>' : ''}<span class="oe-sm" id="oeMsg"></span></div>`;
  }
  function wireBuilder(){
    if(!$('oeClass')) return; const tg = targets(), d = draft;
    const fillSec = () => { const c = $('oeClass').value; const secs = [...new Set(tg.filter(t => t.className === c).map(t => t.section))];
      $('oeSection').innerHTML = secs.map(x => `<option ${x === d.section ? 'selected' : ''}>${esc(x)}</option>`).join(''); fillSub(); };
    const fillSub = () => { const c = $('oeClass').value, sec = $('oeSection').value; const subs = [...new Set(tg.filter(t => t.className === c && t.section === sec).map(t => t.subject))];
      $('oeSubject').innerHTML = subs.map(x => `<option ${x === d.subject ? 'selected' : ''}>${esc(x)}</option>`).join(''); };
    $('oeClass').onchange = () => { d.section = ''; d.subject = ''; fillSec(); }; $('oeSection').onchange = () => { d.subject = ''; fillSub(); };
    fillSec();
  }
  const redraw = () => { render(true); };
  window.oeAddQ = function(t){ collect(); draft.questions.push(blankQ(t)); redraw(); setTimeout(() => { const el = $('oeqt' + (draft.questions.length - 1)); if(el) el.focus(); }, 50); };
  window.oeRemoveQ = function(i){ collect(); if(draft.questions.length === 1){ toast('An exam needs at least one question.'); return; } draft.questions.splice(i, 1); redraw(); };
  window.oeAddOpt = function(i){ collect(); draft.questions[i].options.push(''); redraw(); };
  window.oeRemoveOpt = function(i, k){ collect(); const q = draft.questions[i]; q.options.splice(k, 1); if(q.answer >= q.options.length) q.answer = 0; else if(q.answer > k) q.answer--; redraw(); };
  window.oeEdit = async function(id){
    if(!id){ draft = newDraft(); return render(); }
    try{ const e = await api('GET', '/api/online-exams/' + encodeURIComponent(id));
      draft = { id: e.id, title: e.title, className: e.className, section: e.section, subject: e.subject, durationMin: e.durationMin, startMs: e.startMs, endMs: e.endMs, instructions: e.instructions, questions: e.questions.map(q => ({ ...q })) };
      viewing = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }catch(er){ toast(er.message); }
  };
  window.oeSubmit = async function(){
    collect(); const d = draft; const btn = $('oeSave'); btn.disabled = true; $('oeMsg').textContent = 'Submitting…';
    const body = { title: d.title, className: d.className, section: d.section, subject: d.subject, durationMin: d.durationMin, startMs: d.startMs, endMs: d.endMs, instructions: d.instructions,
      questions: d.questions.map(q => ({ type: q.type, text: q.text, marks: q.marks, options: q.options, answer: q.answer, keyAnswer: q.keyAnswer })) };
    try{
      if(d.id) await api('PUT', '/api/online-exams/' + encodeURIComponent(d.id), body); else await api('POST', '/api/online-exams', body);
      toast('Submitted for approval.'); draft = null; render();
    }catch(e){ toast(e.message); btn.disabled = false; $('oeMsg').textContent = e.message; }
  };
  window.oeNote = function(id){ noteFor = id; render(true); };
  window.oeApprove = async function(id){ try{ await api('POST', '/api/online-exams/' + encodeURIComponent(id) + '/review', { action: 'approve' }); toast('Approved. Students can see it now.'); render(); }catch(e){ toast(e.message); } };
  window.oeReturn = async function(id){ const note = ($('oeNote') || {}).value || ''; try{ await api('POST', '/api/online-exams/' + encodeURIComponent(id) + '/review', { action: 'return', note }); noteFor = null; toast('Sent back to the teacher.'); render(); }catch(e){ toast(e.message); } };
  window.oeDelete = async function(id){
    const ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog('Remove this online exam and any answers students gave?', { title: 'Remove exam', okText: 'Remove', cancelText: 'Cancel' }) : true; if(!ok) return;
    try{ await api('DELETE', '/api/online-exams/' + encodeURIComponent(id)); if(viewing === id){ viewing = null; resData = null; } render(); }catch(e){ toast(e.message); }
  };
  window.oePreview = async function(id){
    const box = $('oePrev_' + id); if(!box) return; if(box.innerHTML){ box.innerHTML = ''; return; }
    try{ const e = await api('GET', '/api/online-exams/' + encodeURIComponent(id));
      box.innerHTML = e.questions.map((q, i) => `<div class="oe-q"><div class="hd"><span>Q${i + 1} · ${esc(q.marks)} mark${q.marks === 1 ? '' : 's'}</span></div><div style="white-space:pre-wrap;">${esc(q.text)}</div>${q.options ? q.options.map((o, k) => `<div class="${k === q.answer ? 'oe-ans-ok' : ''}">${String.fromCharCode(65 + k)}. ${esc(o)}${k === q.answer ? ' ✓' : ''}</div>`).join('') : `<div class="oe-sm">Model answer: ${esc(q.keyAnswer || '—')}</div>`}</div>`).join('');
    }catch(er){ toast(er.message); }
  };

  function examCard(e, mgr){
    const meta = `${esc(e.className)} ${esc(e.section)} · ${esc(e.subject)}`;
    const when = `Opens ${esc(fmt(e.startMs))} · closes ${esc(fmt(e.endMs))} · ${e.durationMin} min · ${e.questionCount} questions · ${e.totalMarks} marks`;
    let acts = '';
    if(mgr && e.status === 'Submitted'){
      acts = noteFor === e.id
        ? `<div style="width:100%"><textarea id="oeNote" rows="2" style="width:100%;padding:8px;border:1px solid #d6dcea;border-radius:10px;" placeholder="What should the teacher change?"></textarea></div>
           <button class="btn btn-primary btn-sm" onclick="oeReturn('${esc(e.id)}')">Send back</button><button class="btn btn-ghost btn-sm" onclick="oeNote(null)">Cancel</button>`
        : `<button class="btn btn-primary btn-sm" onclick="oeApprove('${esc(e.id)}')">Approve &amp; publish to students</button><button class="btn btn-ghost btn-sm" onclick="oeNote('${esc(e.id)}')">Send back with a note</button>`;
    }
    acts += `<button class="btn btn-ghost btn-sm" onclick="oePreview('${esc(e.id)}')">Preview paper</button>`;
    if(e.status === 'Approved') acts += `<button class="btn btn-primary btn-sm" onclick="oeResults('${esc(e.id)}')">Results${e.attempts ? ' (' + e.finished + '/' + e.attempts + ' done)' : ''}</button>`;
    if(e.attempts === 0 && (e.status !== 'Approved' || mgr)) acts += `<button class="btn btn-ghost btn-sm" onclick="oeEdit('${esc(e.id)}')">Edit</button>`;
    if(mgr || e.status !== 'Approved') acts += `<button class="btn btn-ghost btn-sm" onclick="oeDelete('${esc(e.id)}')">${mgr ? 'Remove' : 'Withdraw'}</button>`;
    return `<div class="oe-row"><div class="oe-top"><div><b>${esc(e.title)}</b><div class="oe-sm">${meta}${mgr ? ' · by ' + esc(e.staffName) : ''}</div><div class="oe-sm">${when}</div></div>${pill(e.status)}</div>
      ${e.status === 'Returned' && e.reviewNote ? `<div class="oe-note"><b>${esc(e.reviewedBy || 'Principal')}:</b> ${esc(e.reviewNote)}</div>` : ''}
      <div class="oe-acts">${acts}</div><div id="oePrev_${esc(e.id)}" style="margin-top:10px;"></div></div>`;
  }

  /* ---- results + marking ---- */
  window.oeResults = async function(id){
    viewing = id; marking = null;
    try{ resData = await api('GET', '/api/online-exams/' + encodeURIComponent(id) + '/results'); }catch(e){ toast(e.message); viewing = null; return; }
    render(true); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.oeCloseResults = function(){ viewing = null; resData = null; marking = null; render(); };
  window.oeRelease = async function(rel){
    try{ await api('POST', '/api/online-exams/' + encodeURIComponent(viewing) + '/release', { release: rel }); toast(rel ? 'Results released. Students have been told.' : 'Results hidden from students.'); await oeResults(viewing); }catch(e){ toast(e.message); }
  };
  window.oeMark = async function(attemptId){
    try{ const a = await api('GET', '/api/online-exams/' + encodeURIComponent(viewing) + '/attempt/' + encodeURIComponent(attemptId)); marking = { attemptId, a }; render(true); const m = $('oeMarking'); if(m) m.scrollIntoView({ behavior: 'smooth' }); }catch(e){ toast(e.message); }
  };
  window.oeMarkClose = function(){ marking = null; render(true); };
  window.oeSaveMarks = async function(){
    const scores = {}; marking.a.questions.filter(q => q.type === 'short').forEach(q => { const el = $('oeMk_' + q.id); if(el && el.value !== '') scores[q.id] = el.value; });
    try{ const r = await api('POST', '/api/online-exams/' + encodeURIComponent(viewing) + '/grade', { attemptId: marking.attemptId, scores }); toast('Saved. Total: ' + r.total); marking = null; await oeResults(viewing); }catch(e){ toast(e.message); }
  };
  const STATE = { NotAttempted: ['Not attempted', '#8a94a8'], InProgress: ['Writing now', '#2F80ED'], Submitted: ['Needs marking', '#b36b00'], Graded: ['Marked', '#17703a'] };
  function resultsHtml(){
    const d = resData, x = d.exam, st = d.stats; const closed = Date.now() >= x.endMs;
    const tile = (v, l) => `<div class="oe-tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
    const rows = d.rows.map(r => { const s = STATE[r.state] || [r.state, '#444'];
      return `<tr><td>${esc(r.name)}<div class="oe-sm">${esc(r.admissionNo)}</div></td><td style="color:${s[1]};font-weight:700;">${esc(s[0])}</td><td>${r.state === 'NotAttempted' || r.state === 'InProgress' ? '—' : esc(r.total + ' / ' + x.totalMarks)}</td><td>${r.leaves ? '<span style="color:#b3261e;font-weight:700;">' + r.leaves + '×</span>' : '—'}</td>
        <td>${r.attemptId && r.state !== 'InProgress' ? `<button class="btn btn-ghost btn-sm" onclick="oeMark('${esc(r.attemptId)}')">${r.state === 'Submitted' ? 'Mark' : 'View'}</button>` : ''}</td></tr>`; }).join('');
    const pq = d.perQuestion.map((q, i) => `<tr><td>Q${i + 1}</td><td>${esc(q.text.slice(0, 70))}${q.text.length > 70 ? '…' : ''}</td><td>${q.pct == null ? '<span class="oe-sm">marked by teacher</span>' : `<div class="oe-bar"><i style="width:${q.pct}%"></i></div> ${q.pct}% correct`}</td></tr>`).join('');
    let mk_ = '';
    if(marking){ const a = marking.a;
      mk_ = `<div class="oe-card" id="oeMarking"><h3>${esc(a.studentName)} — ${esc(a.total)} / ${esc(x.totalMarks)}</h3>${a.leaves ? `<div class="oe-note" style="margin-bottom:10px;">Left the exam screen ${a.leaves} time(s) while writing.</div>` : ''}
        ${a.questions.map((q, i) => `<div class="oe-q"><div class="hd"><span>Q${i + 1} · ${esc(q.marks)} mark${q.marks === 1 ? '' : 's'}</span></div><div style="white-space:pre-wrap;margin-bottom:6px;">${esc(q.text)}</div>
          ${q.type === 'short' ? `<div><b>Student's answer:</b><div style="white-space:pre-wrap;background:#fff;border:1px solid #e3e8f3;border-radius:10px;padding:8px;margin:4px 0;">${esc(q.yourAnswer || '— no answer —')}</div></div><div class="oe-sm">Model answer: ${esc(q.keyAnswer || '—')}</div>
              <div style="max-width:160px;margin-top:6px;"><label class="l">Marks (0 to ${esc(q.marks)})</label><input type="number" id="oeMk_${esc(q.id)}" min="0" max="${esc(q.marks)}" step="0.5" value="${q.given == null ? '' : esc(q.given)}"></div>`
          : `${q.options.map((o, k) => `<div class="${k === q.correct ? 'oe-ans-ok' : (k === q.yourAnswer ? 'oe-ans-bad' : '')}">${String.fromCharCode(65 + k)}. ${esc(o)}${k === q.correct ? ' ✓' : ''}${k === q.yourAnswer ? ' ← student' : ''}</div>`).join('')}<div class="oe-sm">${q.got} / ${esc(q.marks)}</div>`}</div>`).join('')}
        <div class="oe-acts"><button class="btn btn-primary" onclick="oeSaveMarks()">Save marks</button><button class="btn btn-ghost" onclick="oeMarkClose()">Close</button></div></div>`; }
    return `<div class="oe-card"><h3><span>${esc(x.title)} · ${esc(x.className)} ${esc(x.section)} · ${esc(x.subject)}</span><button class="btn btn-ghost btn-sm" onclick="oeCloseResults()">← Back</button></h3>
      <div class="oe-sm" style="margin-bottom:10px;">Opens ${esc(fmt(x.startMs))} · closes ${esc(fmt(x.endMs))} · ${x.durationMin} min · ${x.totalMarks} marks</div>
      <div class="oe-tiles">${tile(st.finished + ' / ' + st.students, 'Finished')}${tile(st.pendingMarking, 'Need marking')}${tile(st.average, 'Average')}${tile(st.highest, 'Highest')}${tile(st.lowest, 'Lowest')}</div>
      <div class="oe-acts" style="margin:0 0 12px;">${x.resultsReleased ? `<span class="oe-pill" style="background:#dff5e6;color:#17703a;">Results released to students</span><button class="btn btn-ghost btn-sm" onclick="oeRelease(false)">Hide results</button>`
        : `<button class="btn btn-primary btn-sm" onclick="oeRelease(true)" ${closed ? '' : 'disabled title="Available after the exam closes"'}>Release results to students</button><span class="oe-sm">${closed ? (st.pendingMarking ? 'Mark the written answers first.' : 'Everything is marked.') : 'You can release results after the exam closes (' + esc(fmt(x.endMs)) + ').'}</span>`}</div>
      <div style="overflow-x:auto;"><table class="oe-table"><thead><tr><th>Student</th><th>Status</th><th>Score</th><th>Left screen</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
      ${mk_}
      <div class="oe-card"><h3>Question analysis</h3><div style="overflow-x:auto;"><table class="oe-table"><tbody>${pq}</tbody></table></div></div>`;
  }

  async function render(keep){
    const el = $('view-onlineexams'); if(!el) return;
    if(viewing && resData){ el.innerHTML = `<div class="topbar"><div><h1>Online Exams</h1><p>Results and marking.</p></div></div>${resultsHtml()}`; return; }
    if(!keep || !exams.length){ try{ exams = await api('GET', '/api/online-exams'); }catch(e){ exams = []; } }
    const mgr = isMgr(); const waiting = exams.filter(e => e.status === 'Submitted');
    if(mgr){
      el.innerHTML = `<div class="topbar"><div><h1>Online Exams</h1><p>Teachers set timed exams for their classes. Approve one and it goes live to the students at its opening time.</p></div></div>
        <div class="oe-card"><h3>Waiting for your approval ${waiting.length ? `<span style="background:#fdf0d0;color:#8a5a00;border-radius:999px;padding:2px 10px;font-size:.8rem;">${waiting.length}</span>` : ''}</h3>${waiting.length ? waiting.map(e => examCard(e, true)).join('') : '<div class="oe-sm">Nothing is waiting. 🎉</div>'}</div>
        <div class="oe-card"><h3>All online exams</h3>${exams.filter(e => e.status !== 'Submitted').length ? exams.filter(e => e.status !== 'Submitted').map(e => examCard(e, true)).join('') : '<div class="oe-sm">No other online exams yet.</div>'}</div>`;
      return;
    }
    if(!draft) draft = null;
    el.innerHTML = `<div class="topbar"><div><h1>Online Exams</h1><p>Set a timed exam for your class. The Principal approves it, then students take it in their portal. Multiple-choice answers are marked automatically.</p></div></div>
      <div class="oe-card"><h3>${draft ? (draft.id ? 'Edit exam' : 'New online exam') : 'Create an online exam'}${draft ? '' : ''}</h3>${draft ? builderHtml() : '<button class="btn btn-primary" onclick="oeEdit(null)">+ New online exam</button>'}</div>
      <div class="oe-card"><h3>My online exams</h3>${exams.length ? exams.map(e => examCard(e, false)).join('') : '<div class="oe-sm">You have not created any online exam yet.</div>'}</div>`;
    wireBuilder();
  }

  const origSwitch = window.switchView;
  window.switchView = function(view){
    if(!isStaff()){ const sv = $('view-onlineexams'); if(sv) sv.style.display = 'none'; const sn = $('navOnlineExams'); if(sn) sn.remove(); return origSwitch.apply(this, arguments); }
    ensureShell();
    if(view !== 'onlineexams'){
      const r = origSwitch.apply(this, arguments);
      const v = $('view-onlineexams'); if(v) v.style.display = 'none';
      const n = $('navOnlineExams'); if(n) n.classList.remove('active');
      return r;
    }
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-onlineexams') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navOnlineExams'); if(n) n.classList.add('active');
    $('view-onlineexams').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    draft = null; noteFor = null; viewing = null; resData = null; marking = null; exams = []; render();
  };
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      if(!isStaff()){ const sv = $('view-onlineexams'); if(sv) sv.style.display = 'none'; const sn = $('navOnlineExams'); if(sn) sn.remove(); return r; }
      try{ ensureShell(); if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility(); }catch(e){}
      return r;
    };
  }

  /* ====================================================================== STUDENT SIDE ===== */
  let run = null; // the exam being written

  window.renderMyOnlineExamTab = async function(body, s){
    css(); body.innerHTML = '<div class="empty-state">…</div>';
    let list = [];
    try{ list = await api('GET', '/api/online-exams'); }catch(e){ body.innerHTML = '<div class="empty-state"><b>' + L('Could not load online exams', 'ఆన్‌లైన్ పరీక్షలు లోడ్ కాలేదు') + '</b>' + esc(e.message) + '</div>'; return; }
    window.__oeStudent = s;
    if(!list.length){ body.innerHTML = '<div class="empty-state"><b>' + L('No online exams yet', 'ఇంకా ఆన్‌లైన్ పరీక్షలు లేవు') + '</b>' + L('When a teacher schedules an online exam for your class, it will appear here.', 'మీ తరగతికి టీచర్ ఆన్‌లైన్ పరీక్ష పెట్టినప్పుడు ఇక్కడ కనిపిస్తుంది.') + '</div>'; return; }
    const now = Date.now();
    body.innerHTML = list.map(e => {
      const m = e.mine || { state: 'NotStarted' };
      let status = '', btn = '', tone = '#2F80ED';
      if(m.state === 'InProgress' && now < m.deadlineMs){ status = L('You have started this exam. Continue now.', 'మీరు ఈ పరీక్ష మొదలుపెట్టారు. ఇప్పుడే కొనసాగించండి.'); btn = `<button class="oes-btn" onclick="oeStart('${esc(e.id)}')">${L('Continue exam', 'పరీక్ష కొనసాగించండి')}</button>`; tone = '#d93025'; }
      else if(m.state === 'InProgress' || m.state === 'Done'){
        if(e.resultsReleased){ status = L('Your result is ready.', 'మీ ఫలితం సిద్ధంగా ఉంది.') + ' <b>' + esc(m.total) + ' / ' + esc(e.totalMarks) + '</b>'; btn = `<button class="oes-btn" onclick="oeShowResult('${esc(e.id)}')">${L('See my answers & result', 'నా సమాధానాలు & ఫలితం చూడండి')}</button>`; tone = '#1d9b4d'; }
        else { status = L('Submitted. Your result will appear after your teacher marks it.', 'సమర్పించారు. టీచర్ మార్కులు వేశాక ఫలితం కనిపిస్తుంది.'); tone = '#f0a000'; }
      }
      else if(now < e.startMs){ status = L('Opens on ', 'ప్రారంభం: ') + fmt(e.startMs); tone = '#f0a000'; }
      else if(now < e.endMs - 30000){ status = L('Open now — closes at ', 'ఇప్పుడు ఓపెన్ — ముగింపు: ') + fmt(e.endMs); btn = `<button class="oes-btn" onclick="oeStart('${esc(e.id)}')">${L('Start exam', 'పరీక్ష ప్రారంభించండి')}</button>`; tone = '#f0a000'; }
      else { status = L('This exam is closed. You did not take it.', 'ఈ పరీక్ష ముగిసింది. మీరు రాయలేదు.'); tone = '#8a94a8'; }
      return `<div class="oes-item" style="border-left-color:${tone}"><div class="t">⏱️ ${esc(e.title)}</div><div class="s">${esc(e.subject)} · ${e.durationMin} ${L('minutes', 'నిమిషాలు')} · ${e.questionCount} ${L('questions', 'ప్రశ్నలు')} · ${esc(e.totalMarks)} ${L('marks', 'మార్కులు')}</div>
        ${e.instructions ? `<div class="s" style="white-space:pre-wrap;">${esc(e.instructions)}</div>` : ''}<div class="s"><b>${status}</b></div>${btn}</div>`;
    }).join('') + '<p class="oe-sm" style="margin-top:14px;">' + L('Once you start, the timer runs and cannot be paused. You can take each exam only once.', 'మొదలుపెట్టాక టైమర్ ఆగదు. ప్రతి పరీక్షను ఒక్కసారే రాయగలరు.') + '</p>';
  };

  function remaining(){ return run.deadlineMs - (Date.now() + run.offset); }
  function mmss(ms){ const t = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s); }
  async function saveNow(){
    if(!run || run.done) return;
    try{ const r = await api('POST', '/api/online-exams/' + encodeURIComponent(run.id) + '/save', { answers: run.answers, leaves: run.leaves }); if(r && r.done) finishLocal(false); }catch(e){ /* keep trying on the next tick */ }
  }
  let saveTimer = null; const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1200); };
  window.oeStart = async function(id){
    css();
    try{
      const r = await api('POST', '/api/online-exams/' + encodeURIComponent(id) + '/start');
      run = { id, title: r.title, subject: r.subject, instructions: r.instructions, questions: r.questions, answers: r.answers || {}, deadlineMs: r.deadlineMs, offset: r.serverNowMs - Date.now(), idx: 0, leaves: 0, done: false, total: r.totalMarks };
    }catch(e){ toast(e.message); try{ renderMyProfileBody(); }catch(x){} return; }
    openRun();
  };
  function openRun(){
    let el = $('oeRun'); if(el) el.remove();
    el = document.createElement('div'); el.id = 'oeRun'; document.body.appendChild(el); document.body.classList.add('sm-open');
    el.addEventListener('contextmenu', e => e.preventDefault()); ['copy', 'cut', 'paste', 'dragstart'].forEach(ev => el.addEventListener(ev, e => { if(!(e.target && e.target.tagName === 'TEXTAREA')) e.preventDefault(); }));
    run.intro = true; drawRun();
    run.tick = setInterval(() => {
      if(!run || run.done) return;
      const t = $('oeTimer'); const ms = remaining();
      if(t){ t.textContent = mmss(ms); t.classList.toggle('low', ms < 5 * 60000); }
      if(ms <= 0){ submitRun(true); }
    }, 500);
    run.auto = setInterval(saveNow, 15000);
    run.vis = () => { if(document.hidden && run && !run.done && !run.intro){ run.leaves++; saveNow(); } };
    document.addEventListener('visibilitychange', run.vis);
    run.bu = e => { if(run && !run.done){ e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', run.bu);
  }
  function drawRun(){
    const el = $('oeRun'); if(!el || !run) return;
    if(run.intro){
      el.innerHTML = `<header><b>${esc(run.title)}</b></header><div id="oeRunBody"><div class="oe-qbox"><div class="qt">${esc(run.subject)} — ${esc(run.title)}</div>
        <p style="font-size:1.05rem;">${L('Time allowed', 'సమయం')}: <b>${mmss(remaining())}</b> · ${run.questions.length} ${L('questions', 'ప్రశ్నలు')} · ${esc(run.total)} ${L('marks', 'మార్కులు')}</p>
        ${run.instructions ? `<p style="white-space:pre-wrap;font-size:1.02rem;">${esc(run.instructions)}</p>` : ''}
        <ul style="font-size:1rem;line-height:1.6;"><li>${L('The timer is running now and cannot be paused.', 'టైమర్ ఇప్పటి నుంచే నడుస్తోంది, ఆపలేరు.')}</li><li>${L('Your answers are saved as you go. When time is up the exam submits by itself.', 'సమాధానాలు ఆటోమేటిక్‌గా సేవ్ అవుతాయి. సమయం అయిపోగానే పరీక్ష తానే సమర్పించబడుతుంది.')}</li><li>${L('Please stay on this screen. Leaving it is recorded for your teacher.', 'దయచేసి ఈ స్క్రీన్‌లోనే ఉండండి. వదిలితే టీచర్‌కు తెలుస్తుంది.')}</li></ul>
        <button class="oes-btn" onclick="oeBegin()">${L('I understand — show questions', 'అర్థమైంది — ప్రశ్నలు చూపించండి')}</button></div></div>`; return; }
    const q = run.questions[run.idx]; const a = run.answers[q.id];
    const pal = run.questions.map((x, i) => `<button type="button" class="${run.answers[x.id] !== undefined && run.answers[x.id] !== '' ? 'done' : ''} ${i === run.idx ? 'cur' : ''}" onclick="oeGo(${i})">${i + 1}</button>`).join('');
    const ans = q.type === 'short'
      ? `<textarea id="oeAns" placeholder="${esc(L('Write your answer here', 'మీ సమాధానం ఇక్కడ రాయండి'))}" oninput="oeText(this.value)">${esc(typeof a === 'string' ? a : '')}</textarea>`
      : q.options.map(o => `<div class="oe-choice ${a === o.i ? 'sel' : ''}" onclick="oePick(${o.i})"><i></i><span>${esc(o.t)}</span></div>`).join('');
    el.innerHTML = `<header><b>${esc(run.title)}</b><span id="oeTimer">${mmss(remaining())}</span></header>
      <div id="oeRunBody"><div class="oe-pal">${pal}</div><div class="oe-qbox"><div class="oe-sm" style="margin:0 0 6px;">${L('Question', 'ప్రశ్న')} ${run.idx + 1} / ${run.questions.length} · ${esc(q.marks)} ${L('marks', 'మార్కులు')}</div><div class="qt">${esc(q.text)}</div>${ans}</div></div>
      <div class="oe-foot"><button class="oes-btn ghost" ${run.idx === 0 ? 'disabled' : ''} onclick="oeGo(${run.idx - 1})">← ${L('Previous', 'వెనక్కి')}</button>
        ${run.idx < run.questions.length - 1 ? `<button class="oes-btn" onclick="oeGo(${run.idx + 1})">${L('Next', 'తరువాత')} →</button>` : `<button class="oes-btn" style="background:#1d9b4d" onclick="oeAskSubmit()">${L('Finish & submit', 'ముగించి సమర్పించండి')}</button>`}</div>`;
  }
  window.oeBegin = function(){ run.intro = false; drawRun(); };
  window.oeGo = function(i){ if(!run || i < 0 || i >= run.questions.length) return; run.idx = i; drawRun(); };
  window.oePick = function(i){ const q = run.questions[run.idx]; run.answers[q.id] = i; drawRun(); saveSoon(); };
  window.oeText = function(v){ const q = run.questions[run.idx]; run.answers[q.id] = v; const pb = document.querySelectorAll('.oe-pal button')[run.idx]; if(pb) pb.classList.toggle('done', !!v.trim()); saveSoon(); };
  window.oeAskSubmit = function(){
    const left = run.questions.filter(q => run.answers[q.id] === undefined || run.answers[q.id] === '').length;
    const m = document.createElement('div'); m.className = 'oe-modal'; m.id = 'oeConfirm';
    m.innerHTML = `<div><h3 style="margin:0 0 8px;color:#14325c;">${L('Submit your exam?', 'పరీక్ష సమర్పించాలా?')}</h3><p style="font-size:1.02rem;">${left ? L('You have ' + left + ' unanswered question(s).', left + ' ప్రశ్నలకు సమాధానం ఇవ్వలేదు.') : L('You have answered every question.', 'అన్ని ప్రశ్నలకూ సమాధానం ఇచ్చారు.')} ${L('You cannot change answers after submitting.', 'సమర్పించాక మార్చలేరు.')}</p>
      <div style="display:flex;gap:10px;"><button class="oes-btn" style="background:#1d9b4d" onclick="oeSubmitNow()">${L('Yes, submit', 'అవును, సమర్పించండి')}</button><button class="oes-btn ghost" onclick="document.getElementById('oeConfirm').remove()">${L('Go back', 'వెనక్కి')}</button></div></div>`;
    $('oeRun').appendChild(m);
  };
  window.oeSubmitNow = function(){ submitRun(false); };
  function finishLocal(timeUp){
    if(!run) return; run.done = true; clearInterval(run.tick); clearInterval(run.auto); clearTimeout(saveTimer);
    document.removeEventListener('visibilitychange', run.vis); window.removeEventListener('beforeunload', run.bu); document.body.classList.remove('sm-open');
    const el = $('oeRun');
    if(el) el.innerHTML = `<div id="oeRunBody" style="display:flex;align-items:center;justify-content:center;"><div class="oe-qbox" style="text-align:center;max-width:460px;"><div style="font-size:3rem;">✅</div><div class="qt">${timeUp ? L('Time is up — your exam was submitted.', 'సమయం అయిపోయింది — మీ పరీక్ష సమర్పించబడింది.') : L('Your exam is submitted.', 'మీ పరీక్ష సమర్పించబడింది.')}</div>
      <p style="font-size:1.02rem;">${L('Your teacher will release the result soon. You will get a notification.', 'టీచర్ త్వరలో ఫలితం విడుదల చేస్తారు. మీకు నోటిఫికేషన్ వస్తుంది.')}</p><button class="oes-btn" onclick="oeCloseRun()">${L('Back to my portal', 'నా పోర్టల్‌కు తిరిగి')}</button></div></div>`;
  }
  async function submitRun(timeUp){
    if(!run || run.done || run.submitting) return; run.submitting = true; const cf = $('oeConfirm'); if(cf) cf.remove();
    try{ await api('POST', '/api/online-exams/' + encodeURIComponent(run.id) + '/finish', { answers: run.answers, leaves: run.leaves }); finishLocal(timeUp); }
    catch(e){ run.submitting = false; if(timeUp){ setTimeout(() => submitRun(true), 2000); } else toast('Could not submit — check your internet and try again. ' + e.message); }
  }
  window.oeCloseRun = function(){ const el = $('oeRun'); if(el) el.remove(); document.body.classList.remove('sm-open'); run = null; try{ renderMyProfileBody(); }catch(e){} };

  window.oeShowResult = async function(id){
    css(); let r;
    try{ r = await api('GET', '/api/online-exams/' + encodeURIComponent(id) + '/my-result'); }catch(e){ toast(e.message); return; }
    if(r.state !== 'Released'){ toast(L('The result is not released yet.', 'ఫలితం ఇంకా విడుదల కాలేదు.')); return; }
    let el = $('oeRun'); if(el) el.remove(); el = document.createElement('div'); el.id = 'oeRun'; document.body.appendChild(el); document.body.classList.add('sm-open');
    const pct = r.totalMarks ? Math.round(r.total / r.totalMarks * 100) : 0;
    el.innerHTML = `<header><b>${esc(r.title)}</b><button class="btn btn-ghost btn-sm" style="background:#fff;color:#14325c;border:0;border-radius:10px;padding:8px 16px;font-weight:700;" onclick="oeCloseRun()">${L('Close', 'మూసివేయి')} ✕</button></header>
      <div id="oeRunBody"><div class="oe-qbox" style="margin-bottom:12px;text-align:center;"><div style="font-size:2.4rem;font-weight:800;color:#14325c;">${esc(r.total)} / ${esc(r.totalMarks)}</div><div style="font-size:1.1rem;">${pct}% · ${esc(r.subject)}</div>
        <div class="oe-sm">${L('Class average', 'తరగతి సగటు')}: ${esc(r.classAverage)} · ${L('Highest', 'అత్యధికం')}: ${esc(r.highest)}</div></div>
        ${r.review.map((q, i) => `<div class="oe-qbox" style="margin-bottom:10px;"><div class="oe-sm" style="margin:0 0 4px;">${L('Question', 'ప్రశ్న')} ${i + 1} · ${esc(q.got)} / ${esc(q.marks)}</div><div class="qt" style="font-size:1.08rem;">${esc(q.text)}</div>
          ${q.type === 'short' ? `<div style="white-space:pre-wrap;background:#f4f7fd;border-radius:10px;padding:10px;"><b>${L('Your answer', 'మీ సమాధానం')}:</b> ${esc(q.yourAnswer || '—')}</div>${q.keyAnswer ? `<div class="oe-sm" style="margin-top:6px;">${L('Model answer', 'నమూనా సమాధానం')}: ${esc(q.keyAnswer)}</div>` : ''}`
          : q.options.map((o, k) => `<div class="${k === q.correct ? 'oe-ans-ok' : (k === q.yourAnswer ? 'oe-ans-bad' : '')}" style="padding:4px 0;font-size:1.02rem;">${String.fromCharCode(65 + k)}. ${esc(o)}${k === q.correct ? ' ✓' : ''}${k === q.yourAnswer ? ' ← ' + L('your answer', 'మీ సమాధానం') : ''}</div>`).join('')}</div>`).join('')}</div>`;
  };
})();
