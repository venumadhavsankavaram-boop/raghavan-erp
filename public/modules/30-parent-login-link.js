/* Parent & Student login link: https://<erp>/?login=parent opens the sign-in page with only the Parent & Student
   login (the Staff tab is hidden). The server still checks the audience on every login, so a staff account
   cannot sign in through this link. */
(function(){
  try{
    var q = new URLSearchParams(location.search);
    if(q.get('login') !== 'parent') return;
    function apply(){
      if(typeof setLoginAudience !== 'function') return;
      setLoginAudience('parent');
      var tg = document.querySelector('.login-audience-toggle'); if(tg) tg.style.display = 'none';
      var sub = document.querySelector('.login-sub'); if(sub) sub.textContent = 'Parent & Student login — sign in to continue';
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  }catch(e){}
})();
