/* 75 — Teacher & Parent portal polish (look and layout only; no data, permission or saving logic is touched).
   Teachers: no greyed-out "switched off" tiles on phones; Homework bottom tab hidden while the school has Homework off;
             Marks opens on "Enter Marks" with the admin set-up guide tucked away; Attendance tab buttons sit in one scrolling row.
   Parents:  Marks / Fees / Messages open without the repeated child card on phones; latest exam first; slimmer notification bar. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const st = document.createElement('style');
  st.textContent = `
  @media (max-width: 760px) {
    body.tp-on .tp-tile.off { display: none !important; }
    body.tp-on #view-attendance .mf-tabs, body.tp-on #view-exams .mf-tabs { flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    body.tp-on #view-attendance .mf-tabs::-webkit-scrollbar, body.tp-on #view-exams .mf-tabs::-webkit-scrollbar { display: none; }
    body.tp-on #view-attendance .mf-tab, body.tp-on #view-exams .mf-tab { flex: 0 0 auto; white-space: nowrap; }
    body.pp-on.pp-compact .pm-hero { display: none !important; }
  }
  body.tp-on .eg { display: none !important; }
  body.pp-on #ppNotif { padding: 8px 12px !important; margin: 8px 0 !important; border-radius: 12px !important; }
  body.pp-on #ppNotif span { font-size: 1.1rem !important; }
  body.pp-on #ppNotif > div { font-size: .8rem !important; line-height: 1.35; font-weight: 600 !important; }
  `;
  document.head.appendChild(st);

  const isTeacher = () => { try { return currentUser && currentUser.role === 'Teacher'; } catch (e) { return false; } };

  /* Homework bottom tab follows the school's own switch (same setting the Home tile uses) */
  function syncDock() {
    const d = $('tpDock'); if (!d) return;
    let off = false;
    Array.from(document.querySelectorAll('#view-myday .tp-tile.off')).forEach(t => { if (/Homework/i.test(t.textContent)) off = true; });
    const b = d.querySelector('button[data-v="syllabus"]'); if (b) b.style.display = off ? 'none' : '';
  }
  setInterval(() => { try { if (isTeacher()) syncDock(); } catch (e) {} }, 1500);

  /* Teachers land on Enter Marks the first time they open Marks in a session */
  if (typeof initExamsView === 'function') {
    const orig = initExamsView; let done = false;
    initExamsView = function () {
      if (!done && isTeacher() && typeof examTab !== 'undefined') {
        done = true;
        try { if (getExamsTabAccess(currentUser.role, EXAMS_TAB_PERM_KEYS.marks)) examTab = 'marks'; } catch (e) {}
      }
      return orig.apply(this, arguments);
    };
  }

  /* Parents: no repeated child card on the Marks / Fees / Messages screens (phones), latest exam first */
  function flag() {
    try {
      const on = ['marks', 'fees', 'contact'].includes(typeof myProfileTab !== 'undefined' ? myProfileTab : '');
      document.body.classList.toggle('pp-compact', !!on);
    } catch (e) {}
  }
  if (typeof renderMyProfileBody === 'function') {
    const orig = renderMyProfileBody;
    renderMyProfileBody = async function () { flag(); const r = await orig.apply(this, arguments); flag(); return r; };
  }
  if (typeof renderMyMarksTab === 'function') {
    const orig = renderMyMarksTab;
    renderMyMarksTab = function (body) {
      const r = orig.apply(this, arguments);
      try {
        const kids = Array.from(body.children);
        if (kids.length > 1 && kids.every(k => k.classList.contains('profile-card'))) kids.reverse().forEach(k => body.appendChild(k));
      } catch (e) {}
      return r;
    };
  }
})();
