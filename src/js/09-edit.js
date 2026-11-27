// ───────────────────────── 편집: 선택·이동·크기·회전·글자·서식·넣기 ─────────────────────────
const curPart = () => S.deck.slides[S.cur];
const curDoc = () => S.deck.pkg.doc(curPart());
const curTree = () => spTreeOf(curDoc());
const curInfo = () => S.deck.info(curPart());
const slidePt = e => { const r = $('#stage').getBoundingClientRect(); return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom }; };

// mc:AlternateContent 안의 도형을 고치면 그 껍데기를 벗겨 PowerPoint 가 고친 내용을 쓰게 한다
function ensurePlain(x) {
  const p = x.parentNode;
  if (p && (ln(p) === 'Fallback' || ln(p) === 'Choice')) {
    const ac = p.parentNode;
    ac.parentNode.replaceChild(x, ac);
  }
  return x;
}
const rawOf = x => { const p = x.parentNode; return p && (ln(p) === 'Fallback' || ln(p) === 'Choice') ? p.parentNode : x; };

// ── 위치·크기(EMU) 읽고 쓰기 ──
function getBox(x) { return boxOf(x, curInfo()); }
function setBox(x, b) {
  const doc = x.ownerDocument;
  const k = ln(x);
  let xf;
  if (k === 'graphicFrame') {
    xf = kid(x, 'xfrm');
    if (!xf) { xf = el(doc, 'p:xfrm'); const nv = nvOf(x); nv.after(xf); }
  } else {
    const prName = k === 'grpSp' ? 'grpSpPr' : 'spPr';
    let pr = kid(x, prName);
    if (!pr) { pr = el(doc, 'p:' + prName); nvOf(x).after(pr); }
    xf = kid(pr, 'xfrm');
    if (!xf) { xf = el(doc, 'a:xfrm'); pr.insertBefore(xf, pr.firstChild); }
  }
  // 그룹: 처음 바꿀 때 자식 좌표계를 지금 크기로 고정
  if (k === 'grpSp' && !kid(xf, 'chOff')) {
    const old = getBox(x) || b;
    xf.append(el(doc, 'a:chOff', { x: old.x, y: old.y }), el(doc, 'a:chExt', { cx: old.w, cy: old.h }));
  }
  let off = kid(xf, 'off'), ext = kid(xf, 'ext');
  if (!off) { off = el(doc, 'a:off'); xf.insertBefore(off, xf.firstChild); }
  if (!ext) { ext = el(doc, 'a:ext'); off.after(ext); }
  off.setAttribute('x', Math.round(b.x)); off.setAttribute('y', Math.round(b.y));
  ext.setAttribute('cx', Math.max(0, Math.round(b.w))); ext.setAttribute('cy', Math.max(0, Math.round(b.h)));
  if (b.rot != null) { const r = Math.round(((b.rot % 360) + 360) % 360 * 60000); if (r) xf.setAttribute('rot', r); else xf.removeAttribute('rot'); }
  // 표는 열 너비·행 높이도 같은 비율로
  if (k === 'graphicFrame' && b._scaleTable) {
    const tbl = desc(x, 'tbl');
    if (tbl) {
      for (const c of kids(kid(tbl, 'tblGrid'), 'gridCol')) c.setAttribute('w', Math.round(num(c, 'w', 0) * b._scaleTable.sx));
      for (const r of kids(tbl, 'tr')) r.setAttribute('h', Math.round(num(r, 'h', 0) * b._scaleTable.sy));
    }
  }
}

// ── 선택 표시 ──
function drawSel() {
  const ov = $('#overlay');
  ov.replaceChildren();
  if (!S.deck) return;
  const hs = 9 / S.zoom;
  ov.style.setProperty('--hs', hs + 'px');
  const one = S.sel.length === 1;
  for (const x of S.sel) {
    const n = nodeOf(x); if (!n) continue;
    const b = getBox(x) || { rot: 0 };
    const box = h('div', { class: 'selbox' + (one ? '' : ' multi') });
    Object.assign(box.style, { left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height, borderWidth: 1 / S.zoom + 'px' });
    if (b.rot) box.style.transform = `rotate(${b.rot}deg)`;
    if (one && !S.editing) {
      for (const [k, l, t] of [['nw', 0, 0], ['n', 50, 0], ['ne', 100, 0], ['e', 100, 50], ['se', 100, 100], ['s', 50, 100], ['sw', 0, 100], ['w', 0, 50]]) {
        box.append(h('div', { class: 'hd', dataset: { h: k }, style: `left:${l}%;top:${t}%;cursor:${cursorFor(k, b.rot)}` }));
      }
      if (ln(x) !== 'cxnSp') {
        box.append(h('div', { class: 'rotline', style: `top:${-22 / S.zoom}px;height:${22 / S.zoom}px;width:${1 / S.zoom}px` }));
        box.append(h('div', { class: 'hd rot', dataset: { h: 'rot' }, style: `left:50%;top:${-22 / S.zoom}px;cursor:grab` }));
      }
    }
    ov.append(box);
  }
}
function cursorFor(k, rot) {
  const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const i = (dirs.indexOf(k) + Math.round((rot || 0) / 45) + 8) % 8;
  return ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'][i];
}
function select(list) { S.sel = list; drawSel(); updateToolbar(); updateStatus(); }

