/* =========================================================================
   Hall tickets: download any time + reissue for a student who lost theirs.
   - "Download" saves the same sheet as a file (opens on any phone or computer, then Print or Save as PDF),
     so it works even where the browser blocks print windows. It follows exactly the same rules as printing
     (permission, fee hold, ready sections) because it goes through the same code.
   - Room Allotment: whatever room each student was given is remembered, so hall tickets of earlier sessions
     keep their room after the allotment screen moves on to another session.
   Nothing already issued is changed.
   ========================================================================= */
(function(){
  'use strict';
  let dl = false;

  function downloadWindow(){
    let buf = '';
    return {
      document: {
        write(h){ buf += h; }, writeln(h){ buf += h + '\n'; },
        close(){
          try{
            const m = /<title>([^<]*)<\/title>/.exec(buf), name = ((m && m[1]) || 'HallTickets').replace(/[^\w.-]+/g, '_') + '.html';
            let html = buf.replace(/\sonload="window\.print\(\)"/, '');
            const bar = '<style>@media print{.no-print{display:none!important}}</style><div class="no-print" style="position:sticky;top:0;z-index:9;background:#241b4b;color:#fff;padding:10px 14px;text-align:center;font-family:Arial,sans-serif;font-size:14px;">'
              + '<button onclick="window.print()" style="font-size:15px;padding:8px 18px;border:0;border-radius:8px;background:#f2b705;color:#241b4b;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>'
              + ' &nbsp; Choose “Save as PDF” in the print window to keep a PDF copy.</div>';
            html = /<body[^>]*>/.test(html) ? html.replace(/(<body[^>]*>)/, '$1' + bar) : bar + html;
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' }), a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
            try{ showToast('Downloaded ' + name + ' — open it, then Print or Save as PDF.'); }catch(e){}
          }catch(e){ try{ showToast('Could not download: ' + (e && e.message || 'try again')); }catch(x){} }
        }
      },
      focus(){}, close(){}, print(){}
    };
  }

  const prev = window.printAdmitCardPairs;
  if(typeof prev === 'function'){
    window.printAdmitCardPairs = function(){
      const real = window.open, wantDl = dl; dl = false;
      if(wantDl) window.open = function(){ return downloadWindow(); };
      try{ return prev.apply(this, arguments); } finally{ window.open = real; }
    };
  }
  const run = async fn => { dl = true; try{ await fn(); } finally{ dl = false; } };

  window.acDownloadSelected = () => run(async () => {
    const pairs = [...document.querySelectorAll('.ac-ps:checked')].map(x => ({ cls: x.dataset.c, sec: x.value }));
    if(!pairs.length){ showToast('Tick at least one class or section first.'); return; }
    await window.acPrintPairsGuarded(pairs);
  });
  window.acDownloadEverything = () => run(async () => {
    const exam = examDefs.find(e => e.id === admitCardsExamId); if(!exam) return;
    const pairs = [];
    acAllClasses().forEach(c => SECTIONS.forEach(sec => { if(students.some(s => s.className === c && s.section === sec && isActive(s))) pairs.push({ cls: c, sec }); }));
    if(!pairs.length){ showToast('No students to print for.'); return; }
    await window.acPrintPairsGuarded(pairs);
  });
  window.acDownloadRoster = (cls, sec) => run(async () => { await window.acPrintAll(cls, sec); });
  // One student (lost hall ticket): same rules as the Print button beside the name (a held card stays held).
  window.acDownloadStudent = (btn, cls, sec, sid) => {
    const row = btn && btn.closest ? btn.closest('tr') : null, pb = row && row.querySelector('.btn-edit-text');
    if(pb && pb !== btn && pb.disabled){ showToast(pb.title || 'This hall ticket is on hold.'); return; }
    dl = true; try{ window.printAdmitCards(cls, sec, sid); } finally{ dl = false; }
  };

  // Keep every student's room remembered as soon as the Room Allotment screen is shown.
  const rr = window.renderRoomAllotSubBody;
  if(typeof rr === 'function'){
    window.renderRoomAllotSubBody = function(){
      const r = rr.apply(this, arguments);
      try{ if(typeof roomAllotExamId !== 'undefined' && roomAllotExamId) setTimeout(() => { try{ computeExamHallTicketRoomMap(roomAllotExamId); }catch(e){} }, 300); }catch(e){}
      return r;
    };
  }
})();
