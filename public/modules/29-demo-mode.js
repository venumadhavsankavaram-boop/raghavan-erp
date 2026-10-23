/* Demo mode: on a showcase install (server env DEMO_MODE=true) show a "demo" ribbon and the
   demo logins on the sign-in page. On a real school's install /api/demo-info says demo:false
   and this file does nothing. */
(function(){
  fetch('/api/demo-info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(info => {
    if(!info || !info.demo) return;
    const bar = document.createElement('div');
    bar.id = 'demoRibbon';
    const narrow = window.matchMedia && window.matchMedia('(max-width:600px)').matches;
    bar.textContent = narrow
      ? 'DEMO \u2014 sample data only \u00b7 \u00a9 SVM EdTech \u00b7 copying not permitted'
      : 'DEMO \u2014 sample data only. Nothing here is real, and no messages or payments are sent.  \u00b7  \u00a9 SVM EdTech. For evaluation only; copying not permitted.';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#7a2e8f;color:#fff;text-align:center;font:600 ' + (narrow ? '11' : '12') + 'px system-ui,sans-serif;padding:5px 10px;line-height:1.35;';
    document.body.appendChild(bar);
    /* Keep the ribbon from covering the app: shrink the sidebar and pad the page by its height. */
    const st = document.createElement('style');
    st.textContent = '.sidebar{height:calc(100vh - var(--demo-h,0px)) !important;height:calc(100dvh - var(--demo-h,0px)) !important}' +
      '.main{padding-bottom:calc(22px + var(--demo-h,0px)) !important}';
    document.head.appendChild(st);
    const setH = () => document.documentElement.style.setProperty('--demo-h', bar.offsetHeight + 'px');
    setH(); window.addEventListener('resize', setH);
    document.title = 'DEMO — ' + document.title;
    const form = document.getElementById('loginForm');
    if(form && !document.getElementById('demoLogins')){
      const box = document.createElement('div');
      box.id = 'demoLogins';
      box.style.cssText = 'margin:0 0 14px;padding:10px 12px;border:1px dashed #7a2e8f;border-radius:10px;font-size:0.78rem;text-align:left;line-height:1.6;';
      box.innerHTML = '<b>Try the demo</b> — password for all: <b>' + String(info.password).replace(/[<>&]/g, '') + '</b><br>' +
        (info.logins || []).map(l => '<a href="#" data-u="' + l[0] + '" style="color:#7a2e8f;font-weight:600;">' + l[0] + '</a> <span style="opacity:.7">(' + l[1] + ')</span>').join(' · ');
      form.insertBefore(box, form.firstChild);
      box.addEventListener('click', e => {
        const a = e.target.closest('a[data-u]'); if(!a) return; e.preventDefault();
        const u = form.querySelector('input[type="text"], input[id*="sername"]'); const p = form.querySelector('input[type="password"]');
        if(u) u.value = a.dataset.u; if(p) p.value = info.password;
      });
    }
  }).catch(() => {});
})();
