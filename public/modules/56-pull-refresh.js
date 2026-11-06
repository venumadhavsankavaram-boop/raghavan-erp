/* =========================================================================
   Pull down to refresh — phones and tablets, every login (parent / student, teacher, staff, admin).
   Pull the page down from the very top and let go: the latest data is fetched from the server again and
   the screen you are on is redrawn (same tab, still signed in). Nothing is saved or changed by this.
   Not triggered while a pop-up is open, while typing, inside a scrolling table, or when not signed in.
   ========================================================================= */
(function(){
  'use strict';
  if(window.__pullRefreshHooked) return; window.__pullRefreshHooked = true;
  const THRESHOLD = 70, MAX_PULL = 120;
  let lastView = '', busy = false, startY = 0, startX = 0, pulling = false, armed = false, bar = null;

  // remember which screen is showing so it can be redrawn after the refresh
  try{
    if(typeof window.switchView === 'function'){
      const orig = window.switchView;
      window.switchView = function(v){ try{ if(v) lastView = v; }catch(e){} return orig.apply(this, arguments); };
    }
  }catch(e){}

  const signedIn = () => { try{ return typeof currentUser !== 'undefined' && !!currentUser; }catch(e){ return false; } };
  const isTouch = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  function scrollTopNow(el){
    let n = el, top = window.pageYOffset || document.documentElement.scrollTop || 0;
    while(n && n !== document.body && n !== document.documentElement){
      if(n.scrollTop > 0) return n.scrollTop;
      n = n.parentElement;
    }
    const main = document.querySelector('.main');
    return Math.max(top, main ? main.scrollTop : 0);
  }
  function blocked(t){
    if(!signedIn()) return true;
    if(!t || !t.closest) return false;
    if(t.closest('input,textarea,select,[contenteditable="true"],.table-wrap,.ttx-wrap,canvas,iframe')) return true;
    if(document.querySelector('.modal-backdrop.open,.modal.open,.modal-overlay.open,dialog[open],#loginOverlay[style*="flex"]')) return true;
    return false;
  }
  function ensureBar(){
    if(bar) return bar;
    bar = document.createElement('div');
    bar.id = 'prBar';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText = 'position:fixed;left:50%;top:0;transform:translate(-50%,-60px);z-index:99999;width:42px;height:42px;border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:20px;color:#2f6fed;transition:transform .18s;pointer-events:none;';
    bar.innerHTML = '<svg id="prSvg" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
      '<circle cx="13" cy="13" r="9" stroke="#e3e8f3" stroke-width="2.6"/>' +
      '<circle id="prArc" cx="13" cy="13" r="9" stroke="#b3185f" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="56.55" stroke-dashoffset="56.55" transform="rotate(-90 13 13)"/>' +
      '<path id="prHead" d="M13 8.4 L13 17.6 M9.4 14 L13 17.6 L16.6 14" stroke="#b3185f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(bar);
    if(!document.getElementById('prCss')){
      const s = document.createElement('style'); s.id = 'prCss';
      s.textContent = '@keyframes prSpin{to{transform:rotate(360deg)}} #prSvg{display:block;transform-origin:50% 50%;will-change:transform} #prHead{transform-origin:13px 13px;transition:transform .2s ease,opacity .15s} #prBar.spin #prSvg{animation:prSpin .75s linear infinite} #prBar.spin #prHead{opacity:0} #prBar.spin #prArc{stroke-dashoffset:14.1!important;transition:none}';
      document.head.appendChild(s);
    }
    return bar;
  }
  function show(dy, ready){
    const b = ensureBar(); b.style.transition = 'none';
    b.style.transform = 'translate(-50%,' + (Math.min(dy, MAX_PULL) - 50) + 'px)';
    const p = Math.max(0, Math.min(1, dy / (THRESHOLD * 0.6)));
    const arc = b.querySelector('#prArc'), head = b.querySelector('#prHead'), svg = b.querySelector('#prSvg');
    if(arc) arc.style.strokeDashoffset = String(56.55 * (1 - p));
    if(head) head.style.transform = ready ? 'rotate(180deg)' : 'none';
    if(svg) svg.style.transform = 'none';
  }
  function hide(){
    if(!bar) return;
    bar.classList.remove('spin'); bar.style.transition = 'transform .2s'; bar.style.transform = 'translate(-50%,-60px)';
    const arc = bar.querySelector('#prArc'), head = bar.querySelector('#prHead'), svg = bar.querySelector('#prSvg');
    if(arc) arc.style.strokeDashoffset = '56.55'; if(head) head.style.transform = 'none'; if(svg) svg.style.transform = 'none';
  }

  async function refreshNow(){
    if(busy || !signedIn()) return;
    busy = true;
    const b = ensureBar(); b.style.transition = 'transform .2s'; b.classList.add('spin'); b.style.transform = 'translate(-50%,16px)';
    const sv = b.querySelector('#prSvg'); if(sv) sv.style.transform = '';
    try{
      // forget what the lazily loaded lists cached, so they are fetched again
      try{ if(typeof _lazyDataPromises === 'object') Object.keys(_lazyDataPromises).forEach(k => { delete _lazyDataPromises[k]; }); }catch(e){}
      if(typeof loadAllAppData === 'function') await loadAllAppData();
      try{ if(typeof updateMyProfileBadge === 'function') updateMyProfileBadge(); }catch(e){}
      const v = lastView;
      if(v && typeof window.switchView === 'function') window.switchView(v);
      else if(typeof renderMyProfileBody === 'function') await renderMyProfileBody();
      try{ if(typeof showToast === 'function') showToast('Updated'); }catch(e){}
    }catch(e){
      try{ console.error('refresh failed', e); }catch(_){}
    }finally{
      setTimeout(() => { hide(); busy = false; }, 350);
    }
  }
  window.pullRefreshNow = refreshNow;

  if(!isTouch()) return;
  document.addEventListener('touchstart', e => {
    pulling = false; armed = false;
    if(busy || e.touches.length !== 1) return;
    const t = e.target;
    if(blocked(t) || scrollTopNow(t) > 0) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX; pulling = true;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if(!pulling) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if(dy <= 0 || dx > dy){ if(dy < -5){ pulling = false; hide(); } return; }
    if(scrollTopNow(e.target) > 0){ pulling = false; hide(); return; }
    armed = dy >= THRESHOLD;
    show(dy * 0.6, armed);
  }, { passive: true });
  function end(){
    if(!pulling) return;
    pulling = false;
    if(armed){ armed = false; refreshNow(); } else hide();
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { pulling = false; armed = false; hide(); }, { passive: true });
})();

/* Parent/Student logins (also when an admin uses "Log in as") are view-only: block browser printing of the portal. */
(function(){
  function apply(){
    var r = window.currentUser && window.currentUser.role;
    var on = (r === 'Student' || r === 'Parent');
    var st = document.getElementById('noPrintPortal');
    if(on && !st){ st = document.createElement('style'); st.id='noPrintPortal'; st.textContent='@media print{body{display:none!important}}'; document.head.appendChild(st); }
    if(!on && st) st.remove();
  }
  setInterval(apply, 1500);
})();