// ── 마우스·손가락 ──
let drag = null;
function onPointerDown(e) {
  if (!S.deck || (e.button !== 0 && e.pointerType === 'mouse')) return;
  const ed = S.editing;
  if (ed && ed.node.contains(e.target)) return;
  let target = e.target;
  if (ed) {
    endTextEdit(true);
    // 다시 그려져 눌린 요소가 바뀌었으면 그 자리의 새 요소로
    if (!target.isConnected) target = document.elementFromPoint(e.clientX, e.clientY) || target;
  }
  if (!target.closest || !target.closest('#stageWrap')) return;
  const p = slidePt(e);
  const hd = target.closest('.hd');
  if (hd && S.sel.length === 1) { startHandle(hd.dataset.h, p, e); return; }
  const node = target.closest('.slide.edit .obj');
  if (node) {
    const x = node._x;
    const was = S.sel.length === 1 && S.sel[0] === x;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { select(S.sel.includes(x) ? S.sel.filter(s => s !== x) : [...S.sel, x]); if (!S.sel.includes(x)) return; }
    else if (!S.sel.includes(x)) select([x]);
    drag = { kind: 'move', p0: p, moved: false, was, empty: node.classList.contains('empty-ph'), cx: e.clientX, cy: e.clientY, items: S.sel.map(s => ({ x: s, n: nodeOf(s), l: parseFloat(nodeOf(s).style.left), t: parseFloat(nodeOf(s).style.top) })) };
  } else {
    if (!(e.shiftKey || e.ctrlKey)) select([]);
    drag = { kind: 'marquee', p0: p, keep: e.shiftKey || e.ctrlKey ? S.sel.slice() : [] };
  }
  e.preventDefault();
}
function onPointerMove(e) {
  if (!drag) return;
  const p = slidePt(e);
  const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
  if (drag.kind === 'move') {
    if (!drag.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
    drag.moved = true;
    const sn = snapMove(drag, dx, dy, e.altKey);
    for (const it of drag.items) { it.n.style.left = it.l + sn.dx + 'px'; it.n.style.top = it.t + sn.dy + 'px'; }
    drag.dx = sn.dx; drag.dy = sn.dy;
    drawSel(); drawGuides(sn.guides);
  } else if (drag.kind === 'marquee') {
    const r = { x: Math.min(p.x, drag.p0.x), y: Math.min(p.y, drag.p0.y), w: Math.abs(dx), h: Math.abs(dy) };
    drag.r = r;
    let m = $('#overlay .marquee');
    if (!m) { m = h('div', { class: 'marquee' }); $('#overlay').append(m); }
    Object.assign(m.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderWidth: 1 / S.zoom + 'px' });
  } else if (drag.kind === 'resize' || drag.kind === 'rotate') {
    drag.cur = drag.kind === 'resize' ? resizeBox(drag, dx, dy, e.shiftKey) : rotateBox(drag, p, e.shiftKey);
    previewBox(drag.cur);
  }
}
function onPointerUp(e) {
  const d = drag; drag = null;
  if (!d) return;
  drawGuides([]);
  // 이미 고른 도형의 글자를 한 번 더 누르거나, 빈 개체 틀을 누르면 바로 글자 편집
  if (d.kind === 'move' && !d.moved && (d.was || d.empty) && S.sel.length === 1 && e && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    const n = nodeOf(S.sel[0]);
    const onText = n && n._tx && (d.empty || [...n._tx.querySelectorAll('.r')].some(r => { const b = r.getBoundingClientRect(); return d.cx >= b.left - 2 && d.cx <= b.right + 2 && d.cy >= b.top - 2 && d.cy <= b.bottom + 2; }));
    if (onText) { startTextEdit(n._tx, n, S.sel[0], { clientX: d.cx, clientY: d.cy }); return; }
  }
  if (d.kind === 'move' && d.moved && (d.dx || d.dy)) {
    act('이동', () => {
      touch(curPart());
      for (const it of d.items) { const x = ensurePlain(it.x); const b = getBox(x); if (b) setBox(x, { ...b, x: b.x + toEmu(d.dx), y: b.y + toEmu(d.dy) }); }
    });
  } else if (d.kind === 'move' && d.moved) { refresh('cur'); }
  else if (d.kind === 'marquee') {
    const m = $('#overlay .marquee'); if (m) m.remove();
    if (d.r && d.r.w * S.zoom > 3) {
      const inside = [...$('#slideHost .slide').querySelectorAll(':scope > .obj')].filter(n => { const l = parseFloat(n.style.left), t = parseFloat(n.style.top), w = parseFloat(n.style.width), hh = parseFloat(n.style.height); return l >= d.r.x && t >= d.r.y && l + w <= d.r.x + d.r.w && t + hh <= d.r.y + d.r.h; }).map(n => n._x);
      select([...new Set([...d.keep, ...inside])]);
    } else drawSel();
  } else if ((d.kind === 'resize' || d.kind === 'rotate') && d.cur) {
    const c = d.cur;
    act(d.kind === 'resize' ? '크기 조절' : '회전', () => {
      touch(curPart());
      const x = ensurePlain(d.x);
      const nb = { x: toEmu(c.x), y: toEmu(c.y), w: toEmu(c.w), h: toEmu(c.h), rot: c.rot };
      if (ln(x) === 'graphicFrame' && desc(x, 'tbl') && d.kind === 'resize') nb._scaleTable = { sx: c.w / d.b.w, sy: c.h / d.b.h };
      setBox(x, nb);
    });
  }
}
// 이동할 때 슬라이드 가운데·가장자리·다른 도형에 맞춤
function snapMove(d, dx, dy, off) {
  if (off) return { dx, dy, guides: [] };
  const th = 6 / S.zoom;
  const W = S.deck.W, H = S.deck.H;
  const bb = d.items.reduce((a, it) => { const w = parseFloat(it.n.style.width), hh = parseFloat(it.n.style.height); return { l: Math.min(a.l, it.l), t: Math.min(a.t, it.t), r: Math.max(a.r, it.l + w), b: Math.max(a.b, it.t + hh) }; }, { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
  const xs = [0, W / 2, W], ys = [0, H / 2, H];
  for (const n of $('#slideHost .slide').querySelectorAll(':scope > .obj')) {
    if (d.items.some(it => it.n === n)) continue;
    const l = parseFloat(n.style.left), t = parseFloat(n.style.top), w = parseFloat(n.style.width), hh = parseFloat(n.style.height);
    xs.push(l, l + w / 2, l + w); ys.push(t, t + hh / 2, t + hh);
  }
  const best = (vals, cand) => { let r = null; for (const v of vals) for (const c of cand) { const dd = c - v; if (Math.abs(dd) < th && (!r || Math.abs(dd) < Math.abs(r.d))) r = { d: dd, at: c }; } return r; };
  const g = [];
  const bx = best([bb.l + dx, (bb.l + bb.r) / 2 + dx, bb.r + dx], xs), by = best([bb.t + dy, (bb.t + bb.b) / 2 + dy, bb.b + dy], ys);
  if (bx) { dx += bx.d; g.push({ x: bx.at }); }
  if (by) { dy += by.d; g.push({ y: by.at }); }
  return { dx, dy, guides: g };
}
function drawGuides(list) {
  for (const e of $$('#overlay .guide')) e.remove();
  for (const gd of list) {
    const e = h('div', { class: 'guide' });
    if (gd.x != null) Object.assign(e.style, { left: gd.x + 'px', top: 0, width: 1 / S.zoom + 'px', height: S.deck.H + 'px' });
    else Object.assign(e.style, { top: gd.y + 'px', left: 0, height: 1 / S.zoom + 'px', width: S.deck.W + 'px' });
    $('#overlay').append(e);
  }
}
function startHandle(k, p, e) {
  const x = S.sel[0], n = nodeOf(x);
  const b = { x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: parseFloat(n.style.width), h: parseFloat(n.style.height), rot: (getBox(x) || {}).rot || 0 };
  const keep = ln(x) === 'pic' || !!desc(nvOf(x), 'picLocks');
  drag = k === 'rot' ? { kind: 'rotate', x, b, p0: p } : { kind: 'resize', x, b, p0: p, k, keepAspect: keep && k.length === 2 };
  e.preventDefault();
}
function resizeBox(d, dx, dy, shift) {
  const b = d.b, th = b.rot * Math.PI / 180;
  const cos = Math.cos(th), sin = Math.sin(th);
  const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;      // 도형 안쪽 좌표로
  const hx = d.k.includes('e') ? 1 : d.k.includes('w') ? -1 : 0, hy = d.k.includes('s') ? 1 : d.k.includes('n') ? -1 : 0;
  let w = b.w + hx * lx, hh = b.h + hy * ly;
  const minS = 2;
  if ((d.keepAspect || shift) && hx && hy && b.w && b.h) { const s = Math.max(w / b.w, hh / b.h); w = b.w * s; hh = b.h * s; }
  w = Math.max(minS, w); hh = Math.max(minS, hh);
  // 반대쪽 점을 제자리에
  const ax = -hx * b.w / 2, ay = -hy * b.h / 2;
  const cx0 = b.x + b.w / 2, cy0 = b.y + b.h / 2;
  const gx = cx0 + ax * cos - ay * sin, gy = cy0 + ax * sin + ay * cos;
  const ax2 = -hx * w / 2, ay2 = -hy * hh / 2;
  const cx = gx - (ax2 * cos - ay2 * sin), cy = gy - (ax2 * sin + ay2 * cos);
  return { x: cx - w / 2, y: cy - hh / 2, w, h: hh, rot: b.rot };
}
function rotateBox(d, p, shift) {
  const b = d.b, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
  if (shift) a = Math.round(a / 15) * 15;
  else for (const s of [0, 90, 180, 270, 360]) if (Math.abs(a - s) < 3) a = s;
  return { ...b, rot: ((a % 360) + 360) % 360 };
}
function previewBox(c) {
  const box = $('#overlay .selbox');
  if (!box) return;
  Object.assign(box.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', transform: c.rot ? `rotate(${c.rot}deg)` : '' });
  const n = nodeOf(S.sel[0]);
  if (n && drag && drag.kind === 'rotate') n.style.transform = c.rot ? `rotate(${c.rot}deg)` : '';
}

// ── 글자 편집 ──
function onDblClick(e) {
  if (!S.deck || S.editing) return;
  const node = e.target.closest('.slide.edit .obj');
  if (!node) return;
  const td = e.target.closest('td');
  if (td && node.contains(td) && td._tc) { const tx = td.querySelector(':scope > .tx'); if (tx) startTextEdit(tx, node, td._tc, e); return; }
  if (node.classList.contains('grp') || node.classList.contains('dgm')) {
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map(n => n.closest && n.closest('.shp')).find(n => n && n !== node && node.contains(n) && n._tx);
    if (hit && !node.classList.contains('dgm')) startTextEdit(hit._tx, node, hit._x, e);
    else if (node.classList.contains('dgm')) toast('SmartArt 글자는 PowerPoint 에서 고쳐 주세요.');
    return;
  }
  if (node._tx) { startTextEdit(node._tx, node, node._x, e); return; }
  if (ln(node._x) === 'sp') {
    const x = node._x;
    act('글자 넣기', () => { touch(curPart()); ensurePlain(x); x.append(newTxBody(x.ownerDocument, { center: true })); });
    const n2 = nodeOf(x);
    if (n2 && n2._tx) startTextEdit(n2._tx, n2, x, null);
  }
}
function newTxBody(doc, { center = false, color = null, sz = null, wrap = true } = {}) {
  const tb = el(doc, 'p:txBody');
  const bp = el(doc, 'a:bodyPr', { rtlCol: '0', anchor: center ? 'ctr' : null, wrap: wrap ? null : 'none' });
  if (!center) bp.append(el(doc, 'a:spAutoFit'));
  tb.append(bp, el(doc, 'a:lstStyle'));
  const p = el(doc, 'a:p');
  if (center) p.append(el(doc, 'a:pPr', { algn: 'ctr' }));
  const end = el(doc, 'a:endParaRPr', { lang: 'ko-KR', altLang: 'en-US', sz: sz ? String(sz) : null, dirty: '0' });
  if (color) { const f = el(doc, 'a:solidFill'); f.append(el(doc, 'a:schemeClr', { val: color })); end.append(f); }
  p.append(end);
  tb.append(p);
  return tb;
}
function startTextEdit(tx, node, owner, evt, opt = {}) {
  const inner = tx._inner;
  if (!inner) return;
  S.sel = [node._x];
  S.editing = { inner, node, owner, part: curPart(), html0: inner.innerHTML };
  node.classList.add('editing');
  inner.contentEditable = 'true';
  inner.spellcheck = false;
  inner.focus({ preventScroll: true });
  try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (er) { /* 무시 */ }
  const sel = getSelection();
  let range = null;
  if (!opt.selectAll && evt && document.caretRangeFromPoint) range = document.caretRangeFromPoint(evt.clientX, evt.clientY);
  if (!range || !inner.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(inner); if (!opt.selectAll) range.collapse(false); }
  sel.removeAllRanges(); sel.addRange(range);
  drawSel(); updateToolbar(); updateStatus();
}
function endTextEdit(commit = true) {
  const ed = S.editing;
  if (!ed) return;
  S.editing = null;
  ed.inner.contentEditable = 'false';
  ed.node.classList.remove('editing');
  const s = getSelection(); if (s && ed.inner.contains(s.anchorNode)) s.removeAllRanges();
  const changed = ed.inner.innerHTML !== ed.html0;
  const top = ed.node._x;
  const isBox = ed.owner === top && ln(top) === 'sp' && attr(desc(nvOf(top), 'cNvSpPr'), 'txBox') === '1';
  const text = ed.inner.textContent.replace(/[​\s]/g, '');
  if (commit && changed) {
    act('글자 고치기', () => {
      touch(ed.part);
      ensurePlain(top);
      writeTextBack(ed.inner);
      if (isBox && !text) { rawOf(top).remove(); S.sel = []; }
    });
  } else if (isBox && !text && ed.node._newBox) {
    act('빈 텍스트 상자 지우기', () => { touch(ed.part); rawOf(top).remove(); S.sel = []; });
  } else { drawSel(); updateToolbar(); updateStatus(); }
}

// 편집한 화면 → XML 문단·글자 조각
function collectBlocks(inner) {
  const blocks = [];
  const isBlock = n => n.nodeType === 1 && /^(DIV|P|LI|H\d|BLOCKQUOTE|UL|OL|TABLE)$/.test(n.tagName);
  const walk = (e, list) => {
    let loose = null;
    for (const c of [...e.childNodes]) {
      if (isBlock(c)) {
        loose = null;
        if ([...c.childNodes].some(isBlock)) walk(c, list);
        else list.push({ el: c, nodes: [...c.childNodes] });
      } else {
        if (!loose) { loose = { el: e === inner ? null : e, nodes: [] }; list.push(loose); }
        loose.nodes.push(c);
      }
    }
  };
  walk(inner, blocks);
  return blocks.filter(b => !(b.nodes.every(n => n.nodeType === 3 && !n.textContent.trim()) && !b.el && blocks.length > 1));
}
function inlineItems(nodes) {
  const out = [];
  const visit = n => {
    if (n.nodeType === 3) { const t = n.textContent.replace(/​/g, '').replace(/ /g, ' '); if (t) out.push({ type: 'text', node: n, text: t }); return; }
    if (n.nodeType !== 1) return;
    if (n.classList.contains('bu')) return;
    if (n.tagName === 'BR') { out.push({ type: 'br', node: n }); return; }
    if (n.dataset && n.dataset.fld) { out.push({ type: 'fld', node: n }); return; }
    for (const c of n.childNodes) visit(c);
  };
  nodes.forEach(visit);
  if (out.length && out[out.length - 1].type === 'br') out.pop();
  return out;
}
const rgbHex = s => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? (m[4] === '0' ? '' : [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase()) : ''; };
const normFF = s => String(s || '').replace(/["'\s]/g, '').toLowerCase();
const firstFamily = s => String(s || '').split(',')[0].replace(/["']/g, '').trim();
function decoOf(e, stop) {
  let u = false, s = false;
  for (let n = e; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    const d = getComputedStyle(n).textDecorationLine || '';
    if (d.includes('underline')) u = true;
    if (d.includes('line-through')) s = true;
    if (n.tagName === 'U') u = true;
    if (n.tagName === 'S' || n.tagName === 'STRIKE') s = true;
  }
  return { u, s };
}
function writeTextBack(inner) {
  let txBody = inner._txBody;
  const owner = S.editing ? S.editing.owner : null;
  if (!txBody) throw new Error('글자 상자를 찾지 못했습니다');
  void owner;
  const doc = txBody.ownerDocument;
  const paras = inner._paras || [], runs = inner._runs || [], scale = inner._scale || 1;
  const blocks = collectBlocks(inner);
  const out = [];
  let lastPi = 0;
  for (const blk of blocks) {
    const pEl = blk.el && (blk.el.dataset.pi != null ? blk.el : blk.el.closest('.p'));
    const pi = pEl && pEl.dataset.pi != null ? +pEl.dataset.pi : lastPi;
    lastPi = pi;
    const origP = paras[pi] || paras[paras.length - 1] || null;
    const p = el(doc, 'a:p');
    let pPr = origP && kid(origP, 'pPr') ? kid(origP, 'pPr').cloneNode(true) : null;
    const ref = blk.el || inner;
    const now = CSS_ALGN[getComputedStyle(ref).textAlign] || 'l';
    const was = pEl ? pEl.dataset.algn : null;
    if (was && now !== was) { pPr = pPr || el(doc, 'a:pPr'); pPr.setAttribute('algn', now); }
    if (pPr) p.append(pPr);
    const items = inlineItems(blk.nodes);
    let cur = null;
    for (const it of items) {
      if (it.type === 'br') { const br = el(doc, 'a:br'); const rp = rPrFor(it.node.parentElement, pEl, pi, paras, runs, doc, scale, inner); if (rp) br.append(rp); p.append(br); cur = null; continue; }
      if (it.type === 'fld') { const opi = +(it.node.dataset.pi || pi), ori = +it.node.dataset.ri; const orig = runs[opi] && runs[opi][ori]; if (orig) p.append(orig.cloneNode(true)); cur = null; continue; }
      const rp = rPrFor(it.node.parentElement, pEl, pi, paras, runs, doc, scale, inner);
      const key = rp ? new XMLSerializer().serializeToString(rp) : '';
      if (cur && cur.key === key) { cur.t.textContent += it.text; continue; }
      const r = el(doc, 'a:r'); if (rp) r.append(rp);
      const t = el(doc, 'a:t'); t.textContent = it.text; r.append(t);
      p.append(r);
      cur = { key, t };
    }
    const end = origP && kid(origP, 'endParaRPr');
    if (end) p.append(end.cloneNode(true));
    out.push(p);
  }
  for (const old of kids(txBody, 'p')) old.remove();
  if (!out.length) out.push(el(doc, 'a:p'));
  for (const p of out) txBody.append(p);
}
function rPrFor(elem, pEl, pi, paras, runs, doc, scale, inner) {
  const span = elem.closest('.r');
  const useSpan = span && inner.contains(span);
  const rec = useSpan ? span.dataset : pEl ? pEl.dataset : {};
  let base = null;
  if (useSpan) { const r = runs[+span.dataset.pi] && runs[+span.dataset.pi][+span.dataset.ri]; base = r ? kid(r, 'rPr') : null; }
  else { const op = paras[pi]; const fr = op && kids(op).find(k => ln(k) === 'r'); base = (fr && kid(fr, 'rPr')) || (op && kid(op, 'endParaRPr')) || null; }
  let rPr = null;
  if (base) {
    rPr = el(doc, 'a:rPr');
    for (const a of base.attributes) rPr.setAttribute(a.name, a.value);
    for (const c of base.childNodes) rPr.append(c.cloneNode(true));
  }
  const cs = getComputedStyle(elem);
  const deco = decoOf(elem, inner);
  const now = { b: (+cs.fontWeight || 400) >= 600 ? '1' : '0', i: cs.fontStyle === 'italic' ? '1' : '0', u: deco.u ? '1' : '0', s: deco.s ? '1' : '0', c: rgbHex(cs.color), szpx: parseFloat(cs.fontSize), ff: cs.fontFamily };
  const need = () => (rPr = rPr || el(doc, 'a:rPr', { lang: 'ko-KR', altLang: 'en-US' }));
  if (rec.b != null && now.b !== rec.b) need().setAttribute('b', now.b);
  if (rec.i != null && now.i !== rec.i) need().setAttribute('i', now.i);
  if (rec.u != null && now.u !== rec.u) need().setAttribute('u', now.u === '1' ? 'sng' : 'none');
  if (rec.s != null && now.s !== rec.s) need().setAttribute('strike', now.s === '1' ? 'sngStrike' : 'noStrike');
  if (rec.szpx != null && Math.abs(now.szpx - +rec.szpx) > 0.25) need().setAttribute('sz', String(Math.max(100, Math.round(now.szpx * 72 / 96 / scale * 10) * 10)));
  if (rec.c != null && now.c && now.c !== rec.c) { need(); setRunColor(rPr, now.c); }
  if (rec.ff != null && normFF(now.ff) !== normFF(rec.ff)) { need(); setRunFont(rPr, firstFamily(now.ff)); }
  return rPr;
}
function setRunColor(rPr, hex) {
  const doc = rPr.ownerDocument;
  for (const f of kids(rPr).filter(k => ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'].includes(ln(k)))) f.remove();
  const f = el(doc, 'a:solidFill'); f.append(el(doc, 'a:srgbClr', { val: hex }));
  setKid(rPr, f, RPR_ORDER);
}
function setRunFont(rPr, face) {
  const doc = rPr.ownerDocument;
  for (const n of ['latin', 'ea']) setKid(rPr, el(doc, 'a:' + n, { typeface: face }), RPR_ORDER);
}

// ── 서식: 글자 편집 중이면 고른 부분에, 아니면 고른 도형의 글자 전체에 ──
function textHostsOf(x) {
  const out = [];
  const walk = e => {
    const k = ln(e);
    if (k === 'sp') { const t = kid(e, 'txBody'); if (t) out.push(t); }
    else if (k === 'grpSp') kids(e).map(altPick).filter(Boolean).forEach(walk);
    else if (k === 'graphicFrame') for (const tc of e.getElementsByTagName('*')) if (ln(tc) === 'tc') { const t = kid(tc, 'txBody'); if (t) out.push(t); }
  };
  walk(x);
  return out;
}
function allRPr(txBody, create = true) {
  const doc = txBody.ownerDocument, out = [];
  for (const p of kids(txBody, 'p')) {
    for (const r of kids(p).filter(k => ['r', 'br', 'fld'].includes(ln(k)))) {
      let rp = kid(r, 'rPr');
      if (!rp && create) { rp = el(doc, 'a:rPr', { lang: 'ko-KR', altLang: 'en-US' }); r.insertBefore(rp, r.firstChild); }
      if (rp) out.push(rp);
    }
    let end = kid(p, 'endParaRPr');
    if (!end && create) { end = el(doc, 'a:endParaRPr', { lang: 'ko-KR', altLang: 'en-US' }); p.append(end); }
    if (end) out.push(end);
  }
  return out;
}
// 고른 도형들의 글자가 모두 그 서식인지(화면에 그린 값으로)
function allOn(flag) {
  const spans = S.sel.flatMap(x => { const n = nodeOf(x); return n ? [...n.querySelectorAll('.r')] : []; });
  return spans.length > 0 && spans.every(s => s.dataset[flag] === '1');
}
function format(cmd, val) {
  if (S.editing) return formatSelection(cmd, val);
  if (!S.sel.length) return;
  const on = { bold: 'b', italic: 'i', underline: 'u', strike: 's' }[cmd];
  const target = on ? !allOn(on) : null;
  act('서식', () => {
    touch(curPart());
    for (const x0 of S.sel) {
      const x = ensurePlain(x0);
      const node = nodeOf(x0);
      for (const tb of textHostsOf(x)) {
        if (cmd === 'align') { for (const p of kids(tb, 'p')) { let pp = kid(p, 'pPr'); if (!pp) { pp = el(tb.ownerDocument, 'a:pPr'); p.insertBefore(pp, p.firstChild); } pp.setAttribute('algn', val); } continue; }
        if (cmd === 'bullet' || cmd === 'number') { setBullets(tb, cmd, null, node); continue; }
        const sizes = cmd === 'grow' || cmd === 'shrink' ? runSizes(tb, node) : null;
        allRPr(tb).forEach((rp, i) => {
          if (on) rp.setAttribute(on === 's' ? 'strike' : on, on === 'u' ? (target ? 'sng' : 'none') : on === 's' ? (target ? 'sngStrike' : 'noStrike') : target ? '1' : '0');
          else if (cmd === 'size') rp.setAttribute('sz', String(Math.round(val * 100)));
          else if (cmd === 'grow' || cmd === 'shrink') rp.setAttribute('sz', String(stepSize(sizes[i] || 18, cmd === 'grow' ? 1 : -1) * 100));
          else if (cmd === 'color') setRunColor(rp, val);
          else if (cmd === 'font') setRunFont(rp, val);
        });
        if (cmd === 'size' || cmd === 'grow' || cmd === 'shrink') { const bp = kid(tb, 'bodyPr'); const na = bp && kid(bp, 'normAutofit'); if (na) { na.removeAttribute('fontScale'); na.removeAttribute('lnSpcReduction'); } }
      }
    }
  });
}
// 각 rPr 순서대로 지금 크기(pt) — 화면에 그린 값
function runSizes(tb, node) {
  const out = [];
  const spans = node ? [...node.querySelectorAll('.r')] : [];
  for (const [pi, p] of kids(tb, 'p').entries()) {
    const items = kids(p).filter(k => ['r', 'br', 'fld'].includes(ln(k)));
    const pd = node && node.querySelector(`.txi .p[data-pi="${pi}"]`);
    items.forEach((it, ri) => { const s = spans.find(sp => sp.dataset.pi === String(pi) && sp.dataset.ri === String(ri) && sp.closest('.txi') && sp.closest('.txi')._txBody === tb); out.push(s ? +s.dataset.sz / 100 : pd ? +pd.dataset.sz / 100 : 18); });
    out.push(pd ? +pd.dataset.sz / 100 : 18);
  }
  return out;
}
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
function stepSize(pt, dir) {
  if (dir > 0) return SIZES.find(s => s > pt + 0.01) || Math.round(pt * 1.1);
  return [...SIZES].reverse().find(s => s < pt - 0.01) || Math.max(1, Math.round(pt * 0.9));
}
// 글머리표·번호: 이미 있으면 없애고, 없으면 넣는다
function setBullets(tb, kind, only, node) {
  const doc = tb.ownerDocument;
  const paras = kids(tb, 'p');
  const has = paras.filter((p, i) => !only || only.includes(i)).every((p, i) => { const pd = node && node.querySelector(`.txi .p[data-pi="${only ? only[i] : i}"]`); const bu = pd && pd.querySelector('.bu'); return bu && (kind === 'number' ? /\d|[a-z]\.|①/i.test(bu.textContent) : !/\d/.test(bu.textContent)); });
  paras.forEach((p, i) => {
    if (only && !only.includes(i)) return;
    let pp = kid(p, 'pPr');
    if (!pp) { pp = el(doc, 'a:pPr'); p.insertBefore(pp, p.firstChild); }
    for (const k of kids(pp).filter(k => ['buNone', 'buAutoNum', 'buChar', 'buBlip', 'buFont', 'buFontTx'].includes(ln(k)))) k.remove();
    if (has) { setKid(pp, el(doc, 'a:buNone'), PPR_ORDER); if (!pp.hasAttribute('indent')) pp.setAttribute('indent', '0'); if (!pp.hasAttribute('marL')) pp.setAttribute('marL', '0'); }
    else {
      if (kind === 'number') setKid(pp, el(doc, 'a:buAutoNum', { type: 'arabicPeriod' }), PPR_ORDER);
      else { setKid(pp, el(doc, 'a:buFont', { typeface: 'Arial' }), PPR_ORDER); setKid(pp, el(doc, 'a:buChar', { char: '•' }), PPR_ORDER); }
      const lvl = num(pp, 'lvl', 0);
      if (!pp.hasAttribute('marL') || pp.getAttribute('marL') === '0') pp.setAttribute('marL', String(342900 + lvl * 457200));
      if (!pp.hasAttribute('indent') || pp.getAttribute('indent') === '0') pp.setAttribute('indent', '-342900');
    }
  });
}
function formatSelection(cmd, val) {
  const ed = S.editing;
  const inner = ed.inner;
  inner.focus({ preventScroll: true });
  const sel = getSelection();
  // 글꼴 상자 등으로 초점이 옮겨 갔다 오면 고른 부분을 되살린다
  if (ed.range && (!sel.rangeCount || !inner.contains(sel.anchorNode))) { sel.removeAllRanges(); sel.addRange(ed.range); }
  const ex = (c, v) => document.execCommand(c, false, v);
  if (cmd === 'bullet' || cmd === 'number') return;
  if (cmd === 'bold') ex('bold'); else if (cmd === 'italic') ex('italic'); else if (cmd === 'underline') ex('underline'); else if (cmd === 'strike') ex('strikeThrough');
  else if (cmd === 'color') ex('foreColor', '#' + val);
  else if (cmd === 'font') ex('fontName', val);
  else if (cmd === 'align') ex({ l: 'justifyLeft', ctr: 'justifyCenter', r: 'justifyRight', just: 'justifyFull' }[val]);
  else if (cmd === 'size' || cmd === 'grow' || cmd === 'shrink') {
    if (sel.isCollapsed) { const r = document.createRange(); r.selectNodeContents(inner); sel.removeAllRanges(); sel.addRange(r); }
    let pt = val;
    if (cmd !== 'size') { const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement); const cur = n ? parseFloat(getComputedStyle(n).fontSize) * 72 / 96 / (inner._scale || 1) : 18; pt = stepSize(cur, cmd === 'grow' ? 1 : -1); }
    ex('fontSize', '7');
    for (const e of inner.querySelectorAll('font[size="7"]')) { const s = h('span', { style: `font-size:${ptPx(pt * (inner._scale || 1))}px` }); while (e.firstChild) s.append(e.firstChild); e.replaceWith(s); }
    for (const e of inner.querySelectorAll('[style*="xxx-large"]')) e.style.fontSize = ptPx(pt * (inner._scale || 1)) + 'px';
    $('#fSize').value = pt;
  }
  updateToolbar();
}
function bulletsInEdit(kind) {
  const ed = S.editing;
  const sel = getSelection();
  const blocks = collectBlocks(ed.inner);
  const idx = [];
  blocks.forEach((b, i) => { if (b.el && sel.rangeCount && sel.getRangeAt(0).intersectsNode(b.el)) idx.push(i); });
  const x = ed.node._x;
  const tbOwner = ed.inner._txBody;
  endTextEdit(true);
  const node = nodeOf(x);
  act(kind === 'number' ? '번호 매기기' : '글머리 기호', () => { touch(curPart()); setBullets(tbOwner.isConnected ? tbOwner : textHostsOf(x)[0], kind, idx.length ? idx : null, node); });
}

// ── 도형 채우기·윤곽선 ──
function spPrOf(x) { const k = ln(x); if (k === 'grpSp') return kid(x, 'grpSpPr'); if (k === 'graphicFrame') return null; let pr = kid(x, 'spPr'); if (!pr) { pr = el(x.ownerDocument, 'p:spPr'); nvOf(x).after(pr); } return pr; }
function setShapeFill(hex) {
  if (!S.sel.length) return;
  act('채우기', () => {
    touch(curPart());
    for (const x0 of S.sel) {
      const x = ensurePlain(x0); const pr = spPrOf(x); if (!pr || ln(x) === 'pic' || ln(x) === 'cxnSp') continue;
      for (const f of kids(pr).filter(k => FILL_NAMES.includes(ln(k)))) f.remove();
      const doc = x.ownerDocument;
      let f;
      if (hex == null) f = el(doc, 'a:noFill'); else { f = el(doc, 'a:solidFill'); f.append(el(doc, 'a:srgbClr', { val: hex })); }
      setKid(pr, f, SPPR_ORDER);
    }
  });
}
function setShapeLine(hex, widthPt) {
  if (!S.sel.length) return;
  act('윤곽선', () => {
    touch(curPart());
    for (const x0 of S.sel) {
      const x = ensurePlain(x0); const pr = spPrOf(x); if (!pr || ln(x) === 'grpSp') continue;
      const doc = x.ownerDocument;
      let lnE = kid(pr, 'ln');
      if (!lnE) { lnE = el(doc, 'a:ln'); setKid(pr, lnE, SPPR_ORDER); }
      if (widthPt != null) {
        if (widthPt === 0) { for (const f of kids(lnE).filter(k => FILL_NAMES.includes(ln(k)))) f.remove(); lnE.insertBefore(el(doc, 'a:noFill'), lnE.firstChild); continue; }
        lnE.setAttribute('w', String(Math.round(widthPt * 12700)));
        if (kid(lnE, 'noFill')) { kid(lnE, 'noFill').remove(); const f = el(doc, 'a:solidFill'); f.append(el(doc, 'a:srgbClr', { val: '000000' })); lnE.insertBefore(f, lnE.firstChild); }
        if (!findFill(lnE)) { const f = el(doc, 'a:solidFill'); const c = lineOf(lnE, { ...curInfo(), theme: curInfo().theme, clrMap: curInfo().clrMap }, kid(kid(x, 'style'), 'lnRef')); f.append(el(doc, 'a:srgbClr', { val: c && c.color ? toHex(c.color) : '000000' })); lnE.insertBefore(f, lnE.firstChild); }
      }
      if (hex != null) {
        for (const f of kids(lnE).filter(k => FILL_NAMES.includes(ln(k)))) f.remove();
        const f = el(doc, 'a:solidFill'); f.append(el(doc, 'a:srgbClr', { val: hex }));
        lnE.insertBefore(f, lnE.firstChild);
        if (!lnE.hasAttribute('w')) lnE.setAttribute('w', '12700');
      }
    }
  });
}

// ── 새 개체 넣기 ──
function nextId(tree) {
  let m = 1;
  for (const e of tree.ownerDocument.getElementsByTagName('*')) if (ln(e) === 'cNvPr') m = Math.max(m, +e.getAttribute('id') || 0);
  return m + 1;
}
function addToTree(x) { curTree().append(x); return x; }
function nvSp(doc, id, name, { txBox = false, pic = false, cxn = false } = {}) {
  const nv = el(doc, pic ? 'p:nvPicPr' : cxn ? 'p:nvCxnSpPr' : 'p:nvSpPr');
  nv.append(el(doc, 'p:cNvPr', { id: String(id), name }));
  const c = el(doc, pic ? 'p:cNvPicPr' : cxn ? 'p:cNvCxnSpPr' : 'p:cNvSpPr', { txBox: txBox ? '1' : null });
  if (pic) c.append(el(doc, 'a:picLocks', { noChangeAspect: '1' }));
  nv.append(c, el(doc, 'p:nvPr'));
  return nv;
}
function xfrmEl2(doc, b, tag = 'a:xfrm') {
  const x = el(doc, tag);
  x.append(el(doc, 'a:off', { x: Math.round(b.x), y: Math.round(b.y) }), el(doc, 'a:ext', { cx: Math.round(b.w), cy: Math.round(b.h) }));
  return x;
}
function insertTextBox() {
  if (!S.deck.slides.length) return;
  let made;
  act('텍스트 상자', () => {
    touch(curPart());
    const doc = curDoc(), tree = curTree();
    const id = nextId(tree);
    const W = toEmu(S.deck.W), Hh = toEmu(S.deck.H);
    const sp = el(doc, 'p:sp');
    sp.append(nvSp(doc, id, `TextBox ${id - 1}`, { txBox: true }));
    const pr = el(doc, 'p:spPr');
    pr.append(xfrmEl2(doc, { x: W * 0.25, y: Hh * 0.42, w: W * 0.5, h: 457200 }));
    const g = el(doc, 'a:prstGeom', { prst: 'rect' }); g.append(el(doc, 'a:avLst')); pr.append(g, el(doc, 'a:noFill'));
    sp.append(pr, newTxBody(doc, { sz: 2400 }));
    made = addToTree(sp);
    S.sel = [sp];
  });
  const n = nodeOf(made);
  if (n && n._tx) { n._newBox = true; startTextEdit(n._tx, n, made, null); }
}
function insertShape(prst) {
  if (!S.deck.slides.length) return;
  act('도형 넣기', () => {
    touch(curPart());
    const doc = curDoc(), tree = curTree();
    const id = nextId(tree);
    const W = toEmu(S.deck.W), Hh = toEmu(S.deck.H);
    const isLine = prst === 'line' || prst === 'arrowLine';
    const w = isLine ? W * 0.3 : Math.min(W, Hh) * 0.3, hh = isLine ? 0 : Math.min(W, Hh) * 0.22;
    const b = { x: (W - w) / 2, y: (Hh - hh) / 2, w, h: hh };
    const sp = el(doc, isLine ? 'p:cxnSp' : 'p:sp');
    sp.append(nvSp(doc, id, isLine ? `Straight Connector ${id - 1}` : `Shape ${id - 1}`, { cxn: isLine }));
    const pr = el(doc, 'p:spPr');
    pr.append(xfrmEl2(doc, b));
    const g = el(doc, 'a:prstGeom', { prst: isLine ? (prst === 'arrowLine' ? 'straightConnector1' : 'line') : prst }); g.append(el(doc, 'a:avLst')); pr.append(g);
    const scheme = (tag, mods) => { const f = el(doc, tag); const c = el(doc, 'a:schemeClr', { val: 'accent1' }); if (mods) c.append(el(doc, 'a:shade', { val: '50000' })); f.append(c); return f; };
    if (!isLine) pr.append(scheme('a:solidFill'));
    const lnE = el(doc, 'a:ln', { w: isLine ? '28575' : '12700' });
    lnE.append(scheme('a:solidFill', !isLine));
    if (prst === 'arrowLine') lnE.append(el(doc, 'a:tailEnd', { type: 'triangle' }));
    pr.append(lnE);
    sp.append(pr);
    if (!isLine) sp.append(newTxBody(doc, { center: true, color: 'lt1' }));
    addToTree(sp);
    S.sel = [sp];
  });
}
async function insertImageFile(file) {
  if (!file || !S.deck.slides.length) return;
  let ext = (extOf(file.name) || (file.type.split('/')[1] || 'png')).replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  if (!['png', 'jpg', 'gif', 'bmp', 'svg', 'webp', 'tif', 'tiff'].includes(ext)) ext = 'png';
  let buf = new Uint8Array(await file.arrayBuffer());
  let size;
  try {
    const url = URL.createObjectURL(file);
    size = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 }); im.onerror = rej; im.src = url; });
    // PowerPoint 가 못 읽는 webp 는 PNG 로 바꾼다
    if (ext === 'webp') { const c = document.createElement('canvas'); c.width = size.w; c.height = size.h; const im = new Image(); im.src = url; await im.decode(); c.getContext('2d').drawImage(im, 0, 0); buf = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); ext = 'png'; }
  } catch (e) { toast('그림을 읽을 수 없습니다.'); return; }
  const pkg = S.deck.pkg;
  const mpath = pkg.freeName('ppt/media/image', ext);
  pkg.setBin(mpath, buf);
  await pkg.url(mpath);
  act('그림 넣기', () => {
    touch(curPart()); touch(pkg.relsPath(curPart())); touch('[Content_Types].xml');
    pkg.ensureDefault(ext, MIME[ext] || 'image/png');
    const rid = pkg.addRel(curPart(), REL.image, mpath);
    const doc = curDoc(), tree = curTree();
    const id = nextId(tree);
    const W = S.deck.W, Hh = S.deck.H;
    const k = Math.min(1, W * 0.7 / size.w, Hh * 0.7 / size.h);
    const w = size.w * k, hh = size.h * k;
    const pic = el(doc, 'p:pic');
    pic.append(nvSp(doc, id, `Picture ${id - 1}`, { pic: true }));
    const bf = el(doc, 'p:blipFill');
    const blip = el(doc, 'a:blip'); blip.setAttributeNS(NS.r, 'r:embed', rid);
    const str = el(doc, 'a:stretch'); str.append(el(doc, 'a:fillRect'));
    bf.append(blip, str);
    const pr = el(doc, 'p:spPr');
    pr.append(xfrmEl2(doc, { x: toEmu((W - w) / 2), y: toEmu((Hh - hh) / 2), w: toEmu(w), h: toEmu(hh) }));
    const g = el(doc, 'a:prstGeom', { prst: 'rect' }); g.append(el(doc, 'a:avLst')); pr.append(g);
    pic.append(bf, pr);
    addToTree(pic);
    S.sel = [pic];
  });
}
function insertTable(rows, cols) {
  act('표 넣기', () => {
    touch(curPart());
    const doc = curDoc(), tree = curTree();
    const id = nextId(tree);
    const W = toEmu(S.deck.W), Hh = toEmu(S.deck.H);
    const w = W * 0.8, rh = 370840, hh = rh * rows;
    const gf = el(doc, 'p:graphicFrame');
    const nv = el(doc, 'p:nvGraphicFramePr');
    nv.append(el(doc, 'p:cNvPr', { id: String(id), name: `Table ${id - 1}` }));
    const cg = el(doc, 'p:cNvGraphicFramePr'); cg.append(el(doc, 'a:graphicFrameLocks', { noGrp: '1' }));
    nv.append(cg, el(doc, 'p:nvPr'));
    gf.append(nv, xfrmEl2(doc, { x: (W - w) / 2, y: Math.max(0, (Hh - hh) / 2), w, h: hh }, 'p:xfrm'));
    const gr = el(doc, 'a:graphic'), gd = el(doc, 'a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/table' });
    const tbl = el(doc, 'a:tbl');
    const tp = el(doc, 'a:tblPr', { firstRow: '1', bandRow: '1' });
    const sid = el(doc, 'a:tableStyleId'); sid.textContent = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}'; tp.append(sid);
    const grid = el(doc, 'a:tblGrid');
    for (let c = 0; c < cols; c++) grid.append(el(doc, 'a:gridCol', { w: String(Math.round(w / cols)) }));
    tbl.append(tp, grid);
    for (let r = 0; r < rows; r++) {
      const tr = el(doc, 'a:tr', { h: String(rh) });
      for (let c = 0; c < cols; c++) {
        const tc = el(doc, 'a:tc');
        const tb = el(doc, 'a:txBody'); tb.append(el(doc, 'a:bodyPr'), el(doc, 'a:lstStyle'));
        const p = el(doc, 'a:p'); p.append(el(doc, 'a:endParaRPr', { lang: 'ko-KR', altLang: 'en-US', dirty: '0' })); tb.append(p);
        tc.append(tb, el(doc, 'a:tcPr'));
        tr.append(tc);
      }
      tbl.append(tr);
    }
    gd.append(tbl); gr.append(gd); gf.append(gr);
    addToTree(gf);
    S.sel = [gf];
  });
}

// ── 지우기·순서·복제·복사 ──
function deleteSel() {
  if (!S.sel.length) return;
  act('지우기', () => { touch(curPart()); for (const x of S.sel) rawOf(x).remove(); S.sel = []; });
}
function zOrder(front) {
  if (!S.sel.length) return;
  act(front ? '맨 앞으로' : '맨 뒤로', () => {
    touch(curPart());
    const tree = curTree();
    const items = S.sel.map(rawOf);
    if (front) for (const r of items) tree.append(r);
    else { const anchor = kid(tree, 'grpSpPr'); let after = anchor; for (const r of items) { after.after(r); after = r; } }
  });
}
// 복사: 요소 글 + 관계(그림 등) 정보
function copySel() {
  if (!S.sel.length) return false;
  const pkg = S.deck.pkg, part = curPart();
  S.clip = { part, items: S.sel.map(x => { const raw = rawOf(x); return { xml: new XMLSerializer().serializeToString(raw), rels: relRefs(raw).map(id => pkg.rel(part, id)).filter(Boolean).map(r => ({ id: r.id, type: r.type, target: r.target, external: r.mode === 'External' })) }; }) };
  return true;
}
function relRefs(x) {
  const out = new Set();
  for (const e of [x, ...x.getElementsByTagName('*')]) for (const a of e.attributes) if (a.namespaceURI === NS.r) out.add(a.value);
  return [...out];
}
function pasteClip() {
  const c = S.clip;
  if (!c || !S.deck.slides.length) return;
  const pkg = S.deck.pkg, part = curPart();
  const same = c.part === part;
  act('붙여넣기', () => {
    touch(part); touch(pkg.relsPath(part));
    const doc = curDoc(), tree = curTree();
    const added = [];
    let id = nextId(tree);
    for (const it of c.items) {
      const wrap = parseXML(`<w xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}" xmlns:mc="${NS.mc}" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">${it.xml}</w>`);
      if (wrap.getElementsByTagName('parsererror').length) continue;
      const x = doc.importNode(wrap.documentElement.firstElementChild, true);
      const map = {};
      for (const r of it.rels) map[r.id] = pkg.addRel(part, r.type, r.target, r.external);
      for (const e of [x, ...x.getElementsByTagName('*')]) for (const a of [...e.attributes]) if (a.namespaceURI === NS.r && map[a.value]) e.setAttributeNS(NS.r, a.name, map[a.value]);
      for (const e of [x, ...x.getElementsByTagName('*')]) if (ln(e) === 'cNvPr') { e.setAttribute('id', String(id++)); const xl = kid(e, 'extLst'); if (xl) xl.remove(); }   // 만든 시각 id(creationId)는 겹치지 않게 뺀다
      tree.append(x);
      const pl = altPick(x);
      if (same) { const b = getBox(pl); if (b) setBox(pl, { ...b, x: b.x + 190500, y: b.y + 190500 }); }
      added.push(pl);
    }
    S.sel = added;
    c.part = same ? c.part + '#' : c.part;   // 다시 붙여넣으면 또 비켜 놓는다
    if (same) { c.items = added.map(x => { const raw = rawOf(x); return { xml: new XMLSerializer().serializeToString(raw), rels: relRefs(raw).map(i => pkg.rel(part, i)).filter(Boolean).map(r => ({ id: r.id, type: r.type, target: r.target, external: r.mode === 'External' })) }; }); c.part = part; }
  });
}
function duplicateSel() { if (copySel()) pasteClip(); }
function nudge(dx, dy) {
  if (!S.sel.length) return;
  if (!nudge.t) { H.cur = { label: '이동', before: new Map(), cur: S.cur, selIds: selIds() }; }
  touch(curPart());
  for (const x0 of S.sel) { const x = ensurePlain(x0); const b = getBox(x); if (b) setBox(x, { ...b, x: b.x + toEmu(dx), y: b.y + toEmu(dy) }); }
  renderCurrent();
  clearTimeout(nudge.t);
  nudge.t = setTimeout(() => {
    nudge.t = 0;
    const t = H.cur; H.cur = null;
    if (t) { t.after = new Map([...t.before.keys()].map(p => [p, xmlString(S.deck.pkg.doc(p))])); t.curAfter = S.cur; H.undo.push(t); H.redo = []; setDirty(true); updateThumb(S.cur); updateStatus(); }
  }, 700);
}
