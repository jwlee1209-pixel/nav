// ───────────────────────── 슬라이드 목록·추가·복제·삭제·순서·메모 ─────────────────────────
const THUMB_W = 150;
let thumbObs = null;

function renderThumbs() {
  const box = $('#thumbs');
  if (thumbObs) thumbObs.disconnect();
  box.replaceChildren();
  const d = S.deck;
  const tw = THUMB_W, th = Math.round(tw * d.H / d.W);
  thumbObs = 'IntersectionObserver' in window ? new IntersectionObserver(ents => {
    for (const en of ents) if (en.isIntersecting && !en.target._drawn) { drawThumb(en.target); }
  }, { root: box, rootMargin: '300px 0px' }) : null;
  d.slides.forEach((p, i) => {
    const hidden = attr(d.pkg.doc(p).documentElement, 'show') === '0';
    const tv = h('div', { class: 'tv', style: `width:${tw}px;height:${th}px` });
    const t = h('div', { class: 'thumb' + (i === S.cur ? ' cur' : '') + (hidden ? ' hid' : ''), dataset: { i: String(i) }, title: hidden ? '숨긴 슬라이드' : '' }, h('div', { class: 'no', text: String(i + 1) }), tv);
    t._tv = tv; t._path = p;
    box.append(t);
    if (thumbObs && i > 6) thumbObs.observe(t); else drawThumb(t);
  });
}
function drawThumb(t) {
  t._drawn = true;
  const d = S.deck;
  const i = +t.dataset.i;
  let sl;
  try { sl = renderSlide(d, d.slides[i], { slideNo: i + 1 }); }
  catch (e) { console.warn(e); sl = h('div', { class: 'slide', text: '?' }); }
  sl.style.transform = `scale(${THUMB_W / d.W})`;
  t._tv.replaceChildren(sl);
}
function updateThumb(i) {
  const t = $(`#thumbs .thumb[data-i="${i}"]`);
  if (!t || t._path !== S.deck.slides[i]) { renderThumbs(); return; }
  t.classList.toggle('hid', attr(S.deck.pkg.doc(t._path).documentElement, 'show') === '0');
  drawThumb(t);
}
function markCurThumb() {
  for (const t of $$('#thumbs .thumb')) t.classList.toggle('cur', +t.dataset.i === S.cur);
  const c = $('#thumbs .thumb.cur');
  if (c) c.scrollIntoView({ block: 'nearest' });
}
function goSlide(i) {
  if (!S.deck) return;
  i = clamp(i, 0, S.deck.slides.length - 1);
  if (S.editing) endTextEdit(true);
  flushNotes();
  if (i === S.cur && $('#slideHost .slide')) { markCurThumb(); return; }
  S.cur = i; S.sel = [];
  markCurThumb();
  renderCurrent(); renderNotes(); updateToolbar(); updateStatus();
}

// 썸네일: 누르면 이동, 끌면 순서 바꾸기
function initThumbs() {
  const box = $('#thumbs');
  let dr = null;
  box.addEventListener('pointerdown', e => {
    const t = e.target.closest('.thumb'); if (!t || e.button > 0) return;
    dr = { t, y0: e.clientY, from: +t.dataset.i, moving: false, to: null };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', e => {
    if (!dr) return;
    if (!dr.moving && Math.abs(e.clientY - dr.y0) < 6) return;
    dr.moving = true; dr.t.classList.add('dragging');
    for (const x of $$('#thumbs .thumb')) x.classList.remove('drop-before', 'drop-after');
    const r0 = box.getBoundingClientRect();
    if (e.clientY < r0.top + 24) box.scrollTop -= 12; else if (e.clientY > r0.bottom - 24) box.scrollTop += 12;
    const list = $$('#thumbs .thumb');
    let to = list.length;
    for (const x of list) { const r = x.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = +x.dataset.i; break; } }
    dr.to = to;
    if (to < list.length) list[to].classList.add('drop-before'); else list[list.length - 1].classList.add('drop-after');
  });
  const end = () => {
    if (!dr) return;
    const d = dr; dr = null;
    for (const x of $$('#thumbs .thumb')) x.classList.remove('drop-before', 'drop-after', 'dragging');
    if (!d.moving) { goSlide(d.from); return; }
    let to = d.to; if (to == null) return;
    if (to > d.from) to--;
    if (to !== d.from) moveSlide(d.from, to);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', () => { dr = null; for (const x of $$('#thumbs .thumb')) x.classList.remove('drop-before', 'drop-after', 'dragging'); });
}

