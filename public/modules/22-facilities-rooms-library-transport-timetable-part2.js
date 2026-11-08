
  function addToInvCart(itemId){
    const now = Date.now();
    if(invCartLastAddTime[itemId] && (now - invCartLastAddTime[itemId]) < 400) return; // guard: a single click/tap should never register twice
    invCartLastAddTime[itemId] = now;
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it || it.quantity <= 0) return;
    const existing = invCart.find(c => c.itemId === itemId);
    if(existing){
      if(existing.qty >= it.quantity){ showToast('Not enough stock.'); return; }
      existing.qty++;
    }else{
      invCart.push({ itemId, name:it.name, price:it.sellingPrice, cost:it.costPrice, qty:1, discount:0, stock:it.quantity });
    }
    renderInventoryBody();
  }
  function removeFromInvCart(i){
    invCart.splice(i,1);
    renderInventoryBody();
  }
  function goToInvCheckout(){
    if(invCart.length === 0){ showToast('Add at least one item.'); return; }
    inventoryTab = 'sellcheckout';
    renderInventoryBody();
  }
  function backToInvCart(){
    inventoryTab = 'sellcart';
    renderInventoryBody();
  }
  function adjustInvCartQty(i, delta){
    const c = invCart[i];
    const newQty = c.qty + delta;
    if(newQty < 1) return;
    if(newQty > c.stock){ showToast('Not enough stock.'); return; }
    c.qty = newQty;
    renderInventoryBody();
  }
  function setInvCartDiscount(i, val){
    invCart[i].discount = Number(val) || 0;
    renderInventoryBody();
  }
  let invCheckoutSearchDebounce = null;
  function onInvCheckoutStudentInput(){
    clearTimeout(invCheckoutSearchDebounce);
    invCheckoutSearchDebounce = setTimeout(() => renderInvCheckoutSuggestions(document.getElementById('invCheckoutStudentSearch').value.trim()), 150);
  }
  function renderInvCheckoutSuggestions(q){
    const box = document.getElementById('invCheckoutStudentSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => isActive(s) && ((s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql))).slice(0,8);
    box.innerHTML = matches.length ? matches.map(s => `<div class="sg-item" onmousedown="selectInvCheckoutStudent('${s.id}')">
      <div class="sg-avatar">${initials(s)}</div>
      <div><div class="sg-name">${s.lastName} ${s.firstName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('') : `<div class="sg-empty">No students match "${q}"</div>`;
    box.classList.add('open');
  }
  function selectInvCheckoutStudent(id){
    invCheckoutStudentId = id;
    hideInvCheckoutSuggestions();
    renderInventoryCheckout(document.getElementById('inventoryBody'));
  }
  function hideInvCheckoutSuggestions(){
    const box = document.getElementById('invCheckoutStudentSuggestions');
    if(box) box.classList.remove('open');
  }
  function completeInventorySale(){ return rcGuard(() => completeInventorySaleImpl()); }
  async function completeInventorySaleImpl(){
    // A stock-purchase sale to a student becomes its own `payments` row
    // (category:'extra') — must not push onto an unloaded array.
    await ensureDataLoaded('payments', loadPaymentsData);
    if(invCheckoutBuyerType==='Student' && !invCheckoutStudentId){ showToast('Select a student.'); return; }
    for(const c of invCart){
      const it = inventoryItems.find(x => x.id === c.itemId);
      if(!it || it.quantity < c.qty){ showToast(`Not enough stock for ${c.name}.`); return; }
    }
    const paidAmountInput = Number(document.getElementById('invCheckoutPaidAmount').value) || 0;
    const notes = document.getElementById('invCheckoutNotes').value.trim();
    const buyerName = invCheckoutBuyerType!=='Student' ? (document.getElementById('invCheckoutBuyerName').value.trim() || invCheckoutBuyerType) : '';
    const todayStr = new Date().toISOString().slice(0,10);
    const dateInput = document.getElementById('invCheckoutDate');
    const today = dateInput ? dateInput.value : todayStr;
    if(!today){ showToast('Set a sale date.'); return; }
    if(today > todayStr){ showToast("Sale date can't be in the future."); return; }
    const grandTotal = invCart.reduce((sum,c) => sum+c.price*c.qty-c.discount, 0);
    const buyerStudent = invCheckoutBuyerType==='Student' ? students.find(s => s.id===invCheckoutStudentId) : null;
    // Receipt numbers are issued only now, after every check above passed.
    if(invCheckoutBuyerType==='Student'){
      // Only lines that actually receive money get a receipt number — reserve exactly that many.
      let rem = Number((document.getElementById('invCheckoutPaidAmount') || {}).value) || 0, nRcpt = 0;
      invCart.forEach(c => { const lp = Math.max(0, Math.min(rem, c.price*c.qty - c.discount)); rem -= lp; if(lp > 0) nRcpt++; });
      if(nRcpt > 0) await rcEnsure(nRcpt);
    }
    let remainingPaid = paidAmountInput;
    const _saleBefore = payments.length;
    invCart.forEach(c => {
      const it = inventoryItems.find(x => x.id === c.itemId);
      const lineTotal = c.price*c.qty - c.discount;
      const lineCost = c.cost*c.qty;
      it.quantity -= c.qty;
      const linePaid = Math.max(0, Math.min(remainingPaid, lineTotal));
      remainingPaid -= linePaid;
      let sefId = '';
      if(invCheckoutBuyerType==='Student' && buyerStudent){
        sefId = 'sef_'+Date.now()+'_'+c.itemId;
        studentExtraFees.push({ id:sefId, studentId:invCheckoutStudentId, name:`${c.name} x${c.qty}`, amount:lineTotal, paidAmount:linePaid, paid: linePaid>=lineTotal, date:today });
        if(linePaid > 0){
          payments.push({ id:'pay_'+Date.now()+'_'+c.itemId, receiptNo:nextReceiptNo(), studentId:invCheckoutStudentId, studentName:buyerStudent.lastName+' '+buyerStudent.firstName, category:'extra', extraFeeName:c.name, extraFeeId:sefId, mode:invCheckoutPaymentMode, amount:linePaid, discount:c.discount, instalment:'', date:today, note:notes, classAtPayment:buyerStudent.className });
        }
      }
      inventorySales.push({ id:'isale_'+Date.now()+'_'+c.itemId, itemId:c.itemId, itemName:c.name, buyerType:invCheckoutBuyerType, studentId:invCheckoutBuyerType==='Student'?invCheckoutStudentId:'', buyerName, qty:c.qty, unitPrice:c.price, unitCost:c.cost, discount:c.discount, totalAmount:lineTotal, totalCost:lineCost, paidAmount:linePaid, mode:invCheckoutPaymentMode, notes, date:today, soldBy:currentUser.name, sefId });
    });
    // Receipts first: if they cannot be saved and the person stops, nothing else was written and the page reloads clean.
    if(invCheckoutBuyerType==='Student' && payments.length > _saleBefore){
      if(!(await saveReceiptsSafely(payments.slice(_saleBefore), 'The inventory receipt'))) return;
    }
    let _saleOk = await saveKeySafely(INVENTORY_ITEMS_KEY, inventoryItems, 'The stock quantities');
    _saleOk = _saleOk && await saveKeySafely(INVENTORY_SALES_KEY, inventorySales, 'The sale record');
    if(_saleOk && invCheckoutBuyerType==='Student') _saleOk = await saveKeySafely(STUDENT_EXTRA_FEES_KEY, studentExtraFees, 'The student\'s extra-fee entry');
    if(!_saleOk){ warnPartialAndReload('The sale was only partly saved. Reloading the latest data — please check Inventory and the receipt before repeating it.'); return; }
    renderDashboard();
    invCart = [];
    invCheckoutStudentId = '';
    inventoryTab = 'items';
    renderInventoryBody();
    showToast(`Sale completed — ${fmtMoney(grandTotal)}.`);
  }

  /* --- Approvals (stock changes submitted by non-Admin roles) --- */
  function renderInventoryApprovalsTab(body){
    const isAdmin = currentUser.role === 'Admin';
    const list = pendingApprovals.filter(a => a.type==='inventory_item').slice().sort((a,b) => b.id.localeCompare(a.id));
    body.innerHTML = `
      <div style="margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button></div>
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;">Stock changes submitted by non-Admin roles wait here until Admin reviews them.</p>
      <div class="table-wrap">
        <table><thead><tr><th>Product</th><th>Requested By</th><th>Date</th><th>Explanation</th><th>Change</th><th>Status</th>${isAdmin?'<th></th>':''}</tr></thead>
        <tbody>
        ${list.length ? list.map(a => `<tr>
          <td class="name-cell">${a.payload.name}</td>
          <td>${a.requestedBy} <span class="pill" style="font-size:0.62rem;">${a.requestedByRole}</span></td>
          <td>${a.requestDate}</td>
          <td style="max-width:200px;">${a.explanation}</td>
          <td>${typeof approvalDetailSummary === 'function' ? approvalDetailSummary(a) : (a.payload.editingId?'Edit':'New') + ' — Qty: ' + a.payload.quantity + ', ' + fmtMoney(a.payload.sellingPrice)}</td>
          <td>${a.status==='Pending'?'<span class="balance-tag due">Pending</span>':a.status==='Approved'?'<span class="pill">Approved</span>':'<span class="balance-tag due">Rejected</span>'}</td>
          ${isAdmin ? `<td>${a.status==='Pending'?`<button class="btn-edit-text" onclick="approveInventoryRequest('${a.id}')">Approve</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="rejectInventoryRequest('${a.id}')">Reject</button>`:''}</td>` : ''}
        </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No requests yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  async function approveInventoryRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Approve this stock change? It will be applied immediately.')) return;
    await applyInventoryItemSave(a.payload);
    a.status = 'Approved';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderInventoryBody();
    showToast('Approved and applied.', 'burst');
    notifyRequesterOfDecision(a.requestedByUserId, 'Inventory change approved', `${currentUser.name} approved your inventory change request (${a.payload && a.payload.name || 'item'}) and it's been applied.`, 'approval-decision');
  }
  async function rejectInventoryRequest(id){
    const a = pendingApprovals.find(x => x.id === id);
    if(!a) return;
    if(!await showConfirmDialog('Reject this request? It will not be applied.')) return;
    a.status = 'Rejected';
    await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
    renderInventoryBody();
    showToast('Request rejected.', 'burst');
    notifyRequesterOfDecision(a.requestedByUserId, 'Inventory change rejected', `${currentUser.name} rejected your inventory change request (${a.payload && a.payload.name || 'item'}).`, 'approval-decision');
  }

  /* --- Sales History --- */
  // Every dashboard figure below nets returns against sales rather than the
  // raw sale totals — a return is never allowed to touch the original sale
  // record (that stays a permanent, untouched fact of what was sold and
  // when), so returns are always subtracted back out at display time instead.
  function inventoryNetTotals(){
    const totalRevenue = inventorySales.reduce((sum,s) => sum+s.totalAmount, 0) - inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const totalCost = inventorySales.reduce((sum,s) => sum+s.totalCost, 0) - inventoryReturns.reduce((sum,r) => sum+r.costReversed, 0);
    const totalCollected = inventorySales.reduce((sum,s) => sum+(s.paidAmount||0), 0) - inventoryReturns.reduce((sum,r) => sum+(r.cashRefunded||0), 0);
    return { totalRevenue, totalCost, totalProfit: totalRevenue-totalCost, totalCollected, totalDue: Math.max(0, totalRevenue-totalCollected) };
  }
  function renderInventorySalesHistoryTab(body){
    const canReturn = getInventoryTabAccess(currentUser.role, 'inventory_saleshistory', 'edit');
    const { totalRevenue, totalCost, totalProfit } = inventoryNetTotals();
    const totalRefunded = inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const byItem = {};
    inventorySales.forEach(s => {
      if(!byItem[s.itemId]) byItem[s.itemId] = { name:s.itemName, qty:0, revenue:0, cost:0 };
      byItem[s.itemId].qty += s.qty;
      byItem[s.itemId].revenue += s.totalAmount;
      byItem[s.itemId].cost += s.totalCost;
    });
    inventoryReturns.forEach(r => {
      if(!byItem[r.itemId]) byItem[r.itemId] = { name:r.itemName, qty:0, revenue:0, cost:0 };
      byItem[r.itemId].qty -= r.qty;
      byItem[r.itemId].revenue -= r.refundAmount;
      byItem[r.itemId].cost -= r.costReversed;
    });
    const recent = inventorySales.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    const recentReturns = inventoryReturns.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    body.innerHTML = `
      <div style="margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button></div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalRevenue)}</b><span>Net Revenue</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalCost)}</b><span>Net Cost</span></div>
        <div class="fee-sum-card"><b style="color:${totalProfit>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(totalProfit)}</b><span>Net Profit</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalRefunded)}</b><span>Returned (Revenue Reversed)</span></div>
      </div>
      <div class="dash-section-title"><div><h3>Profit by Item (net of returns)</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Item</th><th>Net Units Sold</th><th>Net Revenue</th><th>Net Cost</th><th>Net Profit</th></tr></thead>
        <tbody>
        ${Object.keys(byItem).length ? Object.values(byItem).map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.qty}</td><td>${fmtMoney(it.revenue)}</td><td>${fmtMoney(it.cost)}</td><td style="color:${(it.revenue-it.cost)>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(it.revenue-it.cost)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No sales yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Recent Sales</h3></div></div>
      <div class="table-wrap" style="margin-bottom:28px;">
        <table><thead><tr><th>Date</th><th>Item</th><th>Buyer</th><th>Qty</th><th>Amount</th><th>Paid</th><th>Mode</th><th>Sold By</th><th></th></tr></thead>
        <tbody>
        ${recent.length ? recent.map(s => {
          const st = s.studentId ? students.find(x=>x.id===s.studentId) : null;
          const buyer = st ? st.lastName+' '+st.firstName : (s.buyerName||s.buyerType);
          const alreadyReturned = returnedQtyForSale(s.id);
          const returnable = s.qty - alreadyReturned;
          return `<tr><td>${s.date}</td><td>${s.itemName}${alreadyReturned>0?` <span class="pill" style="font-size:0.62rem; background:rgba(203,154,46,0.18); color:#8a6a1f;">${alreadyReturned} returned</span>`:''}</td><td>${buyer}</td><td>${s.qty}</td><td>${fmtMoney(s.totalAmount)}</td><td>${fmtMoney(s.paidAmount||0)}</td><td>${s.mode||'—'}</td><td>${s.soldBy||'—'}</td><td>${canReturn && returnable>0 ? `<button class="btn-edit-text" onclick="openInventoryReturnModal('${s.id}')">Return</button>` : (returnable<=0 ? '<span style="color:var(--ink-soft); font-size:0.76rem;">Fully returned</span>' : '')}</td></tr>`;
        }).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No sales yet</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div class="dash-section-title"><div><h3>Returns Log</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Date</th><th>Item</th><th>Buyer</th><th>Qty</th><th>Revenue Reversed</th><th>Cash Refunded</th><th>Mode</th><th>Reason</th><th>Processed By</th></tr></thead>
        <tbody>
        ${recentReturns.length ? recentReturns.map(r => { const st = r.studentId ? students.find(x=>x.id===r.studentId) : null; const buyer = st ? st.lastName+' '+st.firstName : (r.buyerName||r.buyerType||'—'); return `<tr><td>${r.date}</td><td>${r.itemName}</td><td>${buyer}</td><td>${r.qty}</td><td>${fmtMoney(r.refundAmount)}</td><td>${fmtMoney(r.cashRefunded||0)}</td><td>${r.refundMode||'—'}</td><td>${r.reason||'—'}</td><td>${r.processedBy||'—'}</td></tr>`; }).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No returns recorded</b></div></td></tr>`}
        </tbody></table>
      </div>
      <div id="invReturnModalWrap"></div>
    `;
  }
  /* --- Process a student/buyer return of a completed sale --- */
  function openInventoryReturnModal(saleId){
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const alreadyReturned = returnedQtyForSale(saleId);
    const returnable = s.qty - alreadyReturned;
    if(returnable <= 0){ showToast('Nothing left to return on this sale.'); return; }
    const st = s.studentId ? students.find(x=>x.id===s.studentId) : null;
    const buyer = st ? st.lastName+' '+st.firstName : (s.buyerName||s.buyerType);
    const perUnitPrice = s.totalAmount / s.qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const wrap = document.getElementById('invReturnModalWrap');
    wrap.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
        <div class="profile-card" style="width:100%; max-width:380px;">
          <h4>Return — ${s.itemName}</h4>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">Sold to ${buyer} on ${s.date} · ${s.qty} unit${s.qty===1?'':'s'}${alreadyReturned>0?` (${alreadyReturned} already returned)`:''}.</p>
          <input type="hidden" id="invRetSaleId" value="${saleId}">
          <div class="f-field" style="margin-bottom:10px;">
            <label>Return Date</label>
            <input type="date" id="invRetDate" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="f-field" style="margin-bottom:10px;">
            <label>Quantity to Return (max ${returnable})</label>
            <input type="number" id="invRetQty" min="1" max="${returnable}" value="${returnable}" oninput="onInvReturnQtyChange()">
          </div>
          <div class="f-field" style="margin-bottom:10px;">
            <label>Reason</label>
            <input type="text" id="invRetReason" placeholder="e.g. wrong size, changed subject">
          </div>
          <div id="invRetRefundFields"></div>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="btn btn-primary btn-sm" onclick="submitInventoryReturn()">Confirm Return</button>
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('invReturnModalWrap').innerHTML=''">Cancel</button>
          </div>
        </div>
      </div>
    `;
    onInvReturnQtyChange();
  }
  function onInvReturnQtyChange(){
    const saleId = document.getElementById('invRetSaleId').value;
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const returnable = s.qty - returnedQtyForSale(saleId);
    let qty = Number(document.getElementById('invRetQty').value) || 0;
    qty = Math.max(1, Math.min(qty, returnable));
    document.getElementById('invRetQty').value = qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const paidForReturn = Math.round(perUnitPaid * qty * 100) / 100;
    const refundBox = document.getElementById('invRetRefundFields');
    if(paidForReturn > 0){
      refundBox.innerHTML = `
        <div class="f-field" style="margin-bottom:10px;">
          <label>Amount To Refund Now (already paid: ${fmtMoney(paidForReturn)})</label>
          <input type="number" id="invRetCashRefund" min="0" max="${paidForReturn}" step="0.01" value="${paidForReturn}">
        </div>
        <div class="f-field">
          <label>Refund Mode</label>
          <select id="invRetMode"><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Adjusted as Credit (not paid out now)</option></select>
        </div>
      `;
    } else {
      refundBox.innerHTML = `<p style="font-size:0.78rem; color:var(--ink-soft);">Nothing was collected for this quantity yet, so nothing needs to be refunded — the amount due will simply be reduced.</p>`;
    }
  }
  function submitInventoryReturn(){ return rcGuard(() => submitInventoryReturnImpl()); }
  async function submitInventoryReturnImpl(){
    // A cash refund on a return can push a new `payments` row too.
    await ensureDataLoaded('payments', loadPaymentsData);
    const saleId = document.getElementById('invRetSaleId').value;
    const s = inventorySales.find(x => x.id === saleId);
    if(!s) return;
    const returnable = s.qty - returnedQtyForSale(saleId);
    const qty = Math.max(1, Math.min(Number(document.getElementById('invRetQty').value) || 0, returnable));
    if(qty <= 0){ showToast('Enter a valid quantity.'); return; }
    const reason = document.getElementById('invRetReason').value.trim();
    const perUnitAmount = s.totalAmount / s.qty;
    const perUnitCost = s.totalCost / s.qty;
    const perUnitPaid = (s.paidAmount||0) / s.qty;
    const refundAmount = Math.round(perUnitAmount * qty * 100) / 100;
    const costReversed = Math.round(perUnitCost * qty * 100) / 100;
    const paidForReturn = Math.round(perUnitPaid * qty * 100) / 100;
    const cashInput = document.getElementById('invRetCashRefund');
    const cashRefunded = cashInput ? Math.max(0, Math.min(Number(cashInput.value)||0, paidForReturn)) : 0;
    const refundMode = document.getElementById('invRetMode') ? document.getElementById('invRetMode').value : '';
    const todayStr = new Date().toISOString().slice(0,10);
    const retDateInput = document.getElementById('invRetDate');
    const today = retDateInput ? retDateInput.value : todayStr;
    if(!today){ showToast('Set a return date.'); return; }
    if(today > todayStr){ showToast("Return date can't be in the future."); return; }

    // Issue the refund receipt number only now, after every check above passed.
    if(cashRefunded > 0 && s.buyerType === 'Student' && s.sefId) await rcEnsure(1);

    // 1. Restock — the returned units are assumed resellable.
    const item = inventoryItems.find(x => x.id === s.itemId);
    if(item) item.quantity += qty;

    // 2. If this sale was billed to a student, shrink what they owe (and, if
    // they'd paid more than the new reduced amount, cap what's on record as
    // paid so the fee ledger never shows a due for something they returned).
    if(s.buyerType === 'Student' && s.sefId){
      const sef = studentExtraFees.find(x => x.id === s.sefId);
      if(sef){
        sef.amount = Math.max(0, Math.round((sef.amount - refundAmount) * 100) / 100);
        sef.paidAmount = Math.max(0, Math.round((sef.paidAmount - cashRefunded) * 100) / 100);
        sef.paid = sef.paidAmount >= sef.amount && sef.amount > 0 ? true : (sef.amount === 0);
      }
      if(cashRefunded > 0){
        const st = students.find(x => x.id === s.studentId);
        window.__retPayBefore = payments.length;
        payments.push({
          id:'pay_refund_'+Date.now()+'_'+s.itemId, receiptNo:nextReceiptNo(), studentId:s.studentId,
          studentName: st ? st.lastName+' '+st.firstName : '', category:'extra', extraFeeName:s.itemName,
          extraFeeId:s.sefId, mode:refundMode||'Cash', amount:-cashRefunded, discount:0, instalment:'',
          date:today, note:`Refund — return of ${qty} × ${s.itemName}${reason?' ('+reason+')':''}`,
          classAtPayment: st ? st.className : '',
        });
      }
    }

    inventoryReturns.push({
      id:'iret_'+Date.now()+'_'+s.itemId, saleId:s.id, itemId:s.itemId, itemName:s.itemName, qty,
      refundAmount, costReversed, cashRefunded, refundMode, studentId:s.studentId||'', buyerType:s.buyerType,
      buyerName:s.buyerName||'', reason, date:today, processedBy:currentUser.name,
    });

    if(s.buyerType === 'Student' && cashRefunded > 0 && window.__retPayBefore != null){
      const _rb = window.__retPayBefore; window.__retPayBefore = null;
      if(!(await saveReceiptsSafely(payments.slice(_rb), 'The refund receipt'))) return;
    }
    let _retOk = await saveKeySafely(INVENTORY_ITEMS_KEY, inventoryItems, 'The stock quantities');
    _retOk = _retOk && await saveKeySafely(INVENTORY_RETURNS_KEY, inventoryReturns, 'The return record');
    if(_retOk && s.buyerType === 'Student') _retOk = await saveKeySafely(STUDENT_EXTRA_FEES_KEY, studentExtraFees, 'The extra-fee entry');
    if(!_retOk){ warnPartialAndReload('The return was only partly saved. Reloading the latest data — please check Inventory before repeating it.'); return; }
    document.getElementById('invReturnModalWrap').innerHTML = '';
    renderDashboard();
    renderInventoryBody();
    showToast(`Return recorded — ${qty} unit${qty===1?'':'s'} back in stock.`);
  }

  /* --- Stock Overview --- */
  function renderInventoryStockOverviewTab(body){
    const total = inventoryItems.length;
    const outOfStock = inventoryItems.filter(it => it.quantity <= 0);
    const lowStock = inventoryItems.filter(it => it.quantity > 0 && it.quantity <= it.threshold);
    const totalStockValue = inventoryItems.reduce((sum,it) => sum+it.quantity*it.costPrice, 0);
    const totalVendorReturnValue = inventoryVendorReturns.reduce((sum,r) => sum+r.costReversed, 0);

    const { totalRevenue, totalCost, totalProfit, totalCollected, totalDue } = inventoryNetTotals();
    const totalRefunded = inventoryReturns.reduce((sum,r) => sum+r.refundAmount, 0);
    const collectionPct = totalRevenue > 0 ? Math.round((totalCollected/totalRevenue)*100) : 0;
    const totalUnitsSold = inventorySales.reduce((sum,s) => sum+s.qty, 0) - inventoryReturns.reduce((sum,r) => sum+r.qty, 0);
    const totalTransactions = inventorySales.length;
    const avgSaleValue = totalTransactions > 0 ? totalRevenue/totalTransactions : 0;

    const byItem = {};
    inventorySales.forEach(s => {
      if(!byItem[s.itemId]) byItem[s.itemId] = { name:s.itemName, qty:0, revenue:0, cost:0 };
      byItem[s.itemId].qty += s.qty;
      byItem[s.itemId].revenue += s.totalAmount;
      byItem[s.itemId].cost += s.totalCost;
    });
    inventoryReturns.forEach(r => {
      if(!byItem[r.itemId]) byItem[r.itemId] = { name:r.itemName, qty:0, revenue:0, cost:0 };
      byItem[r.itemId].qty -= r.qty;
      byItem[r.itemId].revenue -= r.refundAmount;
      byItem[r.itemId].cost -= r.costReversed;
    });
    const topItems = Object.values(byItem).sort((a,b) => b.revenue-a.revenue).slice(0,5);

    const byMode = {};
    inventorySales.forEach(s => {
      const m = s.mode || 'Not specified';
      byMode[m] = (byMode[m]||0) + (s.paidAmount||0);
    });
    inventoryReturns.forEach(r => {
      const m = r.refundMode || 'Not specified';
      byMode[m] = (byMode[m]||0) - (r.cashRefunded||0);
    });
    const modeEntries = Object.entries(byMode).sort((a,b) => b[1]-a[1]);

    body.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('items')">← Back to Items</button>
        ${getInventoryTabAccess(currentUser.role,'inventory_saleshistory') ? `<button class="btn btn-ghost btn-sm" onclick="switchInventoryTab('saleshistory')">View Full Sales History →</button>` : ''}
      </div>

      <div class="dash-section-title"><div><span class="eyebrow-sm">Sales Performance</span><h3>Revenue, Collections &amp; Profit (net of returns)</h3></div></div>
      <div class="fee-summary-row" style="margin-bottom:20px;">
        <div class="fee-sum-card"><b>${fmtMoney(totalRevenue)}</b><span>Sale Done (Net Revenue)</span></div>
        <div class="fee-sum-card"><b style="color:#0f6a63;">${fmtMoney(totalCollected)}</b><span>Amount Collected</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${fmtMoney(totalDue)}</b><span>Amount To Be Collected</span></div>
        <div class="fee-sum-card"><b style="color:${totalProfit>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(totalProfit)}</b><span>Total Profit</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${fmtMoney(totalRefunded)}</b><span>Returned to Buyers</span></div>
      </div>

      <div class="overview-panel" style="margin-bottom:24px;">
        <div class="overview-ring">
          ${ringSVG(collectionPct, 'var(--teal)', 132, 13)}
          <div class="overview-ring-label"><b>${collectionPct}%</b><span>Collected</span></div>
        </div>
        <div class="overview-legend">
          <div class="ov-row"><span class="ov-swatch" style="background:var(--teal);"></span>Collected<b>${fmtMoney(totalCollected)}</b></div>
          <div class="ov-row"><span class="ov-swatch" style="background:var(--magenta);"></span>To Be Collected<b>${fmtMoney(totalDue)}</b></div>
          <div class="ov-row total"><span class="ov-swatch" style="background:var(--gold);"></span>Total Sale<b>${fmtMoney(totalRevenue)}</b></div>
        </div>
      </div>

      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${totalTransactions}</b><span>Sales Done (Transactions)</span></div>
        <div class="fee-sum-card"><b>${totalUnitsSold}</b><span>Units Sold</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(avgSaleValue)}</b><span>Average Sale Value</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalCost)}</b><span>Cost of Goods Sold</span></div>
      </div>

      <div class="dash-section-title"><div><span class="eyebrow-sm">Stock Levels</span><h3>Inventory On Hand</h3></div></div>
      <div class="fee-summary-row" style="margin-bottom:24px;">
        <div class="fee-sum-card"><b>${total}</b><span>Total Products</span></div>
        <div class="fee-sum-card"><b style="color:var(--magenta);">${outOfStock.length}</b><span>Out of Stock</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${lowStock.length}</b><span>Low Stock</span></div>
        <div class="fee-sum-card"><b>${fmtMoney(totalStockValue)}</b><span>Stock Value (at cost)</span></div>
        <div class="fee-sum-card"><b style="color:#8a6a1f;">${fmtMoney(totalVendorReturnValue)}</b><span>Returned to Vendor (Stock Write-down)</span></div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px,1fr)); gap:16px; margin-bottom:24px;">
        <div class="profile-card">
          <h4>Top Selling Items</h4>
          <div class="table-wrap" style="margin-top:10px;">
            <table><thead><tr><th>Item</th><th>Units Sold</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>${topItems.length ? topItems.map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.qty}</td><td>${fmtMoney(it.revenue)}</td><td style="color:${(it.revenue-it.cost)>=0?'#0f6a63':'var(--magenta)'};">${fmtMoney(it.revenue-it.cost)}</td></tr>`).join('') : '<tr><td colspan="4" style="color:var(--ink-soft);">No sales yet</td></tr>'}</tbody></table>
          </div>
        </div>
        <div class="profile-card">
          <h4>Collections by Payment Mode</h4>
          <div class="table-wrap" style="margin-top:10px;">
            <table><thead><tr><th>Mode</th><th>Amount Collected</th></tr></thead>
            <tbody>${modeEntries.length ? modeEntries.map(([mode,amt]) => `<tr><td>${mode}</td><td>${fmtMoney(amt)}</td></tr>`).join('') : '<tr><td colspan="2" style="color:var(--ink-soft);">No collections yet</td></tr>'}</tbody></table>
          </div>
        </div>
      </div>

      <div class="dash-section-title"><div><h3>Vendor Returns Log</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;">
        <table><thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Stock Value Reversed</th><th>Vendor</th><th>Reason</th><th>Processed By</th></tr></thead>
        <tbody>
        ${inventoryVendorReturns.length ? inventoryVendorReturns.slice().sort((a,b) => b.id.localeCompare(a.id)).slice(0,30).map(r => `<tr><td>${r.date}</td><td class="name-cell">${r.itemName}</td><td>${r.qty}</td><td>${fmtMoney(r.costReversed)}</td><td>${r.vendor||'—'}</td><td>${r.reason||'—'}</td><td>${r.processedBy||'—'}</td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No vendor returns recorded</b></div></td></tr>`}
        </tbody></table>
      </div>

      <div class="dash-section-title"><div><h3>Needs Attention</h3></div></div>
      <div class="table-wrap">
        <table><thead><tr><th>Item</th><th>Quantity</th><th>Threshold</th><th>Status</th></tr></thead>
        <tbody>
        ${[...outOfStock,...lowStock].length ? [...outOfStock,...lowStock].map(it => `<tr><td class="name-cell">${it.name}</td><td>${it.quantity}</td><td>${it.threshold}</td><td>${it.quantity<=0?`<span class="balance-tag due">Out of Stock</span>`:`<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">Low Stock</span>`}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state"><b>All stocked up</b>No items are low or out of stock.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  /* --- Admin Tools (strictly Admin-only) --- */
  const DOWNLOADS_KEY = "admin-downloads";
  OBJECT_BACKED_KEYS[DOWNLOADS_KEY] = '/api/kv/' + DOWNLOADS_KEY;
  let adminDownloads = [];
  async function loadAdminDownloads(){
    adminDownloads = await storageGet(DOWNLOADS_KEY, []);
  }
  function renderAdminToolsTab(body){
    setTimeout(refreshBackupStatusLine, 0);
    setTimeout(loadServerProblems, 0);
    setTimeout(loadOnlinePayments, 0);
    setTimeout(loadFeeReminderSettings, 0);
    setTimeout(loadTwofaOverview, 0);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:20px; max-width:640px;">Tools visible to the Admin role only — not Principal, not any other role, regardless of what's granted in Roles &amp; Permissions.</p>

      <div class="profile-card" style="max-width:420px; margin-bottom:24px;">
        <h4>🔑 Change Password</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Update your own Admin login password.</p>
        <div class="f-field" style="margin-bottom:10px;"><label>Current Password</label><input type="password" id="cpCurrent"></div>
        <div class="f-field" style="margin-bottom:10px;"><label>New Password</label><input type="password" id="cpNew"></div>
        <div class="f-field" style="margin-bottom:14px;"><label>Confirm New Password</label><input type="password" id="cpConfirm"></div>
        <button class="btn btn-primary btn-sm" onclick="changeOwnPassword()">Update Password</button>
      </div>

      <div class="profile-card" style="max-width:480px; margin-bottom:24px;">
        <h4>💾 Full Data Backup</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Download every record in the database — students, staff, payments, attendance, everything — as one JSON file. Keep it somewhere safe; it's a full copy of the school's data (only the Admin can download it).</p>
        <div id="backupStatusLine" style="font-size:0.8rem; margin:0 0 12px; padding:8px 10px; border-radius:10px; background:var(--surface-2, #f4f4f8);">Checking last backup…</div>
        <button class="btn btn-primary btn-sm" id="backupDownloadBtn" onclick="downloadFullBackup()">Download Backup</button>
        <button class="btn btn-sm" type="button" id="backupCheckBtn" onclick="showBackupSummary()" style="margin-left:6px;">Check what is in my database</button><span class="mo-blob-mini" id="backupBlob"><span class="mo-blob-shape"></span></span>
        <div id="backupResult" style="margin-top:12px; font-size:0.8rem;"></div>
      </div>

      <div class="profile-card" style="max-width:640px; margin-bottom:24px;">
        <h4>⚠️ Server problems</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">When something fails on the server, it is listed here and you get an alert on your bell and phone (at most one alert per problem every 30 minutes). If a problem keeps repeating, send a screenshot of this list to support.</p>
        <button class="btn btn-sm" type="button" onclick="loadServerProblems()">Refresh</button>
        <button class="btn btn-sm" type="button" onclick="clearServerProblems()" style="margin-left:6px;">Clear list</button>
        <div id="serverProblems" style="margin-top:12px; font-size:0.8rem;">Loading…</div>
      </div>

      <div class="profile-card" style="max-width:720px; margin-bottom:24px;">
        <h4>🔔 Fee reminders</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Parents get an app alert (and WhatsApp, if your school has it) when a fee installment is coming due or has become overdue — following your Fee Schedule (Yearly / Terms / Monthly). One message per student per day, sent once per installment.</p>
        <div id="feeRemBox" style="font-size:0.82rem;">Loading…</div>
      </div>

      <div class="profile-card" style="max-width:720px; margin-bottom:24px;">
        <h4>🛡️ Two-step sign-in</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Admin and Principal accounts can add a second check at sign-in (an authenticator-app code, or a code by email). Each person turns their own on or off in <b>My Account</b>. If someone loses their phone and recovery codes, press <b>Reset</b> — they can then sign in with just their password and set it up again.</p>
        <div id="twofaOverviewBox" style="font-size:0.82rem;">Loading…</div>
      </div>

      <div class="profile-card" style="max-width:720px; margin-bottom:24px;">
        <h4>💳 Online payments</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">Fees paid by parents through Razorpay. A payment that was made but not yet recorded (for example the parent closed the page) is found automatically every few minutes — or press <b>Check now</b>.</p>
        <div id="onlinePayHealth" style="margin:0 0 12px; font-size:0.8rem;">Loading status…</div>
        <button class="btn btn-sm" type="button" onclick="loadOnlinePayments()">Refresh</button>
        <button class="btn btn-sm" type="button" onclick="checkOnlinePaymentsNow()" style="margin-left:6px;">Check now</button>
        <div id="onlinePaymentsBox" style="margin-top:12px; font-size:0.8rem;">Loading…</div>
      </div>

      <div class="profile-card" style="max-width:560px; margin-bottom:24px; border-top:4px solid #C0264B;">
        <h4>🗑️ Reset Inventory / Accounting Data</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 12px;">For clearing out demo/test records before switching to real day-to-day data entry. This permanently deletes the selected records from the database for everyone — there is no undo. <b>Download a backup above first</b> if there's any chance you'll want this data later.</p>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px; font-size:0.82rem;">
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvItems" checked> Inventory stock items <span style="color:var(--ink-soft);">(${inventoryItems.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvSales" checked> Inventory sales history <span style="color:var(--ink-soft);">(${inventorySales.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridInvReturns" checked> Inventory returns &amp; vendor returns <span style="color:var(--ink-soft);">(${inventoryReturns.length + inventoryVendorReturns.length})</span></label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="ridAcct" checked> Accounting income &amp; expense entries <span style="color:var(--ink-soft);">(${acctExpenses.length + acctIncome.length})</span></label>
        </div>
        <p style="font-size:0.72rem; color:var(--ink-soft); margin:0 0 10px;">Income/Expense categories and cost centers (the pick-lists) are kept, so you can start entering real transactions right away.</p>
        <div class="f-field" style="margin-bottom:12px; max-width:260px;">
          <label>Type RESET to confirm</label>
          <input type="text" id="ridConfirmText" placeholder="RESET" oninput="document.getElementById('ridResetBtn').disabled = this.value.trim().toUpperCase() !== 'RESET';">
        </div>
        <button class="btn btn-danger btn-sm" id="ridResetBtn" disabled onclick="resetInventoryAccountingData()">Reset Selected Data</button>
      </div>

      <div class="profile-card" style="max-width:640px;">
        <h4>📥 Downloads</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Upload circulars, forms, or resources for staff to download from their own accounts.</p>
        <div class="form-grid" style="margin-bottom:12px;">
          <div class="f-field full"><label>Title</label><input type="text" id="dlTitle" placeholder="e.g. Holiday Circular — August"></div>
          <div class="f-field full">
            <label>File</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Choose File<input type="file" id="dlFileInput" style="display:none;" onchange="previewDownloadFile(event)"></label>
              <span id="dlFileName" style="font-size:0.8rem; color:var(--ink-soft);">No file chosen</span>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-bottom:18px;" onclick="addAdminDownload()">+ Add Download</button>
        <div class="table-wrap">
          <table><thead><tr><th>Title</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
          ${adminDownloads.length ? adminDownloads.map((d,i) => `<tr><td class="name-cell">${d.title}</td><td>${d.date}</td><td><a href="${d.data}" download="${d.filename||d.title}" class="btn-edit-text">Download</a>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteAdminDownload(${i})">Delete</button></td></tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No downloads uploaded yet</b></div></td></tr>`}
          </tbody></table>
        </div>
      </div>

      <div class="profile-card" style="max-width:1000px; margin-top:24px;">
        <h4>🕵️ Audit trail</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:6px 0 14px;">Who did what, and when: every save and delete, settings and fee-discount changes, sign-ins (including failed tries), password changes and backups. Names come from the signed-in account, not from the browser.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-bottom:12px;">
          <label style="font-size:0.74rem;">Show<br><select class="input" id="auditKind" style="min-width:150px;"><option value="">Everything</option><option value="signins">Sign-ins</option><option value="security">Security</option><option value="create">Added</option><option value="change">Changed</option><option value="delete">Deleted / restored</option></select></label>
          <label style="font-size:0.74rem;">From<br><input type="date" class="input" id="auditFrom"></label>
          <label style="font-size:0.74rem;">To<br><input type="date" class="input" id="auditTo"></label>
          <label style="font-size:0.74rem;">Person<br><input type="text" class="input" id="auditActor" placeholder="name" style="width:130px;"></label>
          <label style="font-size:0.74rem;">Search<br><input type="text" class="input" id="auditQ" placeholder="record, detail…" style="width:170px;"></label>
          <button class="btn btn-primary btn-sm" onclick="loadAuditLogTab(true)">Show</button>
          <button class="btn btn-ghost btn-sm" onclick="resetAuditFilters()">Clear</button>
          <button class="btn btn-ghost btn-sm" onclick="downloadAuditCsv()">⬇ Download (Excel)</button>
        </div>
        <div class="table-wrap" style="max-height:480px; overflow-y:auto;">
          <table><thead><tr><th>When</th><th>Who</th><th>What happened</th><th>Where</th><th>Record</th><th>Details</th></tr></thead>
          <tbody id="auditLogTableBody">${moLoadingRow(6)}</tbody></table>
        </div>
        <div id="auditMoreBox" style="margin-top:10px;"></div>
      </div>
    `;
    moMountLotties();
    loadAuditLogTab();
  }
  let auditBeforeId = null;
  const AUDIT_WORDS = {
    POST:['Added','#0a8f6a'], PUT:['Changed','#b7791f'], DELETE:['Deleted','#C0264B'], RESTORE:['Restored','#0a8f6a'], SETTING:['Saved settings / list','#b7791f'], CORRECTION:['Admin correction of a locked entry','#C0264B'],
    LOGIN:['Signed in','#0a8f6a'], LOGIN_FAILED:['Failed sign-in','#C0264B'], LOGIN_BLOCKED:['Sign-in blocked (too many tries)','#C0264B'], LOGOUT:['Signed out','#6b7280'],
    TWOFA_FAILED:['Wrong two-step code','#C0264B'], PASSWORD_CHANGED:['Changed own password','#b7791f'], PASSWORD_RESET:['Admin reset a password','#C0264B'], PASSWORD_RESET_REQUEST:['Asked office to reset password','#6b7280'], IMPERSONATE_START:['Admin opened a user account','#C0264B'], IMPERSONATE_END:['Admin returned to own account','#6b7280'], BACKUP_DOWNLOAD:['Downloaded full backup','#b7791f'], AUDIT_EXPORT:['Downloaded audit trail','#6b7280'],
  };
  const AUDIT_NOTES = { twofa_enabled_app:'Turned ON two-step sign-in (app)', twofa_enabled_email:'Turned ON two-step sign-in (email)', twofa_disabled:'Turned OFF two-step sign-in', twofa_reset:'Reset someone\'s two-step sign-in', twofa_recovery_code_used:'Signed in with a recovery code', voucher_gap:'Voucher number gap noted' };
  function auditPretty(s){ s = String(s || '').replace(/[-_]+/g, ' ').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }
  function auditQuery(extra){
    const g = id => (document.getElementById(id) || {}).value || '';
    const p = new URLSearchParams();
    [['kind','auditKind'],['from','auditFrom'],['to','auditTo'],['actor','auditActor'],['q','auditQ']].forEach(([k,id]) => { if(g(id)) p.set(k, g(id)); });
    Object.entries(extra || {}).forEach(([k,v]) => p.set(k, v));
    return p.toString();
  }
  function resetAuditFilters(){ ['auditKind','auditFrom','auditTo','auditActor','auditQ'].forEach(id => { const e = document.getElementById(id); if(e) e.value = ''; }); loadAuditLogTab(true); }
  async function downloadAuditCsv(){
    try{
      const res = await fetch('/api/audit-log?' + auditQuery({ format:'csv' })); await throwIfNotOk(res);
      const blob = await res.blob(); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'audit-trail.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }catch(e){ showToast('Could not download: ' + e.message); }
  }
  function auditRowHtml(r){
    const w = r.method === 'NOTE' ? [AUDIT_NOTES[r.resource] || auditPretty(r.resource), '#b7791f'] : (AUDIT_WORDS[r.method] || [auditPretty(r.method), '#6b7280']);
    const where = (r.method === 'NOTE' || r.resource === 'sign-in' || r.resource === 'audit-log') ? '' : (r.resource === 'kv' ? 'Settings & lists' : auditPretty(r.resource));
    const who = r.actor_name ? escapeHtml(r.actor_name) + (r.actor_role ? ' <span style="color:var(--ink-soft); font-size:0.72rem;">(' + escapeHtml(r.actor_role) + ')</span>' : '') : '—';
    const det = [r.detail ? escapeHtml(r.detail) : '', r.ip ? '<span style="color:var(--ink-soft);">IP ' + escapeHtml(r.ip) + '</span>' : ''].filter(Boolean).join(' · ');
    return '<tr><td style="white-space:nowrap;">' + escapeHtml(new Date(r.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })) + '</td><td>' + who + '</td>' +
      '<td><b style="color:' + w[1] + ';">' + escapeHtml(w[0]) + '</b></td><td>' + escapeHtml(where) + '</td><td style="max-width:170px; overflow:hidden; text-overflow:ellipsis;">' + (escapeHtml(r.record_id) || '—') + '</td><td style="font-size:0.74rem;">' + (det || '—') + '</td></tr>';
  }
  async function loadAuditLogTab(reset){
    const tbody = document.getElementById('auditLogTableBody');
    if(!tbody) return;
    const more = document.getElementById('auditMoreBox');
    if(reset !== false){ auditBeforeId = null; tbody.innerHTML = moLoadingRow(6); moMountLotties(); if(more) more.innerHTML = ''; }
    try{
      const res = await fetch('/api/audit-log?' + auditQuery(auditBeforeId ? { before: auditBeforeId } : {}));
      await throwIfNotOk(res);
      const d = await res.json(); const rows = d.rows || [];
      if(auditBeforeId === null) tbody.innerHTML = '';
      if(!rows.length && auditBeforeId === null){ tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><b>Nothing found</b>Try a wider date range or clear the filters.</div></td></tr>`; return; }
      tbody.insertAdjacentHTML('beforeend', rows.map(auditRowHtml).join(''));
      if(rows.length) auditBeforeId = rows[rows.length - 1].id;
      if(more) more.innerHTML = d.hasMore ? '<button class="btn btn-ghost btn-sm" onclick="loadAuditLogTab(false)">Show older entries</button>' : '<span style="font-size:0.76rem; color:var(--ink-soft);">That is everything for this view.</span>';
    }catch(e){
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><b>Could not load the audit trail</b>${escapeHtml(e.message)}</div></td></tr>`;
    }
  }
  // "Last backup" line + overdue warning (green ≤ 7 days, amber ≤ 14, red older or never).
  function backupAgeInfo(lb){
    if(!lb || !lb.lastAt) return { days:null, tone:'bad', text:'⚠️ No backup has been downloaded yet. Download one now and keep it safe.' };
    const days = Math.floor((Date.now() - new Date(lb.lastAt).getTime()) / 86400000);
    const when = new Date(lb.lastAt).toLocaleString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const tone = days <= 7 ? 'good' : days <= 14 ? 'warn' : 'bad';
    const icon = tone === 'good' ? '✅' : tone === 'warn' ? '🟠' : '🔴';
    const age = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
    return { days, tone, text: icon + ' Last backup: <b>' + when + '</b> (' + age + ') — ' + Number(lb.tables||0) + ' tables, ' + Number(lb.rows||0).toLocaleString('en-IN') + ' records' + (lb.by ? ' · by ' + escapeHtml(lb.by) : '') + (tone === 'good' ? '' : '. <b>Download a fresh one.</b>') };
  }
  async function refreshBackupStatusLine(){
    const el = document.getElementById('backupStatusLine'); if(!el) return;
    try{
      const res = await fetch('/api/backup/status'); await throwIfNotOk(res);
      const info = backupAgeInfo((await res.json()).lastBackup);
      el.innerHTML = info.text;
      el.style.background = info.tone === 'good' ? 'rgba(0,150,120,.10)' : info.tone === 'warn' ? 'rgba(230,160,0,.14)' : 'rgba(192,38,75,.10)';
    }catch(e){ el.textContent = 'Could not check the last backup.'; }
  }
  async function loadFeeReminderSettings(){
    const el = document.getElementById('feeRemBox'); if(!el) return;
    try{
      const res = await fetch('/api/fee-reminders/settings'); await throwIfNotOk(res);
      const d = await res.json(), s = d.settings;
      el.innerHTML = `
        <label style="display:flex; gap:8px; align-items:center; margin-bottom:10px;"><input type="checkbox" id="frEnabled" ${s.enabled ? 'checked' : ''}> <b>Send fee reminders automatically</b></label>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-bottom:10px;">
          <label>"Due soon" alert, days before the due date<input class="input" type="number" min="1" max="30" id="frLead" value="${s.leadDays}" style="width:100%;"></label>
          <label>"Still overdue" repeat every (days)<input class="input" type="number" min="3" max="60" id="frEvery" value="${s.repeatEveryDays}" style="width:100%;"></label>
          <label>…and at most this many times (0 = no repeats)<input class="input" type="number" min="0" max="12" id="frMax" value="${s.repeatMax}" style="width:100%;"></label>
          <label>Send from this hour of the day (0–23)<input class="input" type="number" min="0" max="23" id="frHour" value="${s.sendHour}" style="width:100%;"></label>
        </div>
        <p style="font-size:0.74rem; color:var(--ink-soft); margin:0 0 10px;">Alerts go to ${d.push ? 'app/phone notifications' : '<b>(phone notifications are not set up on this server)</b>'}${d.whatsapp ? ' and WhatsApp' : ''}. The first notice for an overdue installment is only sent if it fell due in the last 14 days, so turning this on never floods parents about old dues.</p>
        <button class="btn btn-primary btn-sm" type="button" onclick="saveFeeReminderSettings()">Save</button>
        <button class="btn btn-sm" type="button" onclick="previewFeeReminders()" style="margin-left:6px;">Who would be reminded today?</button>
        <div id="feeRemPreview" style="margin-top:12px;"></div>`;
    }catch(e){ el.textContent = 'Could not load (' + e.message + ').'; }
  }