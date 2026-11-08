/* 73 — Add/Edit Student: required-field messages appear right under the empty field.
   The form is a 4-tab wizard and Save lives on the last tab, so the browser's own
   "please fill this field" bubble could not show for fields on an earlier tab. */
(function () {
  'use strict';
  const form = document.getElementById('wizardForm');
  if (!form) return;
  const style = document.createElement('style');
  style.textContent = '.fld-err{color:#c0392b;font-size:.78rem;font-weight:600;margin-top:4px}' +
    '.fld-bad{border-color:#c0392b !important;box-shadow:0 0 0 3px rgba(192,57,43,.15) !important}' +
    '.wtab-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#c0392b;margin-left:6px;vertical-align:middle}';
  document.head.appendChild(style);

  function clear() {
    form.querySelectorAll('.fld-err').forEach(e => e.remove());
    form.querySelectorAll('.fld-bad').forEach(e => e.classList.remove('fld-bad'));
    form.querySelectorAll('.wtab-dot').forEach(e => e.remove());
  }
  function labelOf(el) {
    const f = el.closest('.f-field'); const l = f && f.querySelector('label');
    return l ? l.textContent.replace('*', '').trim() : 'This field';
  }
  form.addEventListener('submit', function (e) {
    clear();
    const bad = Array.from(form.querySelectorAll('[required]')).filter(el => !String(el.value || '').trim());
    if (!bad.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    bad.forEach(el => {
      el.classList.add('fld-bad');
      const m = document.createElement('div'); m.className = 'fld-err';
      m.textContent = (el.tagName === 'SELECT' ? 'Please choose ' : 'Please enter ') + labelOf(el).toLowerCase() + '.';
      (el.closest('.f-field') || el.parentNode).appendChild(m);
      const panel = el.closest('[id^="panel-"]');
      if (panel) { const tab = document.getElementById('wtab-' + panel.id.slice(6)); if (tab && !tab.querySelector('.wtab-dot')) { const d = document.createElement('span'); d.className = 'wtab-dot'; tab.appendChild(d); } }
    });
    const first = bad[0], panel = first.closest('[id^="panel-"]');
    if (panel && typeof switchWizardTab === 'function') switchWizardTab(panel.id.slice(6));
    setTimeout(() => { try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.focus({ preventScroll: true }); } catch (x) {} }, 30);
    if (typeof showToast === 'function') showToast('Please fill the highlighted field(s).');
  }, true);
  form.addEventListener('input', function (e) {
    const el = e.target;
    if (el.classList && el.classList.contains('fld-bad') && String(el.value || '').trim()) {
      el.classList.remove('fld-bad');
      const f = el.closest('.f-field'); const m = f && f.querySelector('.fld-err'); if (m) m.remove();
    }
  });
  form.noValidate = true;
})();

/* ID Cards: tell the user what to do on the department screen */
(function () {
  if (typeof renderIdCardsDeptGrid !== 'function') return;
  const orig = renderIdCardsDeptGrid;
  renderIdCardsDeptGrid = function (body) {
    orig(body);
    body.insertAdjacentHTML('afterbegin', '<p style="font-size:.88rem;color:var(--ink-soft);margin:0 0 14px">👆 Click a department to see its staff and print their ID cards — one card or the whole department.</p>');
  };
})();
