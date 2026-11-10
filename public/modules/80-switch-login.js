/* ============================================================================
   Switch login (a teacher who is also a parent)
   A "Switch login" item in the account menu, for Teacher and Parent/Student logins. The person adds their other login once
   (username and password, checked like a normal sign-in); after that one tap swaps between the two without signing out.
   Each login keeps its own permissions. Signing out removes both from the phone.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const eligible = () => ['Teacher', 'Parent', 'Student'].includes(role()) && !(currentUser && currentUser.impersonating);
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; err.data = j; throw err; }
    return j;
  }
  function css(){
    if($('swCss')) return;
    const s = document.createElement('style'); s.id = 'swCss';
    s.textContent = `
      .sw-ov{position:fixed;inset:0;z-index:99995;background:rgba(20,16,50,.65);display:flex;align-items:center;justify-content:center;padding:14px;}
      .sw-box{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:18px 20px;box-shadow:0 30px 80px -20px rgba(0,0,0,.55);}
      .sw-box h3{margin:0 0 6px;color:#211a4e;font-size:1.1rem;} .sw-box p{margin:0 0 12px;color:#556;font-size:.88rem;line-height:1.45;}
      .sw-box label{display:block;font-size:.78rem;color:#667;margin:8px 0 3px;} .sw-box input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cfd6e6;border-radius:10px;font:inherit;font-size:1rem;}
      .sw-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px;} .sw-btn{border:0;border-radius:11px;padding:11px 16px;font:inherit;font-weight:700;cursor:pointer;background:#eef1f7;color:#334;}
      .sw-btn.go{background:#17703a;color:#fff;} .sw-btn.big{width:100%;padding:14px;font-size:1rem;} .sw-btn:disabled{opacity:.55;} .sw-err{color:#b3261e;font-size:.85rem;margin-top:8px;min-height:1em;}
      .sw-link{background:none;border:0;color:#b3261e;font:inherit;font-size:.82rem;cursor:pointer;text-decoration:underline;margin-top:10px;padding:0;}
    `;
    document.head.appendChild(s);
  }
  function close(){ const o = $('swModal'); if(o) o.remove(); }
  function modal(html){ css(); close(); const o = document.createElement('div'); o.className = 'sw-ov'; o.id = 'swModal'; o.innerHTML = `<div class="sw-box">${html}</div>`; o.addEventListener('click', e => { if(e.target === o) close(); }); document.body.appendChild(o); return o; }
  const roleName = r => r === 'Teacher' ? 'teacher login' : 'parent login';

  async function open(){
    let st = null; try{ st = await api('GET', '/api/account/switch'); }catch(e){}
    if(!st || !st.available){ try{ showToast('Switch login is not available for this account.'); }catch(e){} return; }
    if(st.other) return showSwitch(st.other);
    showAdd(st.wants);
  }
  function showSwitch(o){
    const m = modal(`<h3>Switch login</h3><p>You are signed in as <b>${esc(currentUser.name || '')}</b>. Your other login on this phone is <b>${esc(o.name)}</b> (${roleName(o.role)}).</p>
      <button class="sw-btn go big" id="swGo">Switch to ${esc(o.name)}</button><div class="sw-err" id="swErr"></div>
      <div class="sw-row" style="justify-content:space-between;align-items:center"><button class="sw-link" id="swRm">Remove the other login from this phone</button><button class="sw-btn" id="swX">Close</button></div>`);
    $('swX').onclick = close;
    $('swGo').onclick = async () => { $('swGo').disabled = true; try{ await api('POST', '/api/account/switch'); location.reload(); }catch(e){ if(e.data && e.data.needLogin){ showAdd(role() === 'Teacher' ? 'child' : 'teacher', 'Your other login has timed out. Please add it again.'); } else { $('swErr').textContent = e.message; $('swGo').disabled = false; } } };
    $('swRm').onclick = async () => { if(!confirm('Remove the other login from this phone? You can add it again any time.')) return; try{ await api('POST', '/api/account/switch/remove'); close(); try{ showToast('Removed.'); }catch(e){} }catch(e){ $('swErr').textContent = e.message; } };
  }
  function showAdd(wants, note){
    const child = wants !== 'teacher';
    modal(`<h3>${child ? "Add your child's login" : 'Add your teacher login'}</h3><p>${note ? esc(note) + ' ' : ''}${child ? "Enter the parent or student username and password you use for your child. You only do this once on this phone. After that you can switch with one tap, without signing out." : 'Enter your teacher username and password. After that you can switch with one tap, without signing out.'}</p>
      <label>Username</label><input id="swU" autocomplete="off" autocapitalize="none" spellcheck="false"><label>Password</label><input id="swP" type="password" autocomplete="off"><div class="sw-err" id="swErr"></div>
      <div class="sw-row"><button class="sw-btn" id="swX">Cancel</button><button class="sw-btn go" id="swAdd">Add and switch</button></div>`);
    $('swX').onclick = close;
    $('swAdd').onclick = async () => {
      const u = $('swU').value.trim(), p = $('swP').value; if(!u || !p){ $('swErr').textContent = 'Please enter both.'; return; }
      $('swAdd').disabled = true; $('swErr').textContent = '';
      try{ await api('POST', '/api/account/switch/add', { username: u, password: p }); location.reload(); }
      catch(e){ $('swErr').textContent = e.message; $('swAdd').disabled = false; }
    };
  }
  function ensureItem(){
    if(!eligible()) { const b = $('swMenuBtn'); if(b) b.remove(); return; }
    const menu = $('sbUserMenu'); if(!menu || $('swMenuBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'swMenuBtn'; b.setAttribute('role', 'menuitem'); b.className = 'approvals-bell-btn';
    b.innerHTML = '<span class="approvals-bell-icon">🔁</span><span class="sb-btn-label">Switch login</span>';
    b.onclick = () => { try{ closeSbUserMenu(); }catch(e){} open(); };
    const out = menu.querySelector('.sb-signout'); if(out) menu.insertBefore(b, out); else menu.appendChild(b);
  }
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){ const r = o.apply(this, arguments); try{ ensureItem(); }catch(e){} return r; };
  }
  setInterval(() => { try{ ensureItem(); }catch(e){} }, 3000);
})();