// ── presentation.xml 도우미 ──
const presRoot = () => S.deck.pres.documentElement;
function sldIdLst(create = true) {
  const root = presRoot();
  let l = kid(root, 'sldIdLst');
  if (!l && create) {
    l = el(S.deck.pres, 'p:sldIdLst');
    const before = kid(root, 'sldSz') || kid(root, 'notesSz');
    root.insertBefore(l, before);
  }
  return l;
}
function addSlideRef(slidePath, at) {
  const pkg = S.deck.pkg, pp = S.deck.presPath;
  const rid = pkg.addRel(pp, REL.slide, slidePath);
  const lst = sldIdLst();
  let max = 255;
  for (const e of kids(lst, 'sldId')) max = Math.max(max, +e.getAttribute('id') || 0);
  const s = el(S.deck.pres, 'p:sldId', { id: String(max + 1) });
  s.setAttributeNS(NS.r, 'r:id', rid);
  const ref = kids(lst, 'sldId')[at];
  lst.insertBefore(s, ref || null);
}
function touchPres() { touch(S.deck.presPath); touch(S.deck.pkg.relsPath(S.deck.presPath)); touch('[Content_Types].xml'); }

// 슬라이드 XML 만들기(레이아웃의 개체 틀을 빈 틀로 가져온다)
function slideXml(layoutPath) {
  const pkg = S.deck.pkg;
  const ld = pkg.doc(layoutPath);
  const sps = [];
  let id = 2;
  for (const { el: sp, ph } of allPh(ld)) {
    const t = phType(ph);
    if (['dt', 'ftr', 'sldNum', 'hdr'].includes(t)) continue;
    const nm = attr(kid(nvOf(sp), 'cNvPr'), 'name', '개체 틀');
    const phA = [ph.hasAttribute('type') ? `type="${esc(ph.getAttribute('type'))}"` : '', ph.hasAttribute('orient') ? `orient="${esc(ph.getAttribute('orient'))}"` : '', ph.hasAttribute('sz') ? `sz="${esc(ph.getAttribute('sz'))}"` : '', ph.hasAttribute('idx') ? `idx="${esc(ph.getAttribute('idx'))}"` : ''].filter(Boolean).join(' ');
    const txt = ['pic', 'chart', 'tbl', 'clipArt', 'dgm', 'media', 'sldImg'].includes(t) ? '' : '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR" altLang="en-US" dirty="0"/></a:p></p:txBody>';
    sps.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id++}" name="${esc(nm)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${phA}/></p:nvPr></p:nvSpPr><p:spPr/>${txt}</p:sp>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${sps.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function newSlide(layoutPath, at) {
  const pkg = S.deck.pkg;
  const path = pkg.freeName('ppt/slides/slide', 'xml');
  touch(path); touch(pkg.relsPath(path)); touchPres();
  pkg.setDoc(path, parseXML(slideXml(layoutPath)));
  pkg.setDoc(pkg.relsPath(path), parseXML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="${NS.rel}"/>`));
  pkg.addRel(path, REL.layout, layoutPath);
  pkg.setOverride(path, CT.slide);
  addSlideRef(path, at);
  return path;
}
function layoutsOf(masterPath) {
  const pkg = S.deck.pkg;
  const md = pkg.doc(masterPath);
  const lst = md && kid(md.documentElement, 'sldLayoutIdLst');
  return kids(lst, 'sldLayoutId').map(e => pkg.rel(masterPath, rAttr(e, 'id'))).filter(r => r && pkg.doc(r.target)).map(r => r.target);
}
function allMasters() {
  const pkg = S.deck.pkg;
  return kids(kid(presRoot(), 'sldMasterIdLst'), 'sldMasterId').map(e => pkg.rel(S.deck.presPath, rAttr(e, 'id'))).filter(r => r && pkg.doc(r.target)).map(r => r.target);
}
// 지금 슬라이드와 비슷한 다음 레이아웃: 제목 슬라이드 뒤에는 '제목 및 내용'
function defaultLayout(masterPath, curLayout) {
  const list = layoutsOf(masterPath);
  if (!list.length) return null;
  const type = p => attr(S.deck.pkg.doc(p).documentElement, 'type', '');
  if (curLayout && type(curLayout) !== 'title') return curLayout;
  return list.find(p => type(p) === 'obj') || list.find(p => type(p) === 'tx') || list[Math.min(1, list.length - 1)];
}
async function addSlideDialog() {
  if (!S.deck) return;
  if (S.editing) endTextEdit(true);
  const curPath = S.deck.slides[S.cur];
  const info = curPath ? S.deck.info(curPath) : null;
  const masters = allMasters();
  const master = info && info.masterPath ? info.masterPath : masters[0];
  if (!master) { toast('이 파일에는 슬라이드 마스터가 없어 새 슬라이드를 만들 수 없습니다.', 4000); return; }
  const layouts = masters.flatMap(m => layoutsOf(m).map(l => ({ m, l })));
  const lw = 132, lh = Math.round(lw * S.deck.H / S.deck.W);
  let picked = null;
  const grid = h('div', { class: 'layouts' }, layouts.map(({ l }) => {
    const nm = attr(path(S.deck.pkg.doc(l).documentElement, 'cSld'), 'name', '레이아웃');
    const lv = h('div', { class: 'lv', style: `width:${lw}px;height:${lh}px` });
    try {
      const sl = renderSlide(S.deck, l, { slideNo: S.cur + 2 });
      sl.style.transform = `scale(${lw / S.deck.W})`;
      for (const n of [...sl.children]) if (n._x && phOf(n._x) && !n.classList.contains('deco')) { const t = phType(phOf(n._x)); if (['dt', 'ftr', 'sldNum', 'hdr'].includes(t)) n.remove(); else n.style.outline = `${S.deck.W / lw}px dashed #a0a7b0`; }
      lv.append(sl);
    } catch (e) { console.warn(e); }
    return h('button', { type: 'button', title: nm, onclick: () => { picked = l; $('#dialog .btn.primary').click(); } }, lv, h('div', { class: 'lvn', text: nm }));
  }));
  const r = await dialog('새 슬라이드 — 레이아웃 고르기', grid, [['취소', null], ['기본 레이아웃으로', 'default', true]]);
  if (r == null) return;
  const lay = picked || defaultLayout(master, info && info.layoutPath);
  if (!lay) return;
  addSlideWith(lay);
}
function addSlideWith(layoutPath) {
  const at = S.deck.slides.length ? S.cur + 1 : 0;
  act('새 슬라이드', () => { newSlide(layoutPath, at); S.cur = at; S.sel = []; }, { all: true });
}

// ── 복제: 슬라이드와 그 슬라이드만 쓰는 부분(메모·차트·SmartArt 등)을 함께 복사 ──
const SHARED_REL = new Set([REL.image, REL.layout, REL.master, REL.notesMaster, REL.theme, REL.hyperlink, REL.slide,
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio',
  'http://schemas.microsoft.com/office/2007/relationships/media', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/handoutMaster']);
function ctOf(path) {
  const t = S.deck.pkg.types.documentElement;
  const o = kids(t, 'Override').find(x => x.getAttribute('PartName') === '/' + path);
  return o ? o.getAttribute('ContentType') : null;
}
async function clonePart(src, newPath, backFrom, backTo, seen) {
  const pkg = S.deck.pkg;
  seen.set(src, newPath);
  const d = pkg.doc(src);
  if (d) pkg.setDoc(newPath, parseXML(xmlString(d)));
  else { const b = await pkg.bytes(src); if (b) pkg.setBin(newPath, new Uint8Array(b)); }
  const ct = ctOf(src); if (ct) pkg.setOverride(newPath, ct);
  const rels = pkg.rels(src);
  if (!rels.length) return;
  const rd = parseXML(`<Relationships xmlns="${NS.rel}"/>`);
  for (const r of rels) {
    const e = rd.importNode(r.el, true);
    if (r.mode !== 'External') {
      let target = r.target;
      if (backFrom && target === backFrom) target = backTo;
      else if (!SHARED_REL.has(r.type) && pkg.has(target)) {
        if (!seen.has(target)) {
          const m = /^(.*?)(\d*)\.([a-z0-9]+)$/i.exec(target);
          const np = pkg.freeName(m ? m[1] : target + '_', m ? m[3] : 'bin');
          await clonePart(target, np, null, null, seen);
        }
        target = seen.get(target);
      }
      e.setAttribute('Target', relativePath(dirOf(newPath), target));
    }
    rd.documentElement.append(e);
  }
  pkg.setDoc(pkg.relsPath(newPath), rd);
}
async function duplicateSlide() {
  if (!S.deck || !S.deck.slides.length) return;
  if (S.editing) endTextEdit(true);
  flushNotes();
  const pkg = S.deck.pkg;
  const src = S.deck.slides[S.cur];
  // 바이너리 부분까지 비동기로 미리 복사한 뒤 실행 취소 묶음에 넣는다
  const before = new Set([...pkg.xml.keys()]);
  const types0 = xmlString(pkg.types);
  const newPath = pkg.freeName('ppt/slides/slide', 'xml');
  const seen = new Map();
  // 메모: 슬라이드를 가리키는 되돌림 관계를 새 슬라이드로
  await clonePartForSlide(src, newPath, seen);
  const added = [...pkg.xml.keys()].filter(k => !before.has(k));
  H.cur = { label: '슬라이드 복제', before: new Map([...added.map(k => [k, null]), ['[Content_Types].xml', types0]]), cur: S.cur, selIds: [] };
  touch(S.deck.presPath); touch(pkg.relsPath(S.deck.presPath));
  addSlideRef(newPath, S.cur + 1);
  const t = H.cur; H.cur = null;
  t.after = new Map([...t.before.keys()].map(p => { const d = pkg.doc(p); return [p, d ? xmlString(d) : null]; }));
  S.cur++; S.sel = [];
  t.curAfter = S.cur; H.undo.push(t); H.redo = [];
  setDirty(true); refresh('all');
}
async function clonePartForSlide(src, newPath, seen) {
  const pkg = S.deck.pkg;
  seen.set(src, newPath);
  pkg.setDoc(newPath, parseXML(xmlString(pkg.doc(src))));
  pkg.setOverride(newPath, CT.slide);
  const rd = parseXML(`<Relationships xmlns="${NS.rel}"/>`);
  for (const r of pkg.rels(src)) {
    const e = rd.importNode(r.el, true);
    if (r.mode !== 'External' && !SHARED_REL.has(r.type) && pkg.has(r.target)) {
      const m = /^(.*?)(\d*)\.([a-z0-9]+)$/i.exec(r.target);
      const np = pkg.freeName(m ? m[1] : r.target + '_', m ? m[3] : 'bin');
      await clonePart(r.target, np, src, newPath, seen);
      e.setAttribute('Target', relativePath(dirOf(newPath), np));
    }
    rd.documentElement.append(e);
  }
  pkg.setDoc(pkg.relsPath(newPath), rd);
}

// ── 삭제: 목록과 관계만 지운다(부분은 저장할 때 쓰이지 않으면 빠진다 → 실행 취소가 쉽다) ──
async function deleteSlide() {
  const d = S.deck; if (!d || !d.slides.length) return;
  if (S.editing) endTextEdit(false);
  const n = d.slides.length;
  act('슬라이드 삭제', () => {
    touchPres();
    const lst = sldIdLst();
    const e = kids(lst, 'sldId')[S.cur];
    const rid = rAttr(e, 'id');
    e.remove();
    d.pkg.removeRel(d.presPath, rid);
    S.sel = [];
    if (S.cur >= n - 1) S.cur = Math.max(0, n - 2);
  }, { all: true });
}
function moveSlide(from, to) {
  act('슬라이드 순서', () => {
    touch(S.deck.presPath);
    const lst = sldIdLst();
    const items = kids(lst, 'sldId');
    const e = items[from];
    e.remove();
    const rest = kids(lst, 'sldId');
    lst.insertBefore(e, rest[to] || null);
    S.cur = to; S.sel = [];
  }, { all: true });
}
function toggleHidden() {
  const p = S.deck.slides[S.cur]; if (!p) return;
  act('슬라이드 숨기기', () => {
    touch(p);
    const r = S.deck.pkg.doc(p).documentElement;
    if (attr(r, 'show') === '0') r.removeAttribute('show'); else r.setAttribute('show', '0');
  });
}

// ── 메모(발표자 노트) ──
function notesPathOf(slidePath) {
  const r = S.deck.pkg.relOfType(slidePath, REL.notes);
  return r && S.deck.pkg.doc(r.target) ? r.target : null;
}
function notesBody(doc) {
  const list = allPh(doc);
  const b = list.find(x => phType(x.ph) === 'body');
  return b ? b.el : null;
}
function notesText(slidePath) {
  const np = slidePath && notesPathOf(slidePath);
  if (!np) return '';
  const sp = notesBody(S.deck.pkg.doc(np));
  const tb = sp && kid(sp, 'txBody');
  if (!tb) return '';
  return kids(tb, 'p').map(p => kids(p).map(k => ln(k) === 'br' ? '\n' : (ln(k) === 'r' || ln(k) === 'fld') ? (kid(k, 't') || {}).textContent || '' : '').join('')).join('\n');
}
let notesTimer = 0;
function renderNotes() {
  const ta = $('#notesText');
  const p = S.deck.slides[S.cur];
  ta.disabled = !p;
  const t = p ? notesText(p) : '';
  if (ta.value !== t) ta.value = t;
  ta._for = p;
}
function onNotesInput() { clearTimeout(notesTimer); notesTimer = setTimeout(flushNotes, 900); }
function flushNotes() {
  clearTimeout(notesTimer);
  const ta = $('#notesText');
  const p = ta._for;
  if (!S.deck || !p || !S.deck.slides.includes(p)) return;
  const text = ta.value.replace(/\r\n?/g, '\n');
  if (text === notesText(p)) return;
  const keepCur = S.cur;
  act('메모', () => { writeNotes(p, text); });
  S.cur = keepCur;
}
function writeNotes(slidePath, text) {
  const pkg = S.deck.pkg;
  let np = notesPathOf(slidePath);
  if (!np) { if (!text) return; np = createNotes(slidePath); }
  touch(np);
  const doc = pkg.doc(np);
  let sp = notesBody(doc);
  if (!sp) { sp = notesBodySp(doc, 3); spTreeOf(doc).append(sp); }
  let tb = kid(sp, 'txBody');
  if (!tb) { tb = el(doc, 'p:txBody'); tb.append(el(doc, 'a:bodyPr'), el(doc, 'a:lstStyle')); sp.append(tb); }
  const old = kids(tb, 'p');
  const fr = old.map(p => kid(kid(p, 'r'), 'rPr')).find(Boolean);
  for (const p of old) p.remove();
  for (const line of text.split('\n')) {
    const p = el(doc, 'a:p');
    if (line) {
      const r = el(doc, 'a:r');
      r.append(fr ? fr.cloneNode(true) : el(doc, 'a:rPr', { lang: 'ko-KR', altLang: 'en-US', dirty: '0' }));
      const t = el(doc, 'a:t'); t.textContent = line; r.append(t);
      p.append(r);
    } else p.append(el(doc, 'a:endParaRPr', { lang: 'ko-KR', altLang: 'en-US', dirty: '0' }));
    tb.append(p);
  }
}
function notesBodySp(doc, id) {
  return parseXML(`<p:sp xmlns:a="${NS.a}" xmlns:p="${NS.p}"><p:nvSpPr><p:cNvPr id="${id}" name="Notes Placeholder ${id - 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR" altLang="en-US" dirty="0"/></a:p></p:txBody></p:sp>`).documentElement;
}
function ensureNotesMaster() {
  const pkg = S.deck.pkg, pp = S.deck.presPath;
  const r = pkg.relOfType(pp, REL.notesMaster);
  if (r && pkg.doc(r.target)) return r.target;
  touchPres();
  const nm = pkg.freeName('ppt/notesMasters/notesMaster', 'xml');
  touch(nm); touch(pkg.relsPath(nm));
  pkg.setDoc(nm, parseXML(NOTES_MASTER_XML));
  // 테마는 첫 슬라이드 마스터의 것을 복사
  const m0 = allMasters()[0];
  const tr = m0 && pkg.relOfType(m0, REL.theme);
  const th = pkg.freeName('ppt/theme/theme', 'xml');
  touch(th);
  pkg.setDoc(th, parseXML(tr && pkg.doc(tr.target) ? xmlString(pkg.doc(tr.target)) : `<a:theme xmlns:a="${NS.a}" name="Office"/>`));
  pkg.setOverride(th, 'application/vnd.openxmlformats-officedocument.theme+xml');
  pkg.setDoc(pkg.relsPath(nm), parseXML(`<Relationships xmlns="${NS.rel}"/>`));
  pkg.addRel(nm, REL.theme, th);
  pkg.setOverride(nm, 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml');
  const rid = pkg.addRel(pp, REL.notesMaster, nm);
  const root = presRoot();
  let lst = kid(root, 'notesMasterIdLst');
  if (!lst) { lst = el(S.deck.pres, 'p:notesMasterIdLst'); const after = kid(root, 'sldMasterIdLst'); if (after) after.after(lst); else root.insertBefore(lst, root.firstChild); }
  for (const e of kids(lst)) e.remove();
  const id = el(S.deck.pres, 'p:notesMasterId'); id.setAttributeNS(NS.r, 'r:id', rid); lst.append(id);
  return nm;
}
function createNotes(slidePath) {
  const pkg = S.deck.pkg;
  const nm = ensureNotesMaster();
  const np = pkg.freeName('ppt/notesSlides/notesSlide', 'xml');
  touch(np); touch(pkg.relsPath(np)); touch(pkg.relsPath(slidePath)); touch('[Content_Types].xml');
  const doc = parseXML(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
  spTreeOf(doc).append(doc.importNode(notesBodySp(doc, 3), true));
  pkg.setDoc(np, doc);
  pkg.setDoc(pkg.relsPath(np), parseXML(`<Relationships xmlns="${NS.rel}"/>`));
  pkg.addRel(np, REL.notesMaster, nm);
  pkg.addRel(np, REL.slide, slidePath);
  pkg.addRel(slidePath, REL.notes, np);
  pkg.setOverride(np, CT.notes);
  return np;
}
