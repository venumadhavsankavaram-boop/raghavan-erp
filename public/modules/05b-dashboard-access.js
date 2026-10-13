/* Dashboard access — hides the Dashboard sections a role has not been given.
   The choices are made per role in Roles & Permissions → Overview → Dashboard.
   A role with no saved choice for a section keeps seeing it as long as it can see the
   Dashboard at all, so nothing changes for existing roles until an admin edits them. */

function dashSectionKey(el){
  if(!el || !el.classList) return null;
  if(el.classList.contains('strength-hero-wrap')) return 'dashboard_headcount';
  if(el.classList.contains('qa-grid')) return 'dashboard_quickaccess';
  if(el.classList.contains('dash-hero-stats')) return 'dashboard_fee_totals';
  if(el.classList.contains('overview-panel')) return 'dashboard_fee_overview';
  if(el.classList.contains('cat-donut-panel') || el.classList.contains('cat-grid') || el.id === 'dashCatTxnModalWrap') return 'dashboard_fee_category';
  if(el.classList.contains('demo-grid')) return 'dashboard_students';
  if(el.classList.contains('trend-panel')){
    const t = (el.innerText || '').slice(0, 80).toLowerCase();
    return t.includes('attendance') ? 'dashboard_attendance_trend' : 'dashboard_fee_trend';
  }
  if(el.classList.contains('pay-table-wrap')) return 'dashboard_payments';
  return null;
}

function dashApplyAccess(){
  if(typeof currentUser === 'undefined' || !currentUser || typeof canDashboardSection !== 'function') return;
  const root = document.getElementById('view-dashboard');
  if(!root) return;
  const kids = Array.from(root.children);
  // A section title belongs to whatever block follows it.
  const keys = kids.map(k => dashSectionKey(k));
  kids.forEach((k, i) => {
    if(k.classList.contains('dash-section-title')){
      keys[i] = keys[i + 1] || null;
    }
  });
  let shown = 0;
  kids.forEach((k, i) => {
    const key = keys[i];
    if(!key) return;
    if(canDashboardSection(key)){ k.style.removeProperty('display'); if(!k.classList.contains('dash-section-title')) shown++; }
    else k.style.setProperty('display', 'none', 'important');
  });
  let note = document.getElementById('dashNoAccessNote');
  if(shown === 0){
    if(!note){
      note = document.createElement('div'); note.id = 'dashNoAccessNote';
      note.style.cssText = 'margin:28px 0; padding:28px; text-align:center; border:1px dashed var(--border); border-radius:18px; color:var(--ink-soft);';
      note.innerHTML = '<b style="display:block; color:var(--navy); font-size:1.05rem; margin-bottom:6px;">Nothing to show here yet</b>No Dashboard sections have been turned on for your role. Please ask the Admin to enable them in Roles &amp; Permissions.';
      root.appendChild(note);
    }
  }else if(note){ note.remove(); }
}

{
  const _renderDashboardBase = renderDashboard;
  renderDashboard = async function(){
    const r = await _renderDashboardBase.apply(this, arguments);
    try{ dashApplyAccess(); setTimeout(dashApplyAccess, 700); }catch(e){ console.error('dashboard access', e); }
    return r;
  };
}
