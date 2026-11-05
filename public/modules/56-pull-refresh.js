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
    bar.innerHTML = '<span id="prIco" style="display:inline-block;transition:transform .15s;">↓</span>';
    document.body.appendChild(bar);
    if(!document.getElementById('prCss')){
      const s = document.createElement('style'); s.id = 'prCss';
      s.textContent = '@keyframes prSpin{to{transform:rotate(360deg)}} #prBar.spin #prIco{animation:prSpin .8s linear infinite}';
      document.head.appendChild(s);
    }
    return bar;
  }
  function show(dy, ready){
    const b = ensureBar();
    b.style.transform = 'translate(-50%,' + (Math.min(dy, MAX_PULL) - 50) + 'px)';
    const ico = b.querySelector('#prIco'); if(ico) ico.style.transform = ready ? 'rotate(180deg)' : 'none';
  }
  function hide(){ if(bar){ bar.classList.remove('spin'); bar.style.transform = 'translate(-50%,-60px)'; const i = bar.querySelector('#prIco'); if(i){ i.textContent = '↓'; i.style.transform = 'none'; } } }

  async function refreshNow(){
    if(busy || !signedIn()) return;
    busy = true;
    const b = ensureBar(); b.classList.add('spin'); b.style.transform = 'translate(-50%,16px)';
    const ico = b.querySelector('#prIco'); if(ico) ico.textContent = '⟳';
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
