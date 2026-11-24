/* ============================================================================
   Notice Board = messages sent IN THE APP (parent portal / staff inbox).
   They are written in Messages (Compose); the board only lists, edits and
   takes them down. Public website notices live in the Website section and
   never appear here. A parent only sees notices addressed to their child.
   Overrides renderNoticeBoard (20b) and saveNoticeEdit (20).
   ========================================================================== */
let nbxFilter = 'all';

/* Does this notice show to a given student? Used by the parent portal. */
function nbxVisibleToStudent(n, s){
  if(!n || n.boardRemoved || !s) return false;
  if(!(n.channels || []).includes('In-App')) return false;
  const sc = n.audienceScope;
  if(!sc){
    const l = String(n.audienceLabel || '');
    if(/^all staff/i.test(l)) return false;
    if(l.includes(' — Section ')){ const p = l.split(' — Section '); return p[0] === s.className && p[1] === s.section; }
    if(/\(Whole Class\)$/.test(l)) return l.replace(/\s*\(Whole Class\)$/, '') === s.className;
    return true;
  }
  if(sc === 'allstudents' || sc === 'everyone') return true;
  if(sc === 'class') return n.audienceClass === s.className;
  if(sc === 'section') return n.audienceClass === s.className && n.audienceSection === s.section;
  if(sc === 'individual') return n.individualId === s.id;
  return false;
}
function nbxIsWebsite(n){
  if(n.boardRemoved) return false;
  if(n.toWebsite !== undefined) return !!n.toWebsite;
  return (n.channels || []).includes('In-App') && !n.audienceScope;
}
function nbxOnBoard(n){ return !n.boardRemoved && (n.channels || []).includes('In-App'); }

