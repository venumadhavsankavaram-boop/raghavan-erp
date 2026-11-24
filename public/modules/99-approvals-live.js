/* Copyright (c) 2026 SVM EdTech. All rights reserved. Proprietary and confidential.
   Unauthorised copying, modification or distribution of this file is prohibited. See LICENSE. */
/* ============================================================================
   Approvals, kept live and never doubled up.
   - The approval bell used to count only what this browser loaded at sign-in, so a request a teacher or
     accountant sent while the Admin was already signed in did not show until the Admin signed in again.
     Every check now re-reads the three request lists first.
   - Anyone adding a request first re-reads the list, so two people sending at once cannot overwrite each other.
   - The pop-up from this browser is merged with the phone alert (same tag), and a ?approval=<id> link
     from the alert list or a phone alert opens the Approvals Center straight away.
   ========================================================================== */
(function(){
  'use strict';
  async function reload(key, get, set){
    try{ const v = await storageGet(key, []); if(Array.isArray(v)) set(v); }catch(e){ /* keep what we have */ }
  }
  window.freshApprovals = function(){
    return reload(PENDING_APPROVALS_KEY, null, v => { pendingApprovals = v; });
  };
  async function freshAll(){
    await Promise.all([
      freshApprovals(),
      reload(STUDENT_DISCOUNTS_KEY, null, v => { studentDiscounts = v; }),
      reload(STAFF_PAYROLL_KEY, null, v => { staffPayrollRecords = v; })
    ]);
  }
  if(typeof computeApprovalQueueItems === 'function'){
    const orig = computeApprovalQueueItems;
    computeApprovalQueueItems = async function(){ await freshAll(); return orig.apply(this, arguments); };
  }
  // open the Approvals Center when a link carries ?approval=<id>
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    try{
      const q = new URLSearchParams(location.search);
      if(!q.get('approval')){ clearInterval(t); return; }
      if(typeof currentUser !== 'undefined' && currentUser && typeof openApprovalsCenter === 'function'){
        clearInterval(t);
        history.replaceState(null, '', location.pathname);
        openApprovalsCenter();
      }
    }catch(e){}
    if(tries > 40) clearInterval(t);
  }, 1000);
})();
