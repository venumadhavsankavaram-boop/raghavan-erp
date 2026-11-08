
  async function saveFeeReminderSettings(){
    const v = id => Number((document.getElementById(id) || {}).value);
    try{
      const res = await fetch('/api/fee-reminders/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        enabled: document.getElementById('frEnabled').checked, leadDays: v('frLead'), repeatEveryDays: v('frEvery'), repeatMax: v('frMax'), sendHour: v('frHour') }) });
      await throwIfNotOk(res); showToast('Fee reminder settings saved.'); loadFeeReminderSettings();
    }catch(e){ showToast('Could not save (' + e.message + ').'); }
  }
  async function previewFeeReminders(){
    const out = document.getElementById('feeRemPreview'); if(!out) return;
    out.innerHTML = '<span style="color:var(--ink-soft);">Checking…</span>';
    try{
      const res = await fetch('/api/fee-reminders/preview'); await throwIfNotOk(res);
      const d = await res.json();
      if(!d.total){ out.innerHTML = '<b style="color:var(--teal);">✓ Nobody needs a reminder today.</b>'; return; }
      out.innerHTML = '<div style="margin-bottom:6px;"><b>' + d.total + '</b> parent(s) would be messaged today (not sent now — this is only a preview): ' + d.soon + ' due soon, ' + d.overdue + ' newly overdue, ' + d.repeat + ' repeat.</div>' +
        '<div style="max-height:220px; overflow:auto; border:1px solid var(--border); border-radius:10px; padding:6px 10px;">' + d.sample.map(x => '<div style="padding:3px 0;">' + escapeHtml(x.message) + '</div>').join('') + (d.total > d.sample.length ? '<div style="color:var(--ink-soft);">…and ' + (d.total - d.sample.length) + ' more</div>' : '') + '</div>';
    }catch(e){ out.textContent = 'Could not check (' + e.message + ').'; }
  }
  async function loadTwofaOverview(){
    const el = document.getElementById('twofaOverviewBox'); if(!el) return;
    try{
      const res = await fetch('/api/account/2fa/overview'); await throwIfNotOk(res);
      const d = await res.json();
      const name = { app:'Authenticator app', email:'Code by email' };
      let pol = null; try{ const pr = await fetch('/api/account/2fa/policy'); if(pr.ok) pol = await pr.json(); }catch(e){}
      const polHtml = pol ? '<div style="margin:0 0 12px; padding:10px 12px; border:1px solid var(--line,#e5e7eb); border-radius:10px;"><label style="display:flex; gap:10px; align-items:flex-start; cursor:pointer;"><input type="checkbox" id="twofaRequireChk" ' + (pol.required ? 'checked' : '') + ' onchange="setTwofaRequired(this.checked)" style="width:18px; height:18px; margin-top:2px;"><span><b>Require two-step sign-in for all Admin and Principal accounts</b><br><span style="color:var(--ink-soft);">When this is ON, anyone in those roles who has not set it up is taken to a set-up screen at their next sign-in and cannot use the app until they finish. ' + pol.protectedCount + ' of ' + pol.total + ' accounts are protected now. Turn on your own first.</span></span></label></div>' : '';
      el.innerHTML = polHtml + '<table style="width:100%; font-size:0.8rem;"><tbody>' + (d.users || []).map(u =>
        '<tr><td style="padding:5px 0;"><b>' + escapeHtml(u.name || u.username) + '</b> <span style="color:var(--ink-soft);">(' + escapeHtml(u.role) + ')</span></td>' +
        '<td style="color:' + (u.method ? '#0a8f6a' : '#b7791f') + ';"><b>' + (u.method ? 'ON · ' + name[u.method] : 'OFF') + '</b></td>' +
        '<td style="text-align:right;">' + (u.method ? '<button class="btn btn-sm" type="button" onclick="resetTwofaFor(\'' + escapeHtml(u.id) + '\', \'' + escapeHtml((u.name || u.username || '').replace(/'/g, '')) + '\')">Reset</button>' : '') + '</td></tr>').join('') +
        '</tbody></table>' + (d.emailAvailable ? '' : '<p style="margin:8px 0 0; color:var(--ink-soft);">Code by email is not available yet — the school\'s email sending is not set up. The authenticator app works now.</p>');
    }catch(e){ el.textContent = 'Could not load (' + e.message + ').'; }
  }
  async function setTwofaRequired(on){
    try{
      const r = await fetch('/api/account/2fa/policy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ required: !!on }) });
      const d = await r.json().catch(() => ({}));
      if(!r.ok){ showToast(d.error || 'Could not save.'); }
      else showToast(on ? 'Two-step sign-in is now required for Admin and Principal.' : 'Two-step sign-in is no longer required (people can still keep it on).');
    }catch(e){ showToast('Could not reach the server.'); }
    loadTwofaOverview();
  }
  async function resetTwofaFor(id, name){
    if(!confirm('Turn off two-step sign-in for ' + name + '? They will be able to sign in with just their password until they set it up again.')) return;
    try{
      const r = await fetch('/api/account/2fa/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: id }) });
      const d = await r.json().catch(() => ({}));
      if(!r.ok){ showToast(d.error || 'Could not reset.'); return; }
      showToast('Reset done for ' + name + '.');
      loadTwofaOverview();
    }catch(e){ showToast('Could not reach the server.'); }
  }
  async function loadOnlinePayHealth(testMsg){
    const el = document.getElementById('onlinePayHealth'); if(!el) return;
    try{
      const res = await fetch('/api/payments/health'); await throwIfNotOk(res);
      const d = await res.json();
      const ok = (t) => '<span style="color:#0a8f6a;">✓</span> ' + t, warn = (t) => '<span style="color:#b7791f;">⚠</span> ' + t, bad = (t) => '<span style="color:#C0264B;">✕</span> ' + t;
      const rows = [];
      if(d.demo) rows.push(warn('This is the demo, so online payments are switched off.'));
      else if(!d.keyIdSet || !d.keySecretSet) rows.push(bad('Not set up: the Razorpay Key ID and Key Secret are missing on the server.'));
      else {
        rows.push(ok('Razorpay keys are set (' + escapeHtml(d.keyMasked) + ').'));
        if(d.mode === 'live') rows.push(ok('<b>Live mode</b>: real money is being collected.'));
        else if(d.mode === 'test') rows.push(warn('<b>Test mode</b>: parents can pay, but no real money moves. Switch to live keys before you tell parents to use it.'));
        else rows.push(warn('The Key ID does not look like a standard Razorpay key.'));
        rows.push(d.webhookSecretSet ? ok('Safety-net webhook is on. Razorpay address: <code>' + escapeHtml(d.webhookUrl) + '</code>') : warn('Webhook not set (optional). Payments are still found by the automatic check every 5 minutes.'));
        if(d.lastSweep) rows.push(ok('Automatic check last ran ' + escapeHtml(new Date(d.lastSweep.at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + (d.lastSweep.error ? ' but reported a problem: ' + escapeHtml(d.lastSweep.error) : ' (' + d.lastSweep.checked + ' open, ' + d.lastSweep.recovered + ' recovered).')));
        else rows.push('<span style="color:var(--ink-soft);">Automatic check has not found any open orders to look at yet.</span>');
        const st = d.stats;
        if(st){
          rows.push('Last 24 hours: <b>' + st.paidDayCount + '</b> paid (' + fmtMoney(st.paidDayAmount) + '). Last 30 days: <b>' + st.paid30Count + '</b> paid (' + fmtMoney(st.paid30Amount) + ').' + (st.lastPaidAt ? ' Last payment: ' + escapeHtml(new Date(st.lastPaidAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + '.' : ' No payment yet.'));
          if(st.stuck) rows.push(warn('<b>' + st.stuck + '</b> payment(s) started over 15 minutes ago and not confirmed. Press <b>Check now</b>; if they stay, ask the parent for the Razorpay payment ID.'));
          if(st.failed7) rows.push(warn(st.failed7 + ' payment(s) failed in the last 7 days (usually a declined card or a cancelled UPI request).'));
        }
      }
      if(testMsg) rows.push(testMsg.ok ? ok(escapeHtml(testMsg.message)) : bad(escapeHtml(testMsg.message)));
      el.innerHTML = '<div style="display:grid; gap:5px; padding:10px 12px; border:1px solid var(--border); border-radius:10px;">' + rows.map(r => '<div>' + r + '</div>').join('') + '</div>' +
        (d.configured ? '<button class="btn btn-sm" type="button" style="margin-top:8px;" onclick="testOnlinePayConnection()">Test connection to Razorpay</button>' : '');
    }catch(e){ el.textContent = 'Could not load the status (' + e.message + ').'; }
  }
  async function testOnlinePayConnection(){
    try{
      const res = await fetch('/api/payments/test-connection', { method:'POST' }); await throwIfNotOk(res);
      loadOnlinePayHealth(await res.json());
    }catch(e){ showToast('Could not test (' + e.message + ').'); }
  }
  async function loadOnlinePayments(){
    loadOnlinePayHealth();
    const el = document.getElementById('onlinePaymentsBox'); if(!el) return;
    try{
      const res = await fetch('/api/payments/online-orders'); await throwIfNotOk(res);
      const d = await res.json();
      if(!d.enabled){ el.innerHTML = '<span style="color:var(--ink-soft);">Online payment is not switched on for this school (no Razorpay account connected).</span>'; return; }
      const list = d.orders || [];
      if(!list.length){ el.innerHTML = '<span style="color:var(--ink-soft);">No online payments yet.</span>'; return; }
      const open = list.filter(o => o.status === 'created').length;
      const tone = { paid:'#0a8f6a', created:'#b7791f', failed:'#C0264B' };
      const word = { paid:'Paid', created:'Not completed', failed:'Failed' };
      el.innerHTML = (open ? '<div style="margin-bottom:8px; color:#b7791f;"><b>' + open + '</b> started but not completed (the parent may have cancelled — these are checked automatically).</div>' : '') +
        '<div style="max-height:300px; overflow:auto; border:1px solid var(--border); border-radius:10px;"><table style="width:100%; font-size:0.76rem;"><thead><tr><th style="text-align:left; padding:6px 10px;">When</th><th style="text-align:left;">Student</th><th style="text-align:right;">Amount</th><th style="text-align:left; padding-left:10px;">Receipt</th><th style="text-align:left;">Status</th></tr></thead><tbody>' +
        list.map(o => '<tr><td style="padding:5px 10px; white-space:nowrap;">' + escapeHtml(new Date(o.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + '</td><td>' + escapeHtml(((o.first_name||'') + ' ' + (o.last_name||'')).trim() || '—') + '</td><td style="text-align:right;">' + fmtMoney(Number(o.amount)||0) + '</td><td style="padding-left:10px;">' + escapeHtml(o.receipt_no || '—') + '</td><td style="color:' + (tone[o.status]||'inherit') + ';"><b>' + (word[o.status]||escapeHtml(o.status)) + '</b></td></tr>').join('') +
        '</tbody></table></div>';
    }catch(e){ el.textContent = 'Could not load (' + e.message + ').'; }
  }
  async function checkOnlinePaymentsNow(){
    try{
      const res = await fetch('/api/payments/check-now', { method:'POST' }); await throwIfNotOk(res);
      const d = await res.json();
      showToast(d.recovered ? d.recovered + ' payment(s) found and recorded.' : 'Checked — nothing missing.');
      loadOnlinePayments();
    }catch(e){ showToast('Could not check (' + e.message + ').'); }
  }
  async function loadServerProblems(){
    const el = document.getElementById('serverProblems'); if(!el) return;
    try{
      const res = await fetch('/api/error-log'); await throwIfNotOk(res);
      const list = (await res.json()).errors || [];
      if(!list.length){ el.innerHTML = '<b style="color:var(--teal);">✓ No server problems recorded.</b>'; return; }
      el.innerHTML = '<div style="max-height:260px; overflow:auto; border:1px solid var(--border); border-radius:10px;"><table style="width:100%; font-size:0.76rem;"><thead><tr><th style="text-align:left; padding:6px 10px;">Last seen</th><th style="text-align:left; padding:6px 10px;">What failed</th><th style="padding:6px 10px;">Times</th></tr></thead><tbody>' +
        list.map(x => '<tr><td style="padding:5px 10px; white-space:nowrap;">' + escapeHtml(new Date(x.at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) + '</td><td style="padding:5px 10px;"><b>' + escapeHtml(x.where) + '</b> (' + escapeHtml(x.status) + ')<div style="color:var(--ink-soft);">' + escapeHtml(x.message) + '</div></td><td style="padding:5px 10px; text-align:center;">' + Number(x.count||1) + '</td></tr>').join('') + '</tbody></table></div>';
    }catch(e){ el.textContent = 'Could not load (' + e.message + ').'; }
  }
  async function clearServerProblems(){
    try{ const res = await fetch('/api/error-log', { method:'DELETE' }); await throwIfNotOk(res); showToast('Server problem list cleared.'); loadServerProblems(); }
    catch(e){ showToast('Could not clear (' + e.message + ').'); }
  }
  async function showBackupSummary(){
    const out = document.getElementById('backupResult'); if(!out) return;
    out.innerHTML = '<span style="color:var(--ink-soft);">Checking the database…</span>';
    try{
      const res = await fetch('/api/backup/summary'); await throwIfNotOk(res);
      const d = await res.json();
      const rows = d.tables.slice().sort((a, b) => b.rows - a.rows);
      out.innerHTML = '<b>' + d.totalTables + ' tables · ' + d.totalRows.toLocaleString('en-IN') + ' records in the database right now</b> <span style="color:var(--ink-soft);">(login sessions are never included in a backup)</span>' +
        '<div style="max-height:220px; overflow:auto; margin-top:8px; border:1px solid var(--border); border-radius:10px;"><table style="width:100%; font-size:0.78rem;"><tbody>' +
        rows.map(t => '<tr><td style="padding:4px 10px;">' + escapeHtml(t.name) + '</td><td style="padding:4px 10px; text-align:right;">' + t.rows.toLocaleString('en-IN') + '</td></tr>').join('') + '</tbody></table></div>';
    }catch(e){
      out.innerHTML = '<span style="color:var(--magenta);">Could not check (' + escapeHtml(e.message) + ').</span>';
    }
  }
  async function downloadFullBackup(){
    const btn = document.getElementById('backupDownloadBtn');
    const blob2 = document.getElementById('backupBlob');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing backup…';
    if(blob2) blob2.classList.add('run');
    try{
      const res = await fetch('/api/backup');
      await throwIfNotOk(res);
      const nTables = Number(res.headers.get('X-Backup-Tables')) || 0, nRows = Number(res.headers.get('X-Backup-Rows')) || 0;
      const blob = await res.blob();
      if(!nTables || blob.size < 500){ throw new Error('the file came out empty — nothing was downloaded'); }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifySchoolName()}-erp-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      refreshBackupStatusLine();
      showToast('Backup downloaded: ' + nTables + ' tables, ' + nRows.toLocaleString('en-IN') + ' records.', 'burst');
      const out = document.getElementById('backupResult');
      if(out) out.innerHTML = '<b style="color:var(--teal);">✓ Backup file saved</b> — ' + nTables + ' tables, ' + nRows.toLocaleString('en-IN') + ' records, ' + (blob.size / 1048576 >= 1 ? (blob.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB') + '.<br><span style="color:var(--ink-soft);">Open the file in Notepad: near the top, <i>counts</i> lists every table and its number of records. Click “Check what is in my database” to compare.</span>';
    }catch(e){
      showToast('Could not generate the backup (' + e.message + ').');
    }finally{
      btn.disabled = false;
      btn.textContent = originalLabel;
      if(blob2) blob2.classList.remove('run');
    }
  }
  // Clears demo/test records from Inventory and Accounting so a school can switch
  // over to real day-to-day data entry without stale sample rows mixed in. Reuses
  // the exact same storageSet() calls every other module already uses to save an
  // emptied array/list — for the accounting keys (real DB rows, API_BACKED_KEYS)
  // that diffs old vs. new and deletes every row no longer present; for the
  // inventory keys (OBJECT_BACKED_KEYS) it's a straight overwrite with []. No
  // bespoke delete-all endpoint was needed. Categories/cost-centers are left
  // alone on purpose — they're pick-lists, not transactional data.
  async function resetInventoryAccountingData(){
    await ensureDataLoaded('acctTransactions', loadAcctTransactionsData);
    const opts = {
      items: document.getElementById('ridInvItems').checked,
      sales: document.getElementById('ridInvSales').checked,
      returns: document.getElementById('ridInvReturns').checked,
      accounting: document.getElementById('ridAcct').checked,
    };
    if(!opts.items && !opts.sales && !opts.returns && !opts.accounting){ showToast('Select at least one category to reset.'); return; }
    const confirmText = (document.getElementById('ridConfirmText').value || '').trim().toUpperCase();
    if(confirmText !== 'RESET'){ showToast('Type RESET in the box to confirm.'); return; }

    const parts = [];
    if(opts.items) parts.push(`${inventoryItems.length} stock item(s)`);
    if(opts.sales) parts.push(`${inventorySales.length} sale(s)`);
    if(opts.returns) parts.push(`${inventoryReturns.length} return(s) and ${inventoryVendorReturns.length} vendor return(s)`);
    if(opts.accounting) parts.push(`${acctExpenses.length} expense entrie(s) and ${acctIncome.length} income entrie(s)`);
    const ok = await showConfirmDialog(
      `This will permanently delete: ${parts.join('; ')}. This cannot be undone — make sure you've downloaded a backup if you might need this data later. Continue?`,
      { title:'⚠ Permanent Data Reset', okText:'Yes, delete permanently', cancelText:'Cancel' }
    );
    if(!ok) return;

    const btn = document.getElementById('ridResetBtn');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Resetting…';
    try{
      if(opts.items){ inventoryItems = []; await storageSet(INVENTORY_ITEMS_KEY, inventoryItems); }
      if(opts.sales){ inventorySales = []; await storageSet(INVENTORY_SALES_KEY, inventorySales); }
      if(opts.returns){
        inventoryReturns = []; await storageSet(INVENTORY_RETURNS_KEY, inventoryReturns);
        inventoryVendorReturns = []; await storageSet(INVENTORY_VENDOR_RETURNS_KEY, inventoryVendorReturns);
      }
      if(opts.accounting){
        acctExpenses = []; await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
        acctIncome = []; await storageSet(ACCT_INCOME_KEY, acctIncome);
      }
      showToast('Selected records have been permanently deleted.', 'burst');
      renderAdminToolsTab(document.getElementById('adminTools2Body'));
    }catch(e){
      showToast('Reset failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
  async function changeOwnPassword(){
    const current = document.getElementById('cpCurrent').value;
    const next = document.getElementById('cpNew').value;
    const confirm2 = document.getElementById('cpConfirm').value;
    const u = users.find(x => x.username === currentUser.username);
    if(!u || !(await verifyLogin(u.username, current))){ showToast('Current password is incorrect.'); return; }
    { const pp = passwordProblemClient(next, currentUser && currentUser.role); if(pp){ showToast(pp); return; } }
    if(next !== confirm2){ showToast('New password and confirmation do not match.'); return; }
    u.password = next;
    await storageSet(USERS_KEY, users);
    document.getElementById('cpCurrent').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
    showToast('Password updated.', 'burst');
  }
  function previewDownloadFile(e){
    const file = e.target.files[0];
    if(file) document.getElementById('dlFileName').textContent = file.name;
  }
  async function addAdminDownload(){
    const title = document.getElementById('dlTitle').value.trim();
    const fileInput = document.getElementById('dlFileInput');
    const file = fileInput.files[0];
    if(!title || !file){ showToast('Enter a title and choose a file.'); return; }
    const reader = new FileReader();
    reader.onload = async evt => {
      adminDownloads.push({ title, filename: file.name, data: evt.target.result, date: new Date().toISOString().slice(0,10) });
      await storageSet(DOWNLOADS_KEY, adminDownloads);
      renderAdminToolsTab(document.getElementById('adminTools2Body'));
      showToast('Download added.', 'burst');
    };
    reader.readAsDataURL(file);
  }
  async function deleteAdminDownload(idx){
    if(!await showConfirmDialog('Delete this download?')) return;
    adminDownloads.splice(idx,1);
    await storageSet(DOWNLOADS_KEY, adminDownloads);
    renderAdminToolsTab(document.getElementById('adminTools2Body'));
  }

  /* --- Roles & Permissions --- */
  let permView = 'list';
  let permEditingRoleName = '';

  async function approveRoleQuick(roleName){
    if(!await showConfirmDialog(`Approve "${roleName}" for use? This grants it full access to every module — you can fine-tune exact permissions afterward with "Edit Permissions".`)) return;
    const newPermissions = {};
    PERMISSION_MODULES.forEach(m => {
      newPermissions[m.key] = {};
      PERMISSION_ACTIONS.forEach(a => { newPermissions[m.key][a] = true; });
    });
    let ov = findRoleOverride(roleName);
    if(ov){ ov.permissions = newPermissions; }
    else { customRoles.push({ id:'role_'+Date.now(), name: roleName, permissions: newPermissions }); }
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
    showToast(`"${roleName}" approved — full access granted.`);
  }
  async function addCustomRole(){
    const name = document.getElementById('newRoleName').value.trim();
    if(!name) return;
    if(allRoleNames().includes(name)){ showToast('That role name already exists.'); return; }
    const role = { id:'role_'+Date.now(), name, permissions: emptyPermSet() };
    customRoles.push(role);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    showToast('Role created — now set its permissions.', 'burst');
    editRolePermissions(name);
  }
  function editRolePermissions(roleName){
    permEditingRoleName = roleName;
    permView = 'edit';
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }
  async function deleteCustomRole(roleName){
    if(!await showConfirmDialog('Delete this role? Any users currently assigned this role will lose access until reassigned.')) return;
    customRoles = customRoles.filter(r => r.name !== roleName);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }
  async function resetRoleToDefault(roleName){
    if(!await showConfirmDialog(`Reset "${roleName}" back to its original default permissions?`)) return;
    customRoles = customRoles.filter(r => r.name !== roleName);
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
    showToast('Reset to default.', 'burst');
  }
  function backToPermissionsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    permView = 'list';
    renderPermissionsTab(document.getElementById('rolesPermissionsBody'));
  }

  // Named per-row shortcuts — each sets the row's 6 action checkboxes in one
  // click instead of hunting through 6 columns. "Entry" is deliberately the
  // one that matches "can do the day-to-day job, can't modify/delete/approve
  // anything" — the shape almost every non-Admin support role actually needs
  // (fee collection, attendance, marks entry, POS sales, etc.).
  const PERM_PRESETS = {
    none:  { view:false, create:false, edit:false, delete:false, print:false, approve:false },
    view:  { view:true,  create:false, edit:false, delete:false, print:false, approve:false },
    entry: { view:true,  create:true,  edit:false, delete:false, print:true,  approve:false },
    full:  { view:true,  create:true,  edit:true,  delete:true,  print:true,  approve:true  },
  };
  // Sets one module row's 6 checkboxes to a named preset shape, then keeps
  // the "Full Access" master checkbox and search filter both in sync.
  function applyPermPreset(moduleKey, presetName){
    const preset = PERM_PRESETS[presetName];
    if(!preset) return;
    PERMISSION_ACTIONS.forEach(a => {
      const box = document.querySelector(`.perm-action[data-module="${moduleKey}"][data-action="${a}"]`);
      if(box) box.checked = preset[a];
    });
    const fullBox = document.querySelector(`.perm-full[data-module="${moduleKey}"]`);
    if(fullBox) fullBox.checked = PERMISSION_ACTIONS.every(a => preset[a]);
  }
  // Bulk action across every row currently rendered (search filter doesn't
  // limit this — it always applies to the whole role, so it stays predictable
  // regardless of what's currently typed into the search box).
  function applyPermPresetToAll(presetName){
    document.querySelectorAll('#rolesPermissionsBody .perm-table tbody tr').forEach(tr => {
      const box = tr.querySelector('.perm-action');
      if(box) applyPermPreset(box.dataset.module, presetName);
    });
  }
  // Client-side search across module name + category — hides non-matching
  // rows and collapses any category left with nothing visible, so finding
  // one module among ~70 doesn't mean scrolling through every category.
  function filterPermRows(query){
    const q = (query||'').trim().toLowerCase();
    document.querySelectorAll('#rolesPermissionsBody .perm-category').forEach(catEl => {
      let anyVisible = false;
      catEl.querySelectorAll('tbody tr').forEach(tr => {
        const match = !q || (tr.dataset.search||'').includes(q);
        tr.classList.toggle('perm-row-hidden', !match);
        if(match) anyVisible = true;
      });
      catEl.classList.toggle('perm-cat-hidden', !anyVisible);
      // Searching should surface the answer immediately rather than making
      // the person also remember to expand a collapsed category.
      const bodyEl = catEl.querySelector('.perm-category-body');
      const chevEl = catEl.querySelector('.perm-chevron');
      if(bodyEl && q && anyVisible){ bodyEl.style.display = 'block'; if(chevEl) chevEl.textContent = '▾'; }
    });
  }
  function togglePermCategory(headEl){
    const bodyEl = headEl.nextElementSibling;
    const isHidden = bodyEl.style.display === 'none';
    bodyEl.style.display = isHidden ? 'block' : 'none';
    headEl.querySelector('.perm-chevron').textContent = isHidden ? '▾' : '▸';
  }
  function onPermFullToggle(el){
    const mod = el.dataset.module;
    const checked = el.checked;
    document.querySelectorAll(`.perm-action[data-module="${mod}"]`).forEach(c => c.checked = checked);
  }
  function onPermActionToggle(el){
    const mod = el.dataset.module;
    const allChecked = Array.from(document.querySelectorAll(`.perm-action[data-module="${mod}"]`)).every(c => c.checked);
    const fullBox = document.querySelector(`.perm-full[data-module="${mod}"]`);
    if(fullBox) fullBox.checked = allChecked;
  }
  async function saveRolePermissions(){
    const roleName = permEditingRoleName;
    const existingRole = findRoleOverride(roleName);
    const newPermissions = {};
    PERMISSION_MODULES.forEach(m => {
      if(m.hidden){
        // Legacy fallback-only key (e.g. 'setup') no longer has its own
        // checkboxes in the editor — carry its existing value forward
        // untouched instead of silently resetting it to "no access" just
        // because the visible sub-modules got saved.
        const seeded = seedPermissionsFromDefault(roleName);
        newPermissions[m.key] = (existingRole && existingRole.permissions[m.key]) || seeded[m.key] || Object.fromEntries(PERMISSION_ACTIONS.map(a => [a, false]));
        return;
      }
      newPermissions[m.key] = {};
      PERMISSION_ACTIONS.forEach(a => {
        const box = document.querySelector(`.perm-action[data-module="${m.key}"][data-action="${a}"]`);
        newPermissions[m.key][a] = box ? box.checked : false;
      });
    });
    let role = existingRole;
    if(role){
      role.permissions = newPermissions;
    }else{
      role = { id:'role_'+Date.now(), name: roleName, permissions: newPermissions };
      customRoles.push(role);
    }
    await storageSet(CUSTOM_ROLES_KEY, customRoles);
    showToast('Permissions saved for ' + roleName + '.');
    backToPermissionsList();
  }

  /* --- School Profile (branding, contact, location) --- */
  const SCHOOL_INFO_KEY = "school-info";
  let schoolInfo = {};
  let schoolLogoData = '';
  let schoolPrincipalSignatureData = '';
  // Editable Leadership section — feeds the public website's Leadership cards
  // (via /api/school-info, which it already fetches) so an Admin can correct a
  // name, title or email — or add/remove a leader — without a code change and
  // redeploy. Starts empty like every other School Profile field (this file is
  // the shared template every school runs, so it holds no one school's real
  // names) — use "+ Add Leader" to enter real people, then Save.
  let schoolLeadershipDraft = [];
  function leadershipInitials(name){
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  }

  async function loadSchoolInfo(){
    // These are placeholder DEFAULTS ONLY — they hold until an Admin fills in
    // School Profile (Setup → School Profile) for real, and appear nowhere
    // once that's done. A fresh deployment for a new school should never
    // show another school's actual name, phone, or address, so nothing
    // here is a real contact detail — it's exactly what a not-yet-configured
    // install should look like.
    schoolInfo = await storageGet(SCHOOL_INFO_KEY, {
      name: 'Your School Name', tagline: '',
      udise: '', schoolCode: '', regNumber: '',
      email: '', phone: '', website: '',
      state: '', district: '', pin: '',
      address: '',
      workingDays: 220, logo: '',
      principalName: '', principalSignature: '',
      leadership: [],
    });
    if(schoolInfo.logo) document.getElementById('sbLogoImg').src = schoolInfo.logo;
    const nameSpan = document.getElementById('sbBrandName');
    if(nameSpan) nameSpan.innerHTML = (schoolInfo.name||'Your School') + '<span>ERP Portal</span>';
    document.title = (schoolInfo.name || 'Your School') + ' — ERP';
    const loginNameEl = document.getElementById('loginSchoolName');
    if(loginNameEl && schoolInfo.name) loginNameEl.textContent = schoolInfo.name;
    const loginLogoEl = document.getElementById('loginLogoImg');
    if(loginLogoEl && schoolInfo.logo) loginLogoEl.src = schoolInfo.logo;
    try{ if(schoolInfo.name && schoolInfo.name !== 'Your School Name') localStorage.setItem('rgv_brand', JSON.stringify({ name: schoolInfo.name, logo: schoolInfo.logo || '' })); }catch(e){}
    document.documentElement.classList.remove('brand-pending');
  }
  function schoolLogoSrc(){
    return schoolLogoData || schoolInfo.logo || document.getElementById('sbLogoImg').src;
  }

  function refreshLeadershipEditor(){
    const wrap = document.getElementById('leadershipEditorRows');
    if(wrap) wrap.innerHTML = renderLeadershipEditorRows();
  }
  function addLeadershipEntry(){
    schoolLeadershipDraft.push({ name: '', title: '', qualification: '', email: '', photo: '' });
    refreshLeadershipEditor();
  }
  function removeLeadershipEntry(idx){
    schoolLeadershipDraft.splice(idx, 1);
    refreshLeadershipEditor();
  }
  function previewLeadershipPhoto(e, idx){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolLeadershipDraft[idx].photo = dataUrl;
      refreshLeadershipEditor();
    });
  }
  function previewPrincipalSignature(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolPrincipalSignatureData = dataUrl;
      document.getElementById('schoolSigPreview').src = schoolPrincipalSignatureData;
      document.getElementById('schoolSigPreview').style.display = 'block';
      document.getElementById('schoolSigPlaceholder').style.display = 'none';
    });
  }
  function previewSchoolLogo(e){
    readImageFileWithSizeLimit(e, dataUrl => {
      schoolLogoData = dataUrl;
      document.getElementById('schoolLogoPreview').src = schoolLogoData;
    });
  }
  async function saveSchoolProfile(){
    const siPhoneVal = document.getElementById('siPhone').value.trim();
    if(siPhoneVal && !(isValidMobile(siPhoneVal) || (/^0\d{10}$/.test(siPhoneVal)))){
      showToast('Phone must be a 10-digit mobile or an 11-digit landline starting with 0 (STD code).');
      document.getElementById('siPhone').focus();
      return;
    }
    const siWhatsappVal = document.getElementById('siWhatsapp').value.trim();
    if(siWhatsappVal && !isValidMobile(siWhatsappVal)){
      showToast('WhatsApp number must be exactly 10 digits.');
      document.getElementById('siWhatsapp').focus();
      return;
    }
    const siUdiseVal = document.getElementById('siUdise').value.trim();
    if(siUdiseVal && !isValidUdise(siUdiseVal)){
      showToast('UDISE Code must be exactly 11 digits.');
      document.getElementById('siUdise').focus();
      return;
    }
    const siPinVal = document.getElementById('siPin').value.trim();
    if(siPinVal && !isValidPin(siPinVal)){
      showToast('PIN Code must be exactly 6 digits.');
      document.getElementById('siPin').focus();
      return;
    }
    const siReceiptEl = document.getElementById('siReceiptCode');
    const siReceiptVal = siReceiptEl ? siReceiptEl.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8) : (schoolInfo.receiptCode || '');
    if(siReceiptEl && siReceiptVal.length < 2){
      showToast('Receipt Code must be 2–8 letters or numbers (e.g. SPS).');
      siReceiptEl.focus();
      return;
    }
    schoolInfo = {
      name: document.getElementById('siName').value.trim(),
      tagline: document.getElementById('siTagline').value.trim(),
      udise: document.getElementById('siUdise').value.trim(),
      schoolCode: document.getElementById('siSchoolCode').value.trim(),
      receiptCode: siReceiptVal,
      regNumber: document.getElementById('siRegNumber').value.trim(),
      recognition: (document.getElementById('siRecognition') ? document.getElementById('siRecognition').value.trim() : (schoolInfo.recognition || '')),
      email: document.getElementById('siEmail').value.trim(),
      phone: document.getElementById('siPhone').value.trim(),
      whatsapp: siWhatsappVal,
      website: document.getElementById('siWebsite').value.trim(),
      state: document.getElementById('siState').value.trim(),
      district: document.getElementById('siDistrict').value.trim(),
      pin: document.getElementById('siPin').value.trim(),
      address: document.getElementById('siAddress').value.trim(),
      workingDays: Number(document.getElementById('siWorkingDays').value) || 220,
      logo: schoolLogoData || schoolInfo.logo || '',
      principalName: document.getElementById('siPrincipalName').value.trim(),
      principalSignature: schoolPrincipalSignatureData || schoolInfo.principalSignature || '',
      leadership: schoolLeadershipDraft
        .map(l => ({ name: (l.name||'').trim(), title: (l.title||'').trim(), qualification: (l.qualification||'').trim(), email: (l.email||'').trim(), photo: l.photo || '' }))
        .filter(l => l.name),
    };
    await storageSet(SCHOOL_INFO_KEY, schoolInfo);
    if(schoolInfo.logo) document.getElementById('sbLogoImg').src = schoolInfo.logo;
    const nameSpan = document.getElementById('sbBrandName');
    if(nameSpan) nameSpan.innerHTML = schoolInfo.name + '<span>ERP Portal</span>';
    if(schoolInfo.name) document.title = schoolInfo.name + ' — ERP';
    showToast('School profile saved.', 'burst');
  }

  /* --- Classes management --- */
  const CLASS_LEVELS_KEY = "class-levels";
  const SECTIONS_KEY = "section-levels";
  const CLASS_SECTIONS_KEY = "class-section-overrides";
  [CLASS_LEVELS_KEY, SECTIONS_KEY, CLASS_SECTIONS_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });
  async function loadClassSectionOverrides(){
    classSectionOverrides = await storageGet(CLASS_SECTIONS_KEY, {});
  }
  async function loadClassLevels(){
    CLASS_LEVELS = await storageGet(CLASS_LEVELS_KEY, CLASS_LEVELS);
  }
  async function loadSectionLevels(){
    SECTIONS = await storageGet(SECTIONS_KEY, SECTIONS);
  }
  async function onClassSectionToggle(cls){
    const checked = Array.from(document.querySelectorAll(`.cls-sec-check[data-class="${cls}"]:checked`)).map(c => c.value);
    if(checked.length === 0){
      classSectionOverrides[cls] = [SECTIONS[0]];
      showToast(`At least one section is required — defaulted to Section ${SECTIONS[0]}.`);
    }else{
      classSectionOverrides[cls] = checked;
    }
    await storageSet(CLASS_SECTIONS_KEY, classSectionOverrides);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }
  async function addSectionLevel(){
    const val = document.getElementById('newSectionName').value.trim().toUpperCase();
    if(!val) return;
    if(SECTIONS.includes(val)){ showToast('That section already exists.'); return; }
    SECTIONS.push(val);
    await storageSet(SECTIONS_KEY, SECTIONS);
    renderClassesTab(document.getElementById('classesSetupBody'));
    showToast('Section added.', 'burst');
  }
  async function removeSectionLevel(idx){
    if(SECTIONS.length <= 1){ showToast('At least one section is required.'); return; }
    const removed = SECTIONS[idx];
    if(!await showConfirmDialog(`Remove "Section ${removed}"? This won't delete existing student records, but the section will no longer appear in dropdowns and grids.`)) return;
    SECTIONS.splice(idx,1);
    await storageSet(SECTIONS_KEY, SECTIONS);
    // Clean up any per-class override that referenced the removed section.
    let overridesChanged = false;
    Object.keys(classSectionOverrides).forEach(cls => {
      if(classSectionOverrides[cls].includes(removed)){
        classSectionOverrides[cls] = classSectionOverrides[cls].filter(s => s !== removed);
        if(classSectionOverrides[cls].length === 0) classSectionOverrides[cls] = [SECTIONS[0]];
        overridesChanged = true;
      }
    });
    if(overridesChanged) await storageSet(CLASS_SECTIONS_KEY, classSectionOverrides);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }
  async function addClassLevel(){
    const val = document.getElementById('newClassName').value.trim();
    if(!val) return;
    if(CLASS_LEVELS.includes(val)){ showToast('That class already exists.'); return; }
    CLASS_LEVELS.push(val);
    await storageSet(CLASS_LEVELS_KEY, CLASS_LEVELS);
    renderClassesTab(document.getElementById('classesSetupBody'));
    showToast('Class added.', 'burst');
  }
  async function removeClassLevel(idx){
    if(!await showConfirmDialog(`Remove "${CLASS_LEVELS[idx]}"? This won't delete existing student records, but the class will no longer appear in dropdowns and grids.`)) return;
    CLASS_LEVELS.splice(idx,1);
    await storageSet(CLASS_LEVELS_KEY, CLASS_LEVELS);
    renderClassesTab(document.getElementById('classesSetupBody'));
  }

  /* --- Users & Roles ---
     Staff/Admin-side logins only (Admin, Principal, Accountant, Office
     Assistant, Teacher, Staff, and any custom roles). Student and Parent
     logins live entirely on their own dedicated page (Student/Parent
     Logins) so the two lists don't get mixed together — this page can
     grow to hundreds of student/parent rows otherwise and burying staff
     accounts in the middle of that makes them hard to find. --- */

  function populateUserRoleSelect(mode){
    let names = allRoleNames();
    if(mode === 'staff') names = names.filter(r => r !== 'Student' && r !== 'Parent');
    else if(mode === 'studentparent') names = names.filter(r => r === 'Student' || r === 'Parent');
    document.getElementById('uRole').innerHTML = names.map(r => `<option>${r}</option>`).join('');
  }
  // Auto-generate helpers: a fresh "Add User" form starts with a ready-made
  // username (derived from the name as it's typed) and password so the admin
  // can just hit Save, but either field can still be hand-edited or re-rolled.
  let userModalUsernameTouched = false;
  /* Same password rules as the server (server.js passwordProblem): 8+ characters for Admin / Principal, 6+ for everyone
     else, and no obvious passwords. The server is what really enforces it; this just explains it before saving. */
  function passwordProblemClient(pw, role){
    const p = String(pw || '');
    const min = (role === 'Admin' || role === 'Principal') ? 8 : 6;
    if(p.length < min) return 'Password must be at least ' + min + ' characters.';
    if(/^(.)\1+$/.test(p)) return 'Choose a password that is not one repeated character.';
    if(['password','password1','passw0rd','qwerty','qwerty123','abc123','abcd1234','admin','admin123','admin@123','welcome','welcome1','school','school123','letmein','iloveyou','india123','123456','1234567','12345678','123456789','1234567890','111111','000000','12341234'].includes(p.toLowerCase())) return 'That password is too easy to guess. Choose a different one.';
    return '';
  }
  function generateLoginPassword(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pw = '';
    const rnd = new Uint32Array(10); (window.crypto || window.msCrypto).getRandomValues(rnd);   // not Math.random: passwords must be unguessable
    for(let i=0;i<10;i++) pw += chars[rnd[i] % chars.length];
    return pw;
  }
  function slugifyForUsername(name){
    return (name||'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,20);
  }
  function generateUniqueUsername(name){
    const base = slugifyForUsername(name) || 'user';
    let candidate = base;
    let n = 1;
    while(users.some(u => u.username.toLowerCase() === candidate.toLowerCase())){
      n++;
      candidate = base + n;
    }
    return candidate;
  }
  function onUserNameInput(){
    if(document.getElementById('editUserId').value) return; // don't touch username when editing an existing user
    if(userModalUsernameTouched) return;
    const name = document.getElementById('uName').value.trim();
    document.getElementById('uUsername').value = name ? generateUniqueUsername(name) : '';
  }
  function onUserUsernameInput(){
    userModalUsernameTouched = true;
  }
  function autoGenerateUsername(){
    document.getElementById('uUsername').value = generateUniqueUsername(document.getElementById('uName').value);
    userModalUsernameTouched = true;
  }
  function autoGeneratePassword(){
    document.getElementById('uPassword').value = generateLoginPassword();
  }
  function openUserModal(presetName, presetRole, presetStudentId, mode){
    if(mode !== 'staff') pendingStaffLoginLinkId = null; // only the staff-login shortcut above should link back
    document.getElementById('userModalTitle').textContent = mode === 'studentparent' ? 'Add Student/Parent Login' : (mode === 'staff' ? 'Add Staff User' : 'Add User');
    document.getElementById('userForm').reset();
    document.getElementById('editUserId').value = '';
    userModalUsernameTouched = false;
    document.getElementById('uPassword').placeholder = 'Set a login password';
    document.getElementById('uPassword').value = generateLoginPassword();
    if(presetName) document.getElementById('uName').value = presetName;
    populateUserRoleSelect(mode);
    if(presetRole) document.getElementById('uRole').value = presetRole;
    else if(mode === 'studentparent') document.getElementById('uRole').value = 'Student';
    populateUserStudentPicker();
    if(presetStudentId) document.getElementById('uLinkedStudent').value = presetStudentId;
    toggleUserStudentField();
    onUserNameInput();
    document.getElementById('userModalOverlay').classList.add('open');
  }
  function closeUserModal(){
    pendingStaffLoginLinkId = null;
    document.getElementById('userModalOverlay').classList.remove('open');
  }
  function toggleUserStudentField(){
    const role = document.getElementById('uRole').value;
    document.getElementById('uStudentField').style.display = (role==='Student'||role==='Parent') ? 'block' : 'none';
  }
  function populateUserStudentPicker(){
    const sel = document.getElementById('uLinkedStudent');
    sel.innerHTML = '<option value="">Not linked</option>' +
      students.map(s => `<option value="${s.id}">${s.lastName} ${s.firstName} — ${s.admissionNo}</option>`).join('');
  }
  function editUser(id){
    const u = users.find(x => x.id === id);
    if(!u) return;
    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('editUserId').value = u.id;
    document.getElementById('uName').value = u.name;
    document.getElementById('uUsername').value = u.username;
    // The server never sends a stored password back (see the security
    // review), so there's nothing to pre-fill here — leave it blank and
    // explain that blank means "no change," rather than showing "undefined".
    document.getElementById('uPassword').value = '';
    document.getElementById('uPassword').placeholder = 'Leave blank to keep the current password';
    populateUserRoleSelect();
    document.getElementById('uRole').value = u.role;
    populateUserStudentPicker();
    document.getElementById('uLinkedStudent').value = u.linkedStudentId || '';
    toggleUserStudentField();
    document.getElementById('userModalOverlay').classList.add('open');
  }
  async function deleteUser(id){
    if(!await showConfirmDialog('Remove this user account?')) return;
    users = users.filter(u => u.id !== id);
    await storageSet(USERS_KEY, users);
    refreshUserListViews();
    showToast('User removed.', 'burst');
  }
  // Users can be edited/created/removed from either the full Users & Roles page or
  // the filtered Student/Parent Logins page — refresh whichever one is on screen
  // (usually just one, but harmless to check both) so neither goes stale.
  function refreshUserListViews(){
    const rolesBody = document.getElementById('usersRolesBody');
    if(rolesBody) renderUsersTab(rolesBody);
    const loginsBody = document.getElementById('studentParentLoginsBody');
    if(loginsBody) renderStudentParentLoginsView(loginsBody);
  }
  async function saveUser(e){
    e.preventDefault();
    const editId = document.getElementById('editUserId').value;
    const uname = document.getElementById('uUsername').value.trim();
    if(users.some(u => u.username.toLowerCase()===uname.toLowerCase() && u.id!==editId)){
      showToast('That username is already taken.');
      return false;
    }
    if(!editId && !document.getElementById('uPassword').value){
      showToast('Set a password for this new user.');
      return false;
    }
    { const pw0 = document.getElementById('uPassword').value;
      if(pw0){ const pp = passwordProblemClient(pw0, document.getElementById('uRole').value); if(pp){ showToast(pp); return false; } } }
    const data = {
      name: document.getElementById('uName').value.trim(),
      username: uname,
      password: document.getElementById('uPassword').value,
      role: document.getElementById('uRole').value,
      linkedStudentId: document.getElementById('uLinkedStudent').value,
    };
    let linkedStaff = null;
    let prevLinkedUserId;
    let prevUserSnapshot = null;
    let pushedNewUser = false;
    if(editId){
      const idx = users.findIndex(u => u.id === editId);
      prevUserSnapshot = { ...users[idx] };
      users[idx] = { ...users[idx], ...data };
    }else{
      data.id = 'u_' + Date.now();
      users.push(data);
      pushedNewUser = true;
      // If this login was created via the Staff Directory's 🔑 "Grant login
      // access" shortcut, link it straight back onto that staff record —
      // otherwise this user would exist in Users & Roles but myTeacherScope()
      // could never trace it back to the staff member's class/subject
      // assignments (see openLoginForStaff above).
      if(pendingStaffLoginLinkId){
        linkedStaff = staffList.find(st => st.id === pendingStaffLoginLinkId);
        if(linkedStaff){
          prevLinkedUserId = linkedStaff.linkedUserId;
          linkedStaff.linkedUserId = data.id;
        }
      }
    }
    // storageSet/syncArrayToApi never throws — on a server/permission/network
    // failure it silently falls back to localStorage and only pops a
    // dismissible toast, so without this check saveUser would carry on as if
    // the login had really been created: the modal would close, "User
    // created" would show, and the admin would have no reason to look again
    // until it mysteriously wasn't in Users & Roles after a reload. Checking
    // the real result here and refusing to pretend it worked is the fix.
    const saved = await storageSet(USERS_KEY, users);
    if(!saved){
      if(pushedNewUser){
        users.pop();
        if(linkedStaff) linkedStaff.linkedUserId = prevLinkedUserId;
      }else{
        const idx = users.findIndex(u => u.id === editId);
        users[idx] = prevUserSnapshot;
      }
      alert("This login could NOT be saved to the server — nothing was created or changed. This usually means the save was rejected (e.g. you're not signed in as Admin) or the connection dropped. Please check and try again; the form stays open so you don't lose what you typed.");
      return false;
    }
    if(linkedStaff){
      const staffLinkSaved = await storageSet(STAFF_KEY, staffList);
      if(!staffLinkSaved){
        showToast("Login created, but couldn't link it to the staff record — attendance and marks-entry access won't work for them yet. Try the 🔑 button again from Staff Directory.");
      }
    }
    showToast(editId ? 'User updated.' : 'User created.');
    pendingStaffLoginLinkId = null;
    closeUserModal();
    refreshUserListViews();
    return false;
  }

  /* --- Academic Year --- */

  async function addAcademicYear(){
    const val = document.getElementById('ayNewInput').value.trim();
    if(!val) return;
    if(!academicYears.includes(val)) academicYears.push(val);
    await storageSet(ACADEMIC_YEARS_KEY, academicYears);
    showToast('Academic year added.', 'burst');
    renderAcademicYearTab(document.getElementById('academicYearBody'));
  }

  async function setCurrentAcademicYear(){
    currentAcademicYearValue = document.getElementById('ayCurrentSelect').value;
    await storageSet(CURRENT_AY_KEY, currentAcademicYearValue);
    document.getElementById('ayBadge').textContent = 'AY ' + currentAcademicYearValue;
    showToast('Current academic year updated.', 'burst');
  }

  /* --- Fee Structure --- */

  async function saveFeeStructure(){
    document.querySelectorAll('.fs-input').forEach(inp => {
      const cls = inp.dataset.class, field = inp.dataset.field;
      classFeeStructure[cls] = classFeeStructure[cls] || {};
      classFeeStructure[cls][field] = Number(inp.value) || 0;
    });
    financeSettings.hostel = Number(document.getElementById('fsHostel').value) || 0;
    await storageSet(FEE_STRUCTURE_KEY, classFeeStructure);
    await storageSet(SETTINGS_KEY, financeSettings);
    showToast('Fee structure saved.', 'burst');
    renderDashboard();
  }

  /* --- Promotions --- */
  /* ===== PROMOTION & TRANSFER (individual student-level, incl. double promotion) ===== */
  