/* ============================================================================
   Inventory – Stock Orders and "Add Stock" (buying stock, even when the supplier
   sends it in parts).

   Why: before this, new stock was added by typing a new total into the product
   (no record of what was bought, at what cost, from whom) or by adding the same
   product again (a duplicate row). Now:
     • "Place order"  – you order N pieces from a supplier (nothing changes in stock yet).
     • "Receive"      – each delivery adds only what really arrived. The order shows
                        Ordered / Received / Pending until it is complete, or you close it short.
     • "Add Stock"    – on a product: receive against an open order, or stock bought with no order.
   Every receipt keeps date, quantity, cost, bill number and who entered it, raises the
   product's stock, keeps the average cost right, and can also book the payment as an
   expense voucher in Accounts. Sales, receipts and old accounts are never touched.
   Admin only (stock quantity is an Admin-controlled number everywhere in the ERP).
   ========================================================================== */

function ivpToday(){ return new Date().toISOString().slice(0, 10); }
function ivpReceived(o){ return (o.receipts || []).reduce((s, r) => s + (Number(r.qty) || 0), 0); }
function ivpPending(o){ return (o.cancelled || o.closedShort) ? 0 : Math.max(0, (Number(o.qtyOrdered) || 0) - ivpReceived(o)); }
function ivpStatus(o){
  if(o.cancelled) return 'Cancelled';
  const got = ivpReceived(o), want = Number(o.qtyOrdered) || 0;
  if(got >= want) return 'Complete';
  if(o.closedShort) return 'Closed short';
  return got > 0 ? 'Partly received' : 'Waiting';
}
function ivpIsOpen(o){ const s = ivpStatus(o); return s === 'Waiting' || s === 'Partly received'; }
function ivpOnOrder(itemId){
  return (typeof inventoryPurchases === 'undefined' ? [] : inventoryPurchases)
    .filter(o => o.itemId === itemId && ivpIsOpen(o)).reduce((s, o) => s + ivpPending(o), 0);
}
function ivpOpenCount(){ return (typeof inventoryPurchases === 'undefined' ? [] : inventoryPurchases).filter(ivpIsOpen).length; }
// Small "· 20 on order" note shown beside a product's stock.
function ivOnOrderTag(it){
  const n = ivpOnOrder(it.id);
  return n > 0 ? `<small class="ivp-onorder" title="Ordered from the supplier, not yet received"> · ${n} on order</small>` : '';
}
function ivpItemLabel(it){ return it.name + (it.size ? ' (' + it.size + ')' : ''); }
function ivpIsAdmin(){ return currentUser && currentUser.role === 'Admin'; }
function ivpNeedAdmin(){ if(!ivpIsAdmin()){ showToast('Only the Admin can order or receive stock.'); return true; } return false; }

/* ---------- Stock Orders tab ---------- */
let ivpFilter = 'open';
function setIvpFilter(f){ ivpFilter = f; renderInventoryStockOrdersTab(document.getElementById('inventoryBody')); }

