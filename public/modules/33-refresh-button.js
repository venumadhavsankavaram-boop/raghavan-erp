/* ===== Refresh button =====
   One "Refresh" button on the attendance, marks / results and fee pages. It fetches the latest data from the server again (what the
   assistants / teachers saved on other devices) and redraws the page you are on — no log-out, no
   page reload. Anything typed into an open form is left alone; unsaved attendance marks are kept. */
(function(){
  const loaders = {};          // lazy datasets seen so far: key -> loader function
  let busy = false;
  // Remember every lazily loaded dataset, so Refresh can fetch each of them again.
  const origEnsure = window.ensureDataLoaded;
  if(typeof origEnsure === 'function'){
    window.ensureDataLoaded = function(key, loaderFn){ if(key && typeof loaderFn === 'function') loaders[key] = loaderFn; return origEnsure.apply(this, arguments); };
  }
  // Remember which page is open.
  const origSwitch = window.switchView;
  if(typeof origSwitch === 'function'){
    window.switchView = function(view){ window.__erpView = view; paint(); return origSwitch.apply(this, arguments); };
  }
  const css = document.createElement('style');
  css.textContent = `
    #erpRefreshBtn{position:fixed;right:16px;bottom:16px;z-index:850;display:none;align-items:center;gap:7px;padding:10px 16px;border:0;border-radius:999px;
      background:var(--brand-navy,#1d1a4d);color:#fff;font:600 .86rem/1 inherit;cursor:pointer;box-shadow:0 6px 18px rgba(20,16,60,.28);}
    #erpRefreshBtn:hover{filter:brightness(1.12)}
    #erpRefreshBtn .rf-i{display:inline-block;font-size:1.05rem;line-height:1}
    #erpRefreshBtn.rf-spin .rf-i{animation:rfSpin .8s linear infinite}
    #erpRefreshBtn.rf-spin{opacity:.75;pointer-events:none}
    @keyframes rfSpin{to{transform:rotate(360deg)}}
    @media print{#erpRefreshBtn{display:none!important}}
    @media (max-width:640px){#erpRefreshBtn{bottom:76px;padding:11px 14px}#erpRefreshBtn .rf-t{display:none}}`;
  document.head.appendChild(css);
  const btn = document.createElement('button');
  btn.id = 'erpRefreshBtn'; btn.type = 'button';
  btn.title = 'Get the latest data from the server';
  btn.innerHTML = '<span class="rf-i" aria-hidden="true">↻</span><span class="rf-t">Refresh</span>';
  btn.addEventListener('click', refresh);
  document.body.appendChild(btn);
  // Only the pages where people wait for data entered on other devices: attendance, marks / results and fees.
  // Other pages refresh themselves or don't need it.
  const SHOW_ON = ['attendance', 'staffattendance', 'exams', 'result', 'managefee'];
  function paint(){
    try{ const ov = document.getElementById('loginOverlay');
      const onLogin = ov && getComputedStyle(ov).display !== 'none';
      const onPage = SHOW_ON.indexOf(window.__erpView) >= 0;
      btn.style.display = (!onLogin && onPage && typeof currentUser !== 'undefined' && currentUser) ? 'inline-flex' : 'none'; }catch(e){ btn.style.display = 'none'; }
  }
  paint();
  setInterval(paint, 1500);
  async function refresh(){
    if(busy) return;
    busy = true; btn.classList.add('rf-spin');
    try{
      try{ kvPrefetch(); }catch(e){}
      await loadAllAppData();
      await Promise.all(Object.keys(loaders).map(k => Promise.resolve(reloadDataset(k, loaders[k])).catch(() => {})));
      const v = window.__erpView || 'dashboard';
      if(v === 'attendance' && typeof renderAttendanceBody === 'function') renderAttendanceBody();       // keeps unsaved marks
      else if(v === 'managefee' && typeof renderFeeBody === 'function') renderFeeBody();
      else if(typeof origSwitch === 'function') origSwitch(v);
      showToast('Updated — showing the latest data.');
    }catch(e){
      showToast('Could not refresh. Check the internet connection and try again.');
    }finally{
      busy = false; btn.classList.remove('rf-spin');
    }
  }
  window.erpRefresh = refresh;
  paint();
})();