/* ---------- board ---------- */
function nbxSetFilter(f){ nbxFilter = f; renderNoticeBoard(document.getElementById('noticeBoardBody')); }
function nbxNoteBadges(n){
  const out = [`<span class="sf-badge sf-badge--upcoming"><span aria-hidden="true">👥</span>${cmEsc(n.audienceLabel)}${Number(n.recipientCount) ? ' · ' + cmEsc(n.recipientCount) : ''}</span>`];
  (n.channels || []).filter(c => c === 'Push' || c === 'WhatsApp').forEach(c => out.push(`<span class="sf-badge sf-badge--upcoming">${c === 'Push' ? '🔔 Phone alert' : '💬 WhatsApp'}</span>`));
  return out.join('');
}
function renderNoticeBoard(body){
  if(!body) return;
  const all = commsMessages.filter(nbxOnBoard).slice().sort((a, b) => b.id.localeCompare(a.id));
  const list = all;
  const canEditNb = canSub('noticeboard_post', 'noticeboard', 'edit');
  const canDeleteNb = canSub('noticeboard_post', 'noticeboard', 'delete');
  const canCreateHeading = canSub('noticeboard_headings', 'noticeboard', 'create');
  const canDeleteHeading = canSub('noticeboard_headings', 'noticeboard', 'delete');
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = all.filter(n => (n.sentDate || '').startsWith(month)).length;
  const canSend = canSub('comms_compose', 'announcements', 'create');
  body.innerHTML = `
    <section class="cm-web" aria-label="About the Notice Board">
      <span class="cm-web-dot" aria-hidden="true"></span>
      <div><b>What parents and staff see in the app</b>
        <small>New notices are written in <b>Messages</b>. This board keeps them in one place so you can fix or take one down. Public website notices are in the <b>Website</b> section.</small></div>
      ${canSend ? `<button type="button" class="sf-btn sf-btn--primary" onclick="switchView('announcements')">✍️ New message</button>` : ''}
    </section>
    <section class="sf-kpis">
      ${sfKpi('On the board', all.length, 'plain', 'in the app')}
      ${sfKpi('This month', thisMonth, 'plain')}
    </section>
    <section class="sf-card cm-headings">
      <button type="button" class="cm-toggle" onclick="cmToggleHeadings()" aria-expanded="${cmHeadingsOpen}">
        <span>🏷️ Notice headings <small>${noticeTypes.length}</small></span><span aria-hidden="true">${cmHeadingsOpen ? '▴' : '▾'}</span>
      </button>
      <div class="cm-headings-body" ${cmHeadingsOpen ? '' : 'hidden'}>
        <div class="cm-chips">${noticeTypes.map((t, i) => `<span class="cm-chip">${t.icon} ${cmEsc(t.name)}${canDeleteHeading ? `<button type="button" title="Remove heading" onclick="removeNoticeType(${i})">✕</button>` : ''}</span>`).join('')}</div>
        ${canCreateHeading ? `<div class="cm-addrow"><input class="input" id="newNoticeTypeName" placeholder="New heading, e.g. Sports Day Update">${sfBtn('soft', '', 'Add heading', 'addNoticeTypeDirect()')}</div>` : ''}
      </div>
    </section>
    <div class="nbx-feedbar"><h3 class="cm-h cm-feedtitle">On the board</h3></div>
    <div class="cm-feed">
    ${list.length ? list.map(n => {
      if(n.id === editingNoticeId){
        return `<article class="sf-card cm-note">
          <div class="f-field full" style="margin-bottom:10px;"><label>Title</label><input type="text" id="editNoticeTitle" value="${cmEsc(n.title)}"></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Message</label><textarea id="editNoticeBody" rows="5">${cmEsc(n.body)}</textarea></div>
          <div class="f-field full" style="margin-bottom:10px;"><label>Read-more link <small>(optional)</small></label><input type="text" id="editNoticeLink" value="${cmEsc(n.link || '')}" placeholder="https://…"></div>
          <div class="cm-actions">${sfBtn('link', '', 'Cancel', 'cancelNoticeEdit()')}${sfBtn('primary', '', 'Save changes', `saveNoticeEdit('${n.id}')`)}</div>
        </article>`;
      }
      const t = noticeTypeByName(n.type);
      return `<article class="sf-card cm-note">
        <div class="cm-note-head"><span class="cm-type">${t ? t.icon : '📣'} ${cmEsc(n.type)}</span><span class="cm-date">${cmEsc(n.sentDate)}</span></div>
        <h4>${cmEsc(n.title)}</h4>
        <p class="cm-body">${cmEsc(n.body)}</p>
        ${n.link ? `<a class="cm-link" href="${cmEsc(n.link)}" target="_blank" rel="noopener noreferrer">🔗 ${cmEsc(n.link.replace(/^https?:\/\//, '').slice(0, 48))}</a>` : ''}
        <div class="cm-note-foot">
          ${nbxNoteBadges(n)}
          <span class="cm-by">by ${cmEsc(n.sentBy)}</span>
          <span class="cm-actions">
            ${canEditNb ? sfBtn('soft', '', 'Edit', `editNotice('${n.id}')`) : ''}
            ${canDeleteNb ? sfBtn('danger', '', 'Take down', `deleteNotice('${n.id}')`) : ''}
          </span>
        </div>
      </article>`;
    }).join('') : `<div class="empty-state"><b>No notices on the board yet</b>Send a message from <b>Messages</b> and choose "In the app".</div>`}
    </div>`;
}

async function saveNoticeEdit(id){
  const n = commsMessages.find(m => m.id === id);
  if(!n) return;
  const title = document.getElementById('editNoticeTitle').value.trim();
  const bodyText = document.getElementById('editNoticeBody').value.trim();
  if(!title || !bodyText){ showToast('Title and message can\'t be empty.'); return; }
  const linkEl = document.getElementById('editNoticeLink');
  const link = cleanNoticeLink(linkEl ? linkEl.value : n.link);
  if(!link.ok){ showToast('That link doesn\'t look right — use a web address like https://example.com/page'); return; }
  n.title = title; n.body = bodyText; n.link = link.value;
  await storageSet(COMMS_MESSAGES_KEY, commsMessages);
  editingNoticeId = '';
  renderNoticeBoard(document.getElementById('noticeBoardBody'));
  showToast('Notice updated.', 'burst');
}