function renderInventoryStockOrdersTab(body){
  const all = inventoryPurchases.slice().sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')) || String(b.id).localeCompare(String(a.id)));
  const open = all.filter(ivpIsOpen);
  const rows = ivpFilter === 'open' ? open : all;
  const pendingUnits = open.reduce((s, o) => s + ivpPending(o), 0);
  const waitingItems = new Set(open.map(o => o.itemId)).size;
  const admin = ivpIsAdmin();
  const statusBadge = o => {
    const s = ivpStatus(o);
    const kind = s === 'Complete' ? 'paid' : s === 'Partly received' ? 'due' : s === 'Waiting' ? 'upcoming' : 'overdue';
    return `<span class="sf-badge sf-badge--${kind}">${s}</span>`;
  };
  body.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Open orders', open.length, open.length ? 'warn' : 'good', 'still to arrive')}
      ${sfKpi('Pieces pending', pendingUnits, pendingUnits ? 'warn' : 'good', 'ordered, not received')}
      ${sfKpi('Products waiting', waitingItems, 'plain')}
    </section>
    <div class="iv-toolbar">
      <button type="button" class="sf-btn sf-btn--soft" onclick="switchInventoryTab('items')">← Products</button>
      <div class="sf-segments" role="group" aria-label="Show">
        <button type="button" class="${ivpFilter === 'open' ? 'active' : ''}" onclick="setIvpFilter('open')">Open (${open.length})</button>
        <button type="button" class="${ivpFilter === 'all' ? 'active' : ''}" onclick="setIvpFilter('all')">All orders (${all.length})</button>
      </div>
      <div class="iv-toolbar-actions">
        ${admin ? sfBtn('primary', 'plus', 'Place order', `openStockOrderModal('')`) : ''}
      </div>
    </div>
    <p class="muted" style="margin:6px 2px 12px; font-size:0.82rem;">Suppliers often send a book or uniform in parts. Place the order once, then press <b>Receive</b> each time a delivery arrives. Stock goes up only by what really came; the rest stays <b>Pending</b>.</p>
    <div class="sf-card"><div class="table-wrap" style="overflow-x:auto;">
      <table class="iv-table">
        <thead><tr><th>Ordered on</th><th>Product</th><th>Supplier</th><th>Ordered</th><th>Received</th><th>Pending</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows.map(o => {
          const recs = o.receipts || [];
          return `<tr>
            <td>${escapeHtml(o.orderDate || '')}</td>
            <td><b>${escapeHtml(o.itemName || '')}</b>${o.note ? `<small>${escapeHtml(o.note)}</small>` : ''}</td>
            <td>${escapeHtml(o.vendor || '—')}</td>
            <td>${o.qtyOrdered}</td><td>${ivpReceived(o)}</td><td><b>${ivpPending(o)}</b></td>
            <td>${statusBadge(o)}</td>
            <td class="ivq-act"><div class="ivq-actions">
              ${admin && ivpIsOpen(o) ? sfBtn('primary', '', 'Receive', `openReceiveStockModal('${o.id}', '${o.itemId}')`) : ''}
              ${admin && ivpIsOpen(o) && ivpReceived(o) > 0 ? sfBtn('link', '', 'Close short', `closeStockOrderShort('${o.id}')`) : ''}
              ${admin && o.closedShort && !o.cancelled && ivpReceived(o) < o.qtyOrdered ? sfBtn('link', '', 'Reopen', `reopenStockOrder('${o.id}')`) : ''}
              ${admin && ivpIsOpen(o) && !recs.length ? sfBtn('link', '', 'Cancel order', `cancelStockOrder('${o.id}')`) : ''}
            </div></td>
          </tr>${recs.length ? `<tr><td></td><td colspan="7"><details><summary style="cursor:pointer; font-size:0.8rem;">Deliveries (${recs.length})</summary>
            <ul style="margin:6px 0 4px 18px; font-size:0.8rem;">${recs.map(r => `<li>${escapeHtml(r.date)} — <b>${r.qty}</b> received at ${fmtMoney(r.unitCost)} each${r.billNo ? ' · bill ' + escapeHtml(r.billNo) : ''}${r.voucherNo ? ' · voucher ' + escapeHtml(r.voucherNo) : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''} <small>(by ${escapeHtml(r.by || '')})</small></li>`).join('')}</ul></details></td></tr>` : ''}`;
        }).join('')}</tbody>
      </table>
      ${rows.length ? '' : `<div class="empty-state"><b>${ivpFilter === 'open' ? 'No open orders' : 'No orders yet'}</b>${admin ? 'Press "Place order" when you order stock, or "Add Stock" on a product when it arrives.' : ''}</div>`}
    </div></div>`;
}

/* ---------- small modal helpers ---------- */
function ivpCloseModal(){ const m = document.getElementById('ivpModal'); if(m) m.remove(); }
function ivpOpenModal(html){
  ivpCloseModal();
  const wrap = document.createElement('div');
  wrap.id = 'ivpModal';
  wrap.innerHTML = `<div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px; overflow:auto;">
    <div class="profile-card" style="width:100%; max-width:460px; max-height:94vh; overflow:auto;">${html}</div></div>`;
  document.body.appendChild(wrap);
}
const IVP_MODES = ['Cash', 'UPI', 'Card', 'Online', 'Bank Transfer'];

/* ---------- Place an order ---------- */
function openStockOrderModal(itemId){
  if(ivpNeedAdmin()) return;
  const items = inventoryItems.filter(it => it.active !== false).sort((a, b) => ivpItemLabel(a).localeCompare(ivpItemLabel(b)));
  if(!items.length){ showToast('Add the product first (Add Product), then order stock for it.'); return; }
  const sel = items.find(i => i.id === itemId) || items[0];
  ivpOpenModal(`
    <h4>Place stock order</h4>
    <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">This only records what you ordered. Stock does not change until you press Receive.</p>
    <div class="f-field" style="margin-bottom:10px;"><label>Product</label>
      <select id="ivoItem" onchange="ivoPickItem()">${items.map(i => `<option value="${i.id}" ${i.id === sel.id ? 'selected' : ''}>${escapeHtml(ivpItemLabel(i))} — ${i.quantity} in stock</option>`).join('')}</select></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Quantity ordered</label><input type="number" id="ivoQty" min="1" step="1" placeholder="e.g. 100"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Supplier</label><input type="text" id="ivoVendor" placeholder="Name of the supplier / publisher"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Expected price per piece (₹)</label><input type="number" id="ivoCost" min="0" step="0.01" value="${sel.costPrice || ''}"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Order date</label><input type="date" id="ivoDate" value="${ivpToday()}" max="${ivpToday()}"></div>
    <div class="f-field" style="margin-bottom:14px;"><label>Note (optional)</label><input type="text" id="ivoNote" placeholder="e.g. Class 5 books, expected in 2 weeks"></div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary btn-sm" onclick="submitStockOrder()">Save order</button>
      <button class="btn btn-ghost btn-sm" onclick="ivpCloseModal()">Cancel</button>
    </div>`);
}
function ivoPickItem(){
  const it = inventoryItems.find(x => x.id === document.getElementById('ivoItem').value);
  if(it) document.getElementById('ivoCost').value = it.costPrice || '';
}
async function submitStockOrder(){
  if(ivpNeedAdmin()) return;
  const it = inventoryItems.find(x => x.id === document.getElementById('ivoItem').value);
  const qty = Math.floor(Number(document.getElementById('ivoQty').value) || 0);
  const cost = Number(document.getElementById('ivoCost').value) || 0;
  const date = document.getElementById('ivoDate').value;
  if(!it){ showToast('Choose the product.'); return; }
  if(qty <= 0){ showToast('Enter how many pieces you ordered.'); return; }
  if(!date){ showToast('Set the order date.'); return; }
  inventoryPurchases.push({
    id: 'po_' + Date.now(), itemId: it.id, itemName: ivpItemLabel(it), vendor: document.getElementById('ivoVendor').value.trim(),
    orderDate: date, qtyOrdered: qty, unitCost: cost, note: document.getElementById('ivoNote').value.trim(),
    receipts: [], createdBy: currentUser.name,
  });
  if(await storageSet(INVENTORY_PURCHASES_KEY, inventoryPurchases) === false){ inventoryPurchases.pop(); showToast('Could not save the order (connection?). Please try again.'); return; }
  ivpCloseModal();
  inventoryTab = 'stockorders';
  renderInventoryBody();
  showToast(`Order saved: ${qty} × ${ivpItemLabel(it)}.`, 'burst');
}

/* ---------- Receive stock (against an order, or stock with no order) ---------- */
function openReceiveStockModal(orderId, itemId){
  if(ivpNeedAdmin()) return;
  let order = orderId ? inventoryPurchases.find(o => o.id === orderId) : null;
  const it = inventoryItems.find(x => x.id === (order ? order.itemId : itemId));
  if(!it){ showToast('Product not found.'); return; }
  const openOrders = inventoryPurchases.filter(o => o.itemId === it.id && ivpIsOpen(o));
  if(!order && openOrders.length === 1) order = openOrders[0];
  ivpOpenModal(`
    <h4>Add stock — ${escapeHtml(ivpItemLabel(it))}</h4>
    <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 12px;"><b>${it.quantity}</b> in stock now at an average cost of ${fmtMoney(it.costPrice || 0)}.</p>
    <input type="hidden" id="ivrItem" value="${it.id}">
    <div class="f-field" style="margin-bottom:10px;"><label>This delivery is for</label>
      <select id="ivrOrder" onchange="ivrPickOrder()">
        ${openOrders.map(o => `<option value="${o.id}" ${order && o.id === order.id ? 'selected' : ''}>Order of ${escapeHtml(o.orderDate)}${o.vendor ? ' · ' + escapeHtml(o.vendor) : ''} — ${ivpPending(o)} pending of ${o.qtyOrdered}</option>`).join('')}
        <option value="" ${order ? '' : 'selected'}>Stock with no order (bought or received now)</option>
      </select></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Quantity received now</label><input type="number" id="ivrQty" min="1" step="1" oninput="ivrPreview()"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Price per piece (₹) on this delivery</label><input type="number" id="ivrCost" min="0" step="0.01" oninput="ivrPreview()"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Supplier</label><input type="text" id="ivrVendor"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Received on</label><input type="date" id="ivrDate" value="${ivpToday()}" max="${ivpToday()}"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Bill / challan number (optional)</label><input type="text" id="ivrBill"></div>
    <div class="f-field" style="margin-bottom:10px;"><label>Note (optional)</label><input type="text" id="ivrNote" placeholder="e.g. 2nd lot, 40 still to come"></div>
    <div id="ivrPrev" style="background:rgba(24,143,134,0.10); border-left:4px solid var(--teal); border-radius:8px; padding:10px 12px; margin-bottom:12px; font-size:0.78rem;"></div>
    <div style="border:1px solid var(--line, #d9d2c3); border-radius:8px; padding:10px 12px; margin-bottom:14px;">
      <label style="display:flex; gap:8px; align-items:flex-start; font-size:0.82rem;"><input type="checkbox" id="ivrPay" onchange="ivrPreview()">
        <span><b>Also record the payment in Accounts</b><br><small>Creates an expense voucher (category "Stock Purchase", account "Inventory"). Tick it only if you have not already entered this bill as an expense.</small></span></label>
      <div id="ivrPayBox" style="display:none; margin-top:10px;">
        <div class="f-field" style="margin-bottom:8px;"><label>Amount paid (₹)</label><input type="number" id="ivrPaid" min="0" step="0.01"></div>
        <div class="f-field"><label>Paid by</label><select id="ivrMode">${IVP_MODES.map(m => `<option>${m}</option>`).join('')}</select></div>
      </div>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="btn btn-primary btn-sm" onclick="submitReceiveStock()">Add to stock</button>
      <button class="btn btn-ghost btn-sm" onclick="ivpCloseModal()">Cancel</button>
    </div>`);
  ivrPickOrder(true);
}
function ivrOrderSelected(){ const id = (document.getElementById('ivrOrder') || {}).value; return id ? inventoryPurchases.find(o => o.id === id) : null; }
function ivrPickOrder(first){
  const o = ivrOrderSelected(), it = inventoryItems.find(x => x.id === document.getElementById('ivrItem').value);
  document.getElementById('ivrQty').value = o ? ivpPending(o) : '';
  document.getElementById('ivrCost').value = o ? (o.unitCost || (it && it.costPrice) || '') : ((it && it.costPrice) || '');
  document.getElementById('ivrVendor').value = o ? (o.vendor || '') : '';
  ivrPreview();
}
let ivrPaidTouched = false;
function ivrPreview(){
  const it = inventoryItems.find(x => x.id === document.getElementById('ivrItem').value); if(!it) return;
  const qty = Math.floor(Number(document.getElementById('ivrQty').value) || 0);
  const cost = Number(document.getElementById('ivrCost').value) || 0;
  const old = Math.max(Number(it.quantity) || 0, 0), oldCost = Number(it.costPrice) || 0;
  const newQty = (Number(it.quantity) || 0) + qty;
  const avg = qty > 0 && old + qty > 0 ? Math.round(((old * oldCost) + (qty * cost)) / (old + qty) * 100) / 100 : oldCost;
  const o = ivrOrderSelected();
  const left = o ? Math.max(0, ivpPending(o) - qty) : 0;
  document.getElementById('ivrPrev').innerHTML = qty > 0
    ? `Stock will go from <b>${it.quantity}</b> to <b>${newQty}</b>. Average cost: ${fmtMoney(oldCost)} → <b>${fmtMoney(avg)}</b>. Bill value: <b>${fmtMoney(qty * cost)}</b>.${o ? (left > 0 ? ` <b>${left}</b> will still be pending on this order.` : ' This completes the order.') : ''}`
    : 'Enter the quantity that actually arrived.';
  const pay = document.getElementById('ivrPay').checked;
  document.getElementById('ivrPayBox').style.display = pay ? '' : 'none';
  if(pay){ const p = document.getElementById('ivrPaid'); if(!p.dataset.touched) p.value = Math.round(qty * cost * 100) / 100 || ''; p.oninput = () => { p.dataset.touched = '1'; }; }
}
let ivpSaving = false;
async function submitReceiveStock(){
  if(ivpNeedAdmin() || ivpSaving) return;
  const it = inventoryItems.find(x => x.id === document.getElementById('ivrItem').value);
  if(!it) return;
  const qty = Math.floor(Number(document.getElementById('ivrQty').value) || 0);
  const cost = Number(document.getElementById('ivrCost').value) || 0;
  const date = document.getElementById('ivrDate').value;
  const vendor = document.getElementById('ivrVendor').value.trim();
  const billNo = document.getElementById('ivrBill').value.trim();
  const note = document.getElementById('ivrNote').value.trim();
  const pay = document.getElementById('ivrPay').checked;
  const paid = pay ? (Number(document.getElementById('ivrPaid').value) || 0) : 0;
  const mode = document.getElementById('ivrMode').value;
  if(qty <= 0){ showToast('Enter the quantity that arrived.'); return; }
  if(cost <= 0){ showToast('Enter the price per piece.'); return; }
  if(!date){ showToast('Set the received date.'); return; }
  if(date > ivpToday()){ showToast("Received date can't be in the future."); return; }
  if(pay && paid <= 0){ showToast('Enter the amount paid, or untick "record the payment".'); return; }
  let order = ivrOrderSelected();
  if(order && qty > ivpPending(order)){
    if(!await showConfirmDialog(`Only ${ivpPending(order)} were pending on this order but you entered ${qty}. Add all ${qty} anyway?`)) return;
  }
  ivpSaving = true;
  try{
    // 1) accounts first: if the voucher cannot be saved nothing else changes
    let voucherNo = '';
    if(pay){
      await ensureDataLoaded('acctTransactions', loadAcctTransactionsData);
      const CAT = 'Stock Purchase', CC = acctCostCenters.includes('Inventory') ? 'Inventory' : (acctCostCenters[0] || '');
      try{ voucherNo = await issueDocNumber('payment_voucher'); }
      catch(e){ showToast('Could not get a voucher number (' + e.message + ') — nothing saved. Try again.'); return; }
      if(!acctExpenseCategories.includes(CAT)){ acctExpenseCategories.push(CAT); await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories); }
      const expRec = { id: 'exp_' + Date.now(), voucherNo, date, category: CAT, costCenter: CC, amount: paid, party: vendor, mode, referenceNo: billNo,
        bankAccountId: '', description: `Stock purchase — ${qty} × ${ivpItemLabel(it)}${billNo ? ' (bill ' + billNo + ')' : ''}`, addedBy: currentUser.name, voided: false };
      acctExpenses.push(expRec);
      if(!(await acctSaveVoucherSafely(ACCT_EXPENSES_KEY, acctExpenses, expRec))) return;
    }
    // 2) the delivery, the product's stock and its average cost
    const isNew = !order;
    if(isNew){
      order = { id: 'po_' + Date.now(), itemId: it.id, itemName: ivpItemLabel(it), vendor, orderDate: date, qtyOrdered: qty, unitCost: cost, note: 'Stock received without an order', receipts: [], createdBy: currentUser.name };
      inventoryPurchases.push(order);
    }
    if(vendor && !order.vendor) order.vendor = vendor;
    order.receipts.push({ id: 'rc_' + Date.now(), date, qty, unitCost: cost, billNo, note, voucherNo, amountPaid: paid, by: currentUser.name });
    const old = Math.max(Number(it.quantity) || 0, 0), oldCost = Number(it.costPrice) || 0;
    it.costPrice = old + qty > 0 ? Math.round(((old * oldCost) + (qty * cost)) / (old + qty) * 100) / 100 : cost;
    it.quantity = (Number(it.quantity) || 0) + qty;
    const okItems = await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    const okBuy = await storageSet(INVENTORY_PURCHASES_KEY, inventoryPurchases);
    if(okItems === false || okBuy === false){
      showToast('The stock may not have saved (connection?). Reload the page and check the product before trying again.' + (voucherNo ? ' Expense voucher ' + voucherNo + ' was saved.' : ''));
    }else{
      showToast(`${qty} × ${ivpItemLabel(it)} added to stock${voucherNo ? ' · voucher ' + voucherNo : ''}.`, 'burst');
    }
    ivpCloseModal();
    renderInventoryBody();
  } finally { ivpSaving = false; }
}

/* ---------- close short / reopen / cancel ---------- */
async function closeStockOrderShort(id){
  if(ivpNeedAdmin()) return;
  const o = inventoryPurchases.find(x => x.id === id); if(!o) return;
  if(!await showConfirmDialog(`Close this order with ${ivpReceived(o)} of ${o.qtyOrdered} received? The remaining ${ivpPending(o)} will no longer be expected. You can reopen it later.`)) return;
  o.closedShort = true; o.closedBy = currentUser.name; o.closedOn = ivpToday();
  await storageSet(INVENTORY_PURCHASES_KEY, inventoryPurchases);
  renderInventoryBody();
}
async function reopenStockOrder(id){
  if(ivpNeedAdmin()) return;
  const o = inventoryPurchases.find(x => x.id === id); if(!o) return;
  o.closedShort = false; delete o.closedBy; delete o.closedOn;
  await storageSet(INVENTORY_PURCHASES_KEY, inventoryPurchases);
  renderInventoryBody();
}
async function cancelStockOrder(id){
  if(ivpNeedAdmin()) return;
  const o = inventoryPurchases.find(x => x.id === id); if(!o) return;
  if((o.receipts || []).length){ showToast('Some stock was already received on this order — use "Close short" instead.'); return; }
  if(!await showConfirmDialog('Cancel this order? Nothing was received, so stock and accounts are not affected.')) return;
  o.cancelled = true; o.cancelledBy = currentUser.name; o.cancelledOn = ivpToday();
  await storageSet(INVENTORY_PURCHASES_KEY, inventoryPurchases);
  renderInventoryBody();
}

/* ---------- guard used by Add Product / Edit Product ---------- */
// A product with the same name, size and class already exists -> do not make a second row for it.
function ivpFindDuplicate(p, ignoreId){
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return inventoryItems.find(x => x.id !== ignoreId && norm(x.name) === norm(p.name) && norm(x.size) === norm(p.size)
    && norm(x.applicableClass) === norm(p.applicableClass) && (x.type || 'Sellable') === (p.type || 'Sellable'));
}
