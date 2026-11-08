/* One home for promotion: "Promotion & Transfer" now opens on a "Year-end Promotion" tab (the whole-class wizard that carries
   unpaid fees). The old School Setup > Promotions screen and its menu entry are folded into it: anything that still opens
   "promotions" lands here. No data or permission rule changes; the wizard itself is the same code, only its host moved. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const role = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser.role : '';
  const setupOk = () => { try{ return !!getSetupTabAccess(role(), 'setup_promotions'); }catch(e){ return false; } };
  const promoOk = () => { try{ return !!getPromoTransferTabAccess(role(), 'promo_promote'); }catch(e){ return false; } };
  const navOn = () => { const n = $('navPromoTransfer'); return !!n && n.style.display !== 'none'; };
  const canYearEnd = () => setupOk() && promoOk() && navOn();
  let firstOpen = true;

  PT_TAB_PERM_KEYS.yearend = 'promo_promote';

  function css(){
    if($('phCss')) return;
    const s = document.createElement('style'); s.id = 'phCss';
    s.textContent = '#navPromotions{display:none !important}';
    document.head.appendChild(s);
  }

  function tabs(){
    const bar = document.querySelector('#view-promotransfer .mf-tabs');
    if(!bar || $('pttab-yearend')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mf-tab'; b.id = 'pttab-yearend'; b.textContent = 'Year-end Promotion';
    b.setAttribute('onclick', "switchPromoTransferTab('yearend')");
    bar.insertBefore(b, bar.firstChild);
    const p = $('pttab-promote'); if(p) p.textContent = 'Promote Selected Students';
    const sub = document.querySelector('#view-promotransfer .topbar p');
    if(sub) sub.textContent = 'At year end promote whole classes (unpaid fees move with each student), promote or skip a grade for selected students, change a section, or record a transfer out.';
  }

  /* open: Year-end Promotion is the first tab for people allowed to use it */
  const origInit = initPromoTransferView;
  initPromoTransferView = function(){
    css(); tabs();
    const ok = canYearEnd();
    if(ok && firstOpen && promoTransferTab === 'promote') promoTransferTab = 'yearend';
    firstOpen = false;
    if(!ok && promoTransferTab === 'yearend') promoTransferTab = 'promote';
    const r = origInit.apply(this, arguments);
    const b = $('pttab-yearend'); if(b && !ok) b.style.display = 'none';
    return r;
  };

  const origSwitchTab = switchPromoTransferTab;
  switchPromoTransferTab = function(tab){
    if(tab === 'yearend' && !canYearEnd()) tab = 'promote';
    const r = origSwitchTab.call(this, tab);
    const b = $('pttab-yearend'); if(b) b.classList.toggle('active', tab === 'yearend');
    try{ if(typeof window.ayDraw === 'function') setTimeout(window.ayDraw, 150); }catch(e){}
    return r;
  };

  const origBody = renderPromoTransferBody;
  renderPromoTransferBody = async function(){
    if(promoTransferTab !== 'yearend') return origBody.apply(this, arguments);
    await ensureDataLoaded('payments', loadPaymentsData);
    const body = $('promoTransferBody'); if(!body) return;
    if(!canYearEnd()){ body.innerHTML = '<div class="empty-state"><b>You don\'t have access to this section.</b></div>'; return; }
    body.innerHTML = '<div id="ptYearEnd"></div>';
    renderPromotionsTab($('ptYearEnd'));
  };

  /* the old screen: anything that still asks for it lands on the new tab */
  function hook(){
    const prev = window.switchView;
    if(typeof prev !== 'function' || prev.__ph) return;
    const w = function(view){
      if(view === 'promotions' && canYearEnd()){ promoTransferTab = 'yearend'; arguments[0] = 'promotransfer'; }
      return prev.apply(this, arguments);
    };
    w.__ph = true; window.switchView = w;
  }
  hook(); css();
})();
