/* Dates everywhere in the ERP are shown as dd/mm/yyyy (e.g. 23/10/2026), times as 9:53 am.
   Loaded FIRST so that every screen, print window (receipt, statement, report card) and Excel/PDF export that
   builds dates in the usual ISO form (2026-10-23) or with month names (23 Oct 2026) is shown the Indian way.
   Stored data is never changed — only how it is displayed. (<input type="date"> boxes are drawn by the
   browser itself and follow the device's regional setting.) */
(function(){
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const validYMD = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200;
  const dmy = (y, m, d) => pad(d) + '/' + pad(m) + '/' + y;
  const fmtTime = dt => {
    let h = dt.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return h + ':' + pad(dt.getMinutes()) + ' ' + ap;
  };

  /* ---- text: 2026-10-23  ->  23/10/2026     2026-10-23T04:43:25.960Z  ->  23/10/2026, 10:13 am ---- */
  const ISO_DT = /(^|[^\w-])(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?(?![\w])/g;
  const ISO_D  = /(^|[^\w-])(\d{4})-(\d{2})-(\d{2})(?![\w-])/g;
  function convText(s){
    if(typeof s !== 'string' || s.length < 10 || s.indexOf('-') < 0) return s;
    s = s.replace(ISO_DT, (m, pre, y, mo, d, hh, mi, ss, tz) => {
      if(!validYMD(+y, +mo, +d)) return m;
      let dt;
      if(tz){ dt = new Date(y + '-' + mo + '-' + d + 'T' + hh + ':' + mi + ':' + (ss || '00') + (tz === 'Z' ? 'Z' : tz.length === 5 ? tz.slice(0, 3) + ':' + tz.slice(3) : tz)); }
      else dt = new Date(+y, +mo - 1, +d, +hh, +mi, +(ss || 0));
      if(isNaN(dt.getTime())) return m;
      return pre + dmy(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()) + ', ' + fmtTime(dt);
    });
    return s.replace(ISO_D, (m, pre, y, mo, d) => validYMD(+y, +mo, +d) ? pre + dmy(y, mo, d) : m);
  }

  /* ---- HTML string: only the text between tags is converted; tags/attributes, <script>, <style>, <textarea> are left alone ---- */
  const HTML_PART = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<textarea[\s\S]*?<\/textarea>|<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>)/gi;
  function convHtml(html){
    if(typeof html !== 'string' || html.length < 10 || html.indexOf('-') < 0) return html;
    return html.split(HTML_PART).map((part, i) => (i % 2 === 1 ? part : convText(part))).join('');
  }

  /* ---- Date.prototype.toLocale*String: day+month always numeric dd/mm(/yyyy) ---- */
  const origDS = Date.prototype.toLocaleDateString, origS = Date.prototype.toLocaleString;
  function dateFmt(dt, o){
    const dd = pad(dt.getDate()), mm = pad(dt.getMonth() + 1), yy = dt.getFullYear();
    let out = dd + '/' + mm + (o && !o.year && (o.day || o.month) && !o.dateStyle ? '' : '/' + yy);
    if(o && o.weekday) out = origDS.call(dt, 'en-IN', { weekday: o.weekday }) + ', ' + out;
    return out;
  }
  const keep = o => !!o && (o.timeZone || (o.month && !o.day && !o.dateStyle) || (o.dateStyle === 'long' || o.dateStyle === 'full'));
  Date.prototype.toLocaleDateString = function(loc, o){
    if(isNaN(this.getTime())) return origDS.call(this, loc, o);
    if(keep(o)) return origDS.call(this, loc, o);
    if(o && !o.day && !o.month && !o.year && !o.weekday && !o.dateStyle) return dateFmt(this, null);
    if(o && o.year && !o.day && !o.month && !o.weekday) return String(this.getFullYear());
    return dateFmt(this, o && (o.day || o.month || o.weekday) ? o : null);
  };
  Date.prototype.toLocaleString = function(loc, o){
    if(isNaN(this.getTime())) return origS.call(this, loc, o);
    if(o && (o.timeZone || (o.month && !o.day && !o.timeStyle && !o.hour))) return origS.call(this, loc, o);
    const dKeys = !!o && !!(o.day || o.month || o.year || o.weekday || o.dateStyle);
    const tKeys = !!o && !!(o.hour || o.minute || o.second || o.timeStyle);
    const hasDate = !o || dKeys || !tKeys, hasTime = !o || tKeys || !dKeys;
    const parts = [];
    if(hasDate) parts.push(dateFmt(this, dKeys && (o.day || o.month || o.weekday) ? o : null));
    if(hasTime){
      const t = fmtTime(this);
      parts.push(!o || o.second || o.timeStyle === 'medium' ? t.replace(' ', ':' + pad(this.getSeconds()) + ' ') : t);
    }
    return parts.join(', ');
  };

  /* ---- Excel exports: dates inside the sheet data are converted too ---- */
  function convValue(v){ return typeof v === 'string' ? convText(v) : v; }
  function wrapXLSX(x){
    try{
      if(!x || !x.utils || x.__dmy) return;
      x.__dmy = true;
      const j2s = x.utils.json_to_sheet, a2s = x.utils.aoa_to_sheet;
      if(j2s) x.utils.json_to_sheet = function(rows, opts){ return j2s.call(this, Array.isArray(rows) ? rows.map(r => r && typeof r === 'object' ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, convValue(v)])) : r) : rows, opts); };
      if(a2s) x.utils.aoa_to_sheet = function(rows, opts){ return a2s.call(this, Array.isArray(rows) ? rows.map(r => Array.isArray(r) ? r.map(convValue) : r) : rows, opts); };
    }catch(_){}
  }

  /* ---- Browser hooks (skipped when this file is loaded outside a browser, e.g. in the tests) ---- */
  if(typeof window !== 'undefined' && typeof Element !== 'undefined' && window.document){
    const skipTag = el => { const t = el && el.tagName; return t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA'; };
    // innerHTML / insertAdjacentHTML: convert on the way in, so there is no flicker of the old format.
    try{
      const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if(d && d.set) Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v){ d.set.call(this, skipTag(this) ? v : convHtml(v)); } });
      const iah = Element.prototype.insertAdjacentHTML;
      Element.prototype.insertAdjacentHTML = function(pos, html){ return iah.call(this, pos, convHtml(html)); };
    }catch(_){}
    // Print windows (receipts, statements, report cards, PDF exports) are written with document.write.
    try{
      const open = window.open;
      window.open = function(){
        const w = open.apply(this, arguments);
        try{ if(w && w.document){ const dw = w.document.write.bind(w.document); w.document.write = function(h){ return dw(convHtml(typeof h === 'string' ? h : String(h))); }; } }catch(_){}
        return w;
      };
    }catch(_){}
    // Anything set as plain text (textContent / innerText) is caught here.
    const fixNode = n => {
      if(n.nodeType === 3){ const p = n.parentNode; if(p && !skipTag(p)){ const c = convText(n.nodeValue); if(c !== n.nodeValue) n.nodeValue = c; } }
      else if(n.nodeType === 1 && !skipTag(n) && n.childNodes && n.childNodes.length){
        const tw = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null); const list = []; let t; while((t = tw.nextNode())) list.push(t);
        list.forEach(fixNode);
      }
    };
    const start = () => {
      try{
        fixNode(document.body);
        new MutationObserver(muts => { for(const m of muts){ if(m.type === 'characterData') fixNode(m.target); else m.addedNodes.forEach(fixNode); } })
          .observe(document.body, { childList: true, subtree: true, characterData: true });
      }catch(_){}
    };
    if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    // XLSX is loaded on demand (a <script> added later) — wrap it the moment it appears.
    try{
      let _x = window.XLSX;
      Object.defineProperty(window, 'XLSX', { configurable: true, get: () => _x, set: v => { _x = v; wrapXLSX(v); } });
      if(_x) wrapXLSX(_x);
    }catch(_){}
  }
  const api = { dmy, convText, convHtml, dateFmt };
  if(typeof window !== 'undefined') window.__dateFmt = api;
  if(typeof globalThis !== 'undefined') globalThis.fmtDMY = (v) => convText(String(v || ''));
})();
