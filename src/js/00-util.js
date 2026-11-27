// ───────────────────────── 공통 도구 ─────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 화면 요소 만들기: h('div', {class, style, text, on...}, ...자식)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ── XML(OOXML) ──
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  dgm: 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
  dsp: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};
const REL = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  notes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  diagramDrawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',
};
const CT = {
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  notes: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
};

const parseXML = s => new DOMParser().parseFromString(s, 'application/xml');
const xmlString = doc => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(doc.documentElement);

// 접두사와 상관없이 지역 이름으로 찾는다(OOXML 은 이름이 겹치지 않게 쓰여 있다)
const ln = el => el && (el.localName || el.nodeName.replace(/^.*:/, ''));
function kid(el, name) { if (!el) return null; for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (ln(c) === name) return c; return null; }
function kids(el, name) { const out = []; if (!el) return out; for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (!name || ln(c) === name) out.push(c); return out; }
function path(el, ...names) { for (const n of names) { el = kid(el, n); if (!el) return null; } return el; }
function desc(el, name) { if (!el) return null; const all = el.getElementsByTagName('*'); for (const e of all) if (ln(e) === name) return e; return null; }
const attr = (el, n, d = null) => (el && el.hasAttribute(n) ? el.getAttribute(n) : d);
const num = (el, n, d = null) => { const v = attr(el, n); return v == null || v === '' ? d : +v; };
const rAttr = (el, n) => (el ? el.getAttributeNS(NS.r, n) || el.getAttribute('r:' + n) : null);
const bool = (el, n, d = false) => { const v = attr(el, n); return v == null ? d : v === '1' || v === 'true'; };

// 같은 문서 안에 새 요소: el('a:r'), el('p:sp')
function el(doc, qname, attrs) {
  const pre = qname.split(':')[0];
  const e = doc.createElementNS(NS[pre] || NS.a, qname);
  if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}
// 정해진 순서(스키마 순서)에 맞춰 자식 넣기: order = ['xfrm', 'custGeom', 'prstGeom', ...]
function setKid(parent, child, order) {
  const name = ln(child);
  const old = kid(parent, name);
  if (old) { parent.replaceChild(child, old); return child; }
  const idx = order.indexOf(name);
  for (let c = parent.firstElementChild; c; c = c.nextElementSibling) {
    const j = order.indexOf(ln(c));
    if (j > idx) { parent.insertBefore(child, c); return child; }
  }
  parent.appendChild(child);
  return child;
}
const SPPR_ORDER = ['xfrm', 'custGeom', 'prstGeom', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'ln', 'effectLst', 'effectDag', 'scene3d', 'sp3d', 'extLst'];
const RPR_ORDER = ['ln', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];
const PPR_ORDER = ['lnSpc', 'spcBef', 'spcAft', 'buClrTx', 'buClr', 'buSzTx', 'buSzPct', 'buSzPts', 'buFontTx', 'buFont', 'buNone', 'buAutoNum', 'buChar', 'buBlip', 'tabLst', 'defRPr', 'extLst'];
const FILL_NAMES = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];

// ── 단위: EMU → 화면 px(96dpi), 1pt = 12700 EMU ──
const EMU_PX = 9525;
const px = emu => emu / EMU_PX;
const toEmu = p => Math.round(p * EMU_PX);
const ptPx = pt => pt * 96 / 72;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
