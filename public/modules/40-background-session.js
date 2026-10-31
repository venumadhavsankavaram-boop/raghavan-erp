/* ============================================================================
   Background sessions: an app left open in the background must still sign out.
   The app talks to the server by itself (notification bell, approvals bell, settings checks). Those calls
   used to renew the 30-minute login timer, so a phone left running in the background never signed out.
   Now every request made while the page is hidden, or after 90 seconds without a touch / click / key,
   is marked "background". The server still checks the login for it but does NOT renew the timer.
   When someone comes back to the app after a while, the login is checked at once, so an expired
   session shows the login screen straight away instead of after the first tap.
   ========================================================================== */
(function(){
  if(window.__bgSessionHooked) return; window.__bgSessionHooked = true;
  const QUIET_MS = 90 * 1000;
  let last = Date.now(), hiddenAt = 0;
  const touch = () => { last = Date.now(); };
  ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'wheel'].forEach(ev => window.addEventListener(ev, touch, { capture: true, passive: true }));
  window.addEventListener('scroll', touch, { capture: true, passive: true });

  const of = window.fetch.bind(window);
  window.fetch = function(input, init){
    try {
      const url = typeof input === 'string' ? input : ((input && input.url) || '');
      const isApi = url.indexOf('/api/') === 0 || url.indexOf(location.origin + '/api/') === 0;
      if(isApi && (document.hidden || Date.now() - last > QUIET_MS)){
        init = Object.assign({}, init);
        const h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || undefined);
        h.set('X-Background', '1'); init.headers = h;
      }
    } catch(e){}
    return of(input, init);
  };

  // Back in the app after being away: check the login right now.
  async function onReturn(){
    try {
      if(typeof currentUser === 'undefined' || !currentUser) return;
      const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
      if(away < 60 * 1000) return;
      last = Date.now();
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      if(r.status === 401){
        if(typeof forceSessionExpired === 'function') forceSessionExpired();
        else { showToast('Your session has expired. Please log in again.'); logout(); }
      }
    } catch(e){}
  }
  document.addEventListener('visibilitychange', () => { if(document.hidden) hiddenAt = Date.now(); else onReturn(); });
  window.addEventListener('pageshow', e => { if(e.persisted) { hiddenAt = hiddenAt || (Date.now() - 61000); onReturn(); } });
})();
