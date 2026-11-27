// ───────────────────────── 슬라이드 그리기 ─────────────────────────
let _defN = 0;
const defId = p => p + (++_defN);

function xfrmEl(e) {
  const n = ln(e);
  if (n === 'graphicFrame') return kid(e, 'xfrm');
  if (n === 'grpSp') return path(e, 'grpSpPr', 'xfrm');
  return path(e, 'spPr', 'xfrm');
}
// 위치·크기(EMU). 개체 틀이 자기 위치가 없으면 레이아웃 → 마스터 순서로 물려받는다
function boxOf(e, info) {
  let x = xfrmEl(e);
  let inherited = false;
  if (!x || !kid(x, 'off')) {
    for (const anc of phChain(info, e).reverse()) { const ax = xfrmEl(anc); if (ax && kid(ax, 'off')) { x = ax; inherited = true; break; } }
  }
  if (!x || !kid(x, 'off')) return null;
  const off = kid(x, 'off'), ext = kid(x, 'ext');
  return { x: num(off, 'x', 0), y: num(off, 'y', 0), w: num(ext, 'cx', 0), h: num(ext, 'cy', 0), rot: num(x, 'rot', 0) / 60000, flipH: bool(x, 'flipH'), flipV: bool(x, 'flipV'), inherited };
}
// mc:AlternateContent → 그릴 요소(대체 요소 우선)
function altPick(e) {
  if (ln(e) !== 'AlternateContent') return e;
  const fb = kid(e, 'Fallback');
  const c = fb ? kids(fb)[0] : kids(kid(e, 'Choice'))[0];
  return c || null;
}

// 배경: 슬라이드 → 레이아웃 → 마스터
function backgroundOf(info, ctx) {
  for (const d of [info.doc, info.layoutDoc, info.masterDoc]) {
    const bg = d && path(d.documentElement, 'cSld', 'bg');
    if (!bg) continue;
    const pr = kid(bg, 'bgPr');
    const bctx = { ...ctx, part: d === info.doc ? info.path : d === info.layoutDoc ? info.layoutPath : info.masterPath };
    if (pr) { const fe = findFill(pr); if (fe) return fillOf(fe, bctx); continue; }   // 채우기 없는 bgPr 는 건너뛴다
    const ref = kid(bg, 'bgRef');
    if (ref) return styleFill(ref, bctx) || { type: 'solid', color: colorOf(ref, bctx) };
  }
  return { type: 'solid', color: hexRgb('FFFFFF') };
}
function cssFill(f, deck) {
  if (!f || f.type === 'none') return 'transparent';
  if (f.type === 'solid') return css(f.color);
  if (f.type === 'grad') {
    const st = f.stops.map(s => `${css(s.color)} ${s.pos}%`).join(', ');
    return f.radial ? `radial-gradient(circle, ${st})` : `linear-gradient(${(f.angle + 90) % 360}deg, ${st})`;
  }
  if (f.type === 'blip') { const u = blipUrl(f, deck); return u ? `center / ${f.tile ? 'auto' : '100% 100%'} ${f.tile ? 'repeat' : 'no-repeat'} url("${u}")` : '#ddd'; }
  if (f.type === 'patt') return css(mix(f.fg, f.bg, pattRatio(f.prst)));
  return 'transparent';
}
const pattRatio = p => { const m = /pct(\d+)/.exec(p || ''); return m ? +m[1] / 100 : 0.5; };
const mix = (a, b, t) => ({ r: a.r * t + b.r * (1 - t), g: a.g * t + b.g * (1 - t), b: a.b * t + b.b * (1 - t), a: 1 });
function blipUrl(f, deck) {
  if (!f.rid || !f.part) return null;
  const r = deck.pkg.rel(f.part, f.rid);
  return r ? deck.pkg.urlNow(r.target) : null;
}

// 슬라이드 하나 → div.slide
function renderSlide(deck, partPath, opts = {}) {
  const info = deck.info(partPath);
  const root = h('div', { class: 'slide' });
  root.style.width = deck.W + 'px'; root.style.height = deck.H + 'px';
  const ctx = { deck, info, theme: info.theme, clrMap: info.clrMap, part: partPath, editable: !!opts.editable, slideNo: opts.slideNo || (deck.slides.indexOf(partPath) + 1) };
  const bgf = backgroundOf(info, ctx);
  root.style.background = !bgf || bgf.type === 'none' ? '#fff' : cssFill(bgf, deck);
  if (!root.style.backgroundColor || root.style.backgroundColor === 'transparent') root.style.backgroundColor = '#fff';
  const top = { cx: 0, cy: 0, sx: 1, sy: 1 };
  const showMaster = attr(info.doc.documentElement, 'showMasterSp', '1') !== '0';
  // 슬라이드: 마스터 → 레이아웃 꾸밈, 레이아웃 미리보기: 마스터 꾸밈
  if ((info.kind === 'sld' || info.kind === 'sldLayout') && showMaster && info.layoutDoc && attr(info.layoutDoc.documentElement, 'showMasterSp', '1') !== '0' && info.masterDoc) {
    renderTree(spTreeOf(info.masterDoc), { ...ctx, part: info.masterPath, deco: true, info: deck.info(info.masterPath) }, top, root);
  }
  if (info.kind === 'sld' && showMaster && info.layoutDoc) renderTree(spTreeOf(info.layoutDoc), { ...ctx, part: info.layoutPath, deco: true, info: deck.info(info.layoutPath) }, top, root);
  renderTree(spTreeOf(info.doc), ctx, top, root);
  return root;
}

function renderTree(tree, ctx, map, parent) {
  if (!tree) return;
  for (const raw of kids(tree)) {
    const n = ln(raw);
    if (n === 'nvGrpSpPr' || n === 'grpSpPr' || n === 'extLst') continue;
    const e = altPick(raw);
    if (!e) continue;
    // 마스터·레이아웃의 개체 틀은 그리지 않는다(슬라이드가 물려받아 쓰는 틀)
    if (ctx.deco && phOf(e)) continue;
    let node = null;
    try {
      const k = ln(e);
      if (k === 'sp' || k === 'cxnSp') node = renderSp(e, ctx, map);
      else if (k === 'pic') node = renderPic(e, ctx, map);
      else if (k === 'grpSp') node = renderGrp(e, ctx, map);
      else if (k === 'graphicFrame') node = renderFrame(e, ctx, map);
      else if (k === 'contentPart') node = null;
    } catch (err) { console.warn('도형 그리기 실패', err); }
    if (!node) continue;
    node._x = e; node._raw = raw;
    if (ctx.deco) node.classList.add('deco');
    else if (ctx.editable && !ctx.inDiagram) node.classList.add('obj');
    parent.append(node);
  }
}

// EMU 상자 → 부모 안 px 위치
function place(node, b, map) {
  const x = (b.x - map.cx) * map.sx / EMU_PX, y = (b.y - map.cy) * map.sy / EMU_PX;
  const w = b.w * map.sx / EMU_PX, hh = b.h * map.sy / EMU_PX;
  const s = node.style;
  s.left = x + 'px'; s.top = y + 'px'; s.width = Math.max(0, w) + 'px'; s.height = Math.max(0, hh) + 'px';
  if (b.rot) s.transform = `rotate(${b.rot}deg)`;
  return { w, h: hh };
}

function shapeStyleCtx(e, ctx) {
  const st = kid(e, 'style');
  return {
    fillRef: st && kid(st, 'fillRef'), lnRef: st && kid(st, 'lnRef'), fontRef: st && kid(st, 'fontRef'),
  };
}

function renderSp(e, ctx, map) {
  const info = ctx.info;
  const b = boxOf(e, info);
  if (!b) return null;
  const node = h('div', { class: 'shp' });
  const { w, h: hh } = place(node, b, map);
  const spPr = kid(e, 'spPr');
  const chain = phChain(info, e);
  const st = shapeStyleCtx(e, ctx);
  // 모양: 자기 것 → 물려받은 것
  let geoSrc = spPr;
  if (!kid(spPr, 'prstGeom') && !kid(spPr, 'custGeom')) geoSrc = chain.map(a => kid(a, 'spPr')).reverse().find(x => x && (kid(x, 'prstGeom') || kid(x, 'custGeom'))) || spPr;
  const geo = shapeGeom(geoSrc, w, hh);
  // 채우기·선
  let fillE = findFill(spPr);
  if (!fillE) for (const a of chain.slice().reverse()) { fillE = findFill(kid(a, 'spPr')); if (fillE) break; }
  let fill = fillE ? fillOf(fillE, ctx) : st.fillRef ? styleFill(st.fillRef, ctx) : null;
  let lnE = kid(spPr, 'ln');
  if (!lnE) for (const a of chain.slice().reverse()) { lnE = kid(kid(a, 'spPr'), 'ln'); if (lnE) break; }
  const line = lineOf(lnE, ctx, st.lnRef);
  if (geo.line) fill = null;
  const svg = drawGeom(geo, fill, line, w, hh, ctx, b, shadowOf(e, ctx, chain));
  if (svg) node.append(svg);
  // 글자
  const txBody = kid(e, 'txBody');
  if (txBody || (ctx.editable && phOf(e))) {
    const tctx = textCtx(e, ctx, txBody);
    const tb = { w, h: hh };
    const txX = kid(e, 'txXfrm');   // SmartArt 의 글자 영역
    if (txX) {
      const o = kid(txX, 'off'), x2 = kid(txX, 'ext');
      tb.tl = (num(o, 'x', 0) - b.x) / EMU_PX; tb.tt = (num(o, 'y', 0) - b.y) / EMU_PX;
      tb.tr = w - tb.tl - num(x2, 'cx', 0) / EMU_PX; tb.tb = hh - tb.tt - num(x2, 'cy', 0) / EMU_PX;
    } else if (geo.tr) { tb.tl = geo.tr[0] * w; tb.tt = geo.tr[1] * hh; tb.tr = geo.tr[2] * w; tb.tb = geo.tr[3] * hh; }
    const tx = renderText(txBody, tctx, tb);
    if (tctx.bp.rot) tx.style.transform = `rotate(${tctx.bp.rot}deg)`;
    if (b.flipV && b.rot === 0) tx.style.transform = 'rotate(180deg)';
    node.append(tx);
    // 빈 개체 틀: 편집 화면에서만 안내 글
    if (tx._empty && phOf(e) && ctx.editable) {
      const t = normPh(phType(phOf(e)));
      if (!['dt', 'ftr', 'sldNum', 'hdr'].includes(t)) {
        node.classList.add('empty-ph');
        tx.dataset.prompt = t === 'title' ? '제목을 입력하려면 클릭' : phType(phOf(e)) === 'subTitle' ? '부제목을 입력하려면 클릭' : '텍스트를 입력하려면 클릭';
      }
    }
    node._tx = tx;
  }
  return node;
}

// 바깥 그림자(outerShdw): 도형 자신 → 물려받은 것 → 테마 효과 서식
function shadowOf(e, ctx, chain) {
  let eff = kid(kid(e, 'spPr'), 'effectLst');
  if (!eff) for (const a of chain.slice().reverse()) { eff = kid(kid(a, 'spPr'), 'effectLst'); if (eff) break; }
  let phClr = null;
  if (!eff && !kid(kid(e, 'spPr'), 'effectDag')) {
    const ref = kid(kid(e, 'style'), 'effectRef');
    const idx = num(ref, 'idx', 0);
    const es = idx > 0 && ctx.theme.effect ? ctx.theme.effect[idx - 1] : null;
    if (es) { eff = kid(es, 'effectLst'); if (kids(ref).length) phClr = colorOf(ref, ctx); }
  }
  const sh = eff && kid(eff, 'outerShdw');
  if (!sh) return null;
  const c = colorOf(sh, phClr ? { ...ctx, phClr } : ctx);
  if (!c || c.a === 0) return null;
  const blur = px(num(sh, 'blurRad', 0)), dist = px(num(sh, 'dist', 0)), dir = num(sh, 'dir', 0) / 60000 * Math.PI / 180;
  return { dx: dist * Math.cos(dir), dy: dist * Math.sin(dir), blur, color: c };
}

function textCtx(e, ctx, txBody) {
  const st = shapeStyleCtx(e, ctx);
  const ts = textSources(ctx.info, e, ctx.deck, txBody);
  return {
    ts, ctx, bp: bodyProps(ctx.info, e, txBody), slideNo: ctx.slideNo,
    fontRefColor: st.fontRef && kids(st.fontRef).length ? colorOf(st.fontRef, ctx) : null,
    fontRefIdx: st.fontRef ? attr(st.fontRef, 'idx', 'minor') : null,
  };
}

// 모양 SVG
function drawGeom(geo, fill, line, w, hh, ctx, b, shadow) {
  if (!geo || !geo.paths.length) return null;
  const NSV = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NSV, 'svg');
  svg.setAttribute('class', 'geo');
  svg.setAttribute('width', Math.max(1, w)); svg.setAttribute('height', Math.max(1, hh));
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, w)} ${Math.max(1, hh)}`);
  const sx = (b.flipH ? -1 : 1) * (geo.flipX ? -1 : 1), sy = b.flipV ? -1 : 1;
  const defs = document.createElementNS(NSV, 'defs');
  svg.append(defs);
  const g = document.createElementNS(NSV, 'g');
  if (sx < 0 || sy < 0) g.setAttribute('transform', `translate(${sx < 0 ? w : 0},${sy < 0 ? hh : 0}) scale(${sx},${sy})`);
  // 그림자: SVG 필터(CSS filter 는 묶음 가장자리에 줄이 생기는 경우가 있다)
  let outer = g;
  if (shadow) {
    const id = defId('s');
    const f = document.createElementNS(NSV, 'filter');
    f.setAttribute('id', id); f.setAttribute('x', '-50%'); f.setAttribute('y', '-50%'); f.setAttribute('width', '200%'); f.setAttribute('height', '200%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const ds = document.createElementNS(NSV, 'feDropShadow');
    ds.setAttribute('dx', shadow.dx.toFixed(2)); ds.setAttribute('dy', shadow.dy.toFixed(2)); ds.setAttribute('stdDeviation', (shadow.blur / 2).toFixed(2));
    ds.setAttribute('flood-color', '#' + toHex(shadow.color)); ds.setAttribute('flood-opacity', shadow.color.a);
    f.append(ds); defs.append(f);
    outer = document.createElementNS(NSV, 'g');
    outer.setAttribute('filter', `url(#${id})`);
    outer.append(g);
  }
  svg.append(outer);
  let fillAttr = 'none', fillOp = null;
  if (fill && fill.type === 'solid') { fillAttr = '#' + toHex(fill.color); if (fill.color.a < 1) fillOp = fill.color.a; }
  else if (fill && fill.type === 'grad') {
    const id = defId('g');
    const gr = document.createElementNS(NSV, fill.radial ? 'radialGradient' : 'linearGradient');
    gr.setAttribute('id', id);
    if (!fill.radial) gr.setAttribute('gradientTransform', `rotate(${fill.angle} 0.5 0.5)`);
    for (const s of fill.stops) { const so = document.createElementNS(NSV, 'stop'); so.setAttribute('offset', s.pos + '%'); so.setAttribute('stop-color', '#' + toHex(s.color)); if (s.color.a < 1) so.setAttribute('stop-opacity', s.color.a); gr.append(so); }
    defs.append(gr); fillAttr = `url(#${id})`;
  } else if (fill && fill.type === 'blip') {
    const u = blipUrl(fill, ctx.deck);
    if (u) {
      const id = defId('b');
      const pat = document.createElementNS(NSV, 'pattern');
      pat.setAttribute('id', id); pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('width', w); pat.setAttribute('height', hh);
      const im = document.createElementNS(NSV, 'image');
      im.setAttribute('href', u); im.setAttribute('width', w); im.setAttribute('height', hh); im.setAttribute('preserveAspectRatio', 'none');
      pat.append(im); defs.append(pat); fillAttr = `url(#${id})`;
    }
  } else if (fill && fill.type === 'patt') fillAttr = '#' + toHex(mix(fill.fg, fill.bg, pattRatio(fill.prst)));
  const stroke = line && !line.none && line.color;
  const mk = (type, end) => {
    const id = defId('m');
    const m = document.createElementNS(NSV, 'marker');
    m.setAttribute('id', id); m.setAttribute('viewBox', '0 0 10 10'); m.setAttribute('refX', type === 'arrow' ? 9 : 5); m.setAttribute('refY', 5);
    m.setAttribute('markerWidth', 3.5); m.setAttribute('markerHeight', 3.5); m.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS(NSV, 'path');
    p.setAttribute('d', type === 'oval' ? 'M5,0 A5,5 0 1 1 4.99,0 Z' : type === 'diamond' ? 'M5,0 L10,5 L5,10 L0,5 Z' : type === 'arrow' ? 'M0,0 L10,5 L0,10' : type === 'stealth' ? 'M0,0 L10,5 L0,10 L3,5 Z' : 'M0,0 L10,5 L0,10 Z');
    if (type === 'arrow') { p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#' + toHex(line.color)); p.setAttribute('stroke-width', 1.5); }
    else p.setAttribute('fill', '#' + toHex(line.color));
    m.append(p); defs.append(m);
    void end;
    return `url(#${id})`;
  };
  geo.paths.forEach((pp, i) => {
    const p = document.createElementNS(NSV, 'path');
    p.setAttribute('d', pp.d || 'M0,0');
    let f = pp.fill ? fillAttr : 'none';
    if (pp.fill && pp.shade && fill && fill.type === 'solid') { const hsl = rgbHsl(fill.color); hsl.l = clamp(hsl.l * pp.shade, 0, 1); f = '#' + toHex(hslRgb(hsl)); }
    p.setAttribute('fill', f);
    if (fillOp != null && pp.fill) p.setAttribute('fill-opacity', fillOp);
    if (pp.evenodd) p.setAttribute('fill-rule', 'evenodd');
    if (stroke && pp.stroke !== false) {
      p.setAttribute('stroke', '#' + toHex(line.color));
      if (line.color.a < 1) p.setAttribute('stroke-opacity', line.color.a);
      p.setAttribute('stroke-width', line.width);
      const da = line.dash && dashArray(line.dash, line.width); if (da) p.setAttribute('stroke-dasharray', da);
      p.setAttribute('stroke-linejoin', line.join || 'round');
      p.setAttribute('stroke-linecap', line.cap === 'rnd' ? 'round' : line.cap === 'sq' ? 'square' : 'butt');
      if (i === geo.paths.length - 1 || geo.line) { if (line.head) p.setAttribute('marker-start', mk(line.head, 'h')); if (line.tail) p.setAttribute('marker-end', mk(line.tail, 't')); }
    }
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    g.append(p);
  });
  return svg;
}

function renderPic(e, ctx, map) {
  const b = boxOf(e, ctx.info);
  if (!b) return null;
  const node = h('div', { class: 'shp pic' });
  const { w, h: hh } = place(node, b, map);
  const bf = kid(e, 'blipFill');
  const blip = kid(bf, 'blip');
  const rid = rAttr(blip, 'embed') || rAttr(blip, 'link');
  const rel = rid ? ctx.deck.pkg.rel(ctx.part, rid) : null;
  const url = rel ? ctx.deck.pkg.urlNow(rel.target) : null;
  const clip = h('div', { class: 'clip' });
  const spPr = kid(e, 'spPr');
  const prst = kid(spPr, 'prstGeom');
  const pr = prst && attr(prst, 'prst');
  if (pr === 'ellipse') clip.style.borderRadius = '50%';
  else if (pr === 'roundRect') clip.style.borderRadius = Math.min(w, hh) * 0.1667 + 'px';
  if (url && !/\.(emf|wmf|tiff?|wdp)$/i.test(rel.target)) {
    const img = h('img', { src: url, draggable: 'false', alt: '' });
    const sr = kid(bf, 'srcRect');
    if (sr) {
      const l = num(sr, 'l', 0) / 100000, t = num(sr, 't', 0) / 100000, r = num(sr, 'r', 0) / 100000, bb = num(sr, 'b', 0) / 100000;
      const iw = w / Math.max(0.01, 1 - l - r), ih = hh / Math.max(0.01, 1 - t - bb);
      Object.assign(img.style, { width: iw + 'px', height: ih + 'px', left: -l * iw + 'px', top: -t * ih + 'px' });
    } else Object.assign(img.style, { width: '100%', height: '100%', left: '0', top: '0' });
    if (b.flipH || b.flipV) img.style.transform = `scale(${b.flipH ? -1 : 1},${b.flipV ? -1 : 1})`;
    clip.append(img);
  } else {
    clip.classList.add('missing');
    clip.append(h('span', { text: rel ? `그림(${extOf(rel.target).toUpperCase()}) — 이 브라우저에서 표시할 수 없음` : '그림 없음' }));
  }
  node.append(clip);
  const sd = shadowOf(e, ctx, []);
  const line = lineOf(kid(spPr, 'ln'), ctx, shapeStyleCtx(e, ctx).lnRef);
  const shs = [];
  if (line && !line.none && line.color) shs.push(`0 0 0 ${line.width}px ${css(line.color)}`);
  if (sd) shs.push(`${sd.dx.toFixed(1)}px ${sd.dy.toFixed(1)}px ${sd.blur.toFixed(1)}px ${css(sd.color)}`);
  if (shs.length) clip.style.boxShadow = shs.join(', ');
  return node;
}

function renderGrp(e, ctx, map) {
  const x = path(e, 'grpSpPr', 'xfrm');
  const node = h('div', { class: 'shp grp' });
  if (!x || !kid(x, 'off')) { renderTree(e, ctx, map, node); Object.assign(node.style, { left: 0, top: 0, width: '100%', height: '100%' }); return node; }
  const b = boxOf(e, ctx.info);
  const { w, h: hh } = place(node, b, map);
  const chOff = kid(x, 'chOff'), chExt = kid(x, 'chExt');
  const cw = num(chExt, 'cx', b.w) || b.w || 1, ch = num(chExt, 'cy', b.h) || b.h || 1;
  const inner = { cx: num(chOff, 'x', b.x), cy: num(chOff, 'y', b.y), sx: (w * EMU_PX) / cw, sy: (hh * EMU_PX) / ch };
  if (b.flipH || b.flipV) node.style.transform = `${node.style.transform || ''} scale(${b.flipH ? -1 : 1},${b.flipV ? -1 : 1})`;
  const gctx = { ...ctx, grpFill: fillOf(findFill(kid(e, 'grpSpPr')), ctx) };
  renderTree(e, { ...gctx, inGroup: true }, inner, node);
  // 그룹 안 개체는 그룹으로만 고른다
  for (const c of node.children) c.classList.remove('obj');
  return node;
}

// 표·차트·SmartArt·OLE
function renderFrame(e, ctx, map) {
  const b = boxOf(e, ctx.info);
  if (!b) return null;
  const gd = path(e, 'graphic', 'graphicData');
  const uri = attr(gd, 'uri', '');
  const node = h('div', { class: 'shp frame' });
  const { w, h: hh } = place(node, b, map);
  if (/table$/.test(uri)) { node.classList.add('tbl'); node.append(renderTable(kid(gd, 'tbl'), ctx, w, hh)); return node; }
  if (/chart$/.test(uri)) {
    const c = kid(gd, 'chart');
    const r = c ? ctx.deck.pkg.rel(ctx.part, rAttr(c, 'id')) : null;
    const doc = r ? ctx.deck.pkg.doc(r.target) : null;
    node.classList.add('chart');
    node.append(doc ? renderChart(doc, ctx, w, hh, r.target) : h('div', { class: 'ph-note', text: '차트' }));
    return node;
  }
  if (/diagram$/.test(uri)) {
    node.classList.add('dgm');
    const drawing = diagramDrawing(e, ctx);
    if (drawing) {
      const tree = desc(drawing.documentElement, 'spTree');
      const dpart = drawing._part;
      renderTree(tree, { ...ctx, part: dpart, inDiagram: true }, { cx: b.x, cy: b.y, sx: 1, sy: 1 }, node);
      for (const c of node.children) c.classList.remove('obj');
    } else node.append(h('div', { class: 'ph-note', text: 'SmartArt' }));
    return node;
  }
  // OLE 개체·기타: 안의 그림(미리보기)을 그린다
  const pic = desc(e, 'pic');
  const blip = desc(e, 'blip');
  if (pic || blip) {
    const rid = rAttr(blip, 'embed') || (pic ? rAttr(desc(pic, 'blip'), 'embed') : null);
    const rel = rid ? ctx.deck.pkg.rel(ctx.part, rid) : null;
    const url = rel ? ctx.deck.pkg.urlNow(rel.target) : null;
    if (url && !/\.(emf|wmf)$/i.test(rel.target)) { node.append(h('img', { src: url, draggable: 'false', style: 'width:100%;height:100%;display:block', alt: '' })); return node; }
  }
  node.append(h('div', { class: 'ph-note', text: /ole/i.test(uri) ? '포함된 개체' : '개체' }));
  return node;
}

function diagramDrawing(e, ctx) {
  const pkg = ctx.deck.pkg;
  const ids = desc(e, 'relIds');
  const dm = ids ? pkg.rel(ctx.part, rAttr(ids, 'dm')) : null;
  let rel = null;
  const dmDoc = dm ? pkg.doc(dm.target) : null;
  const ext = dmDoc ? desc(dmDoc.documentElement, 'dataModelExt') : null;
  if (ext && attr(ext, 'relId')) rel = pkg.rel(ctx.part, attr(ext, 'relId'));
  if (!rel) { const all = pkg.rels(ctx.part).filter(r => r.type === REL.diagramDrawing); if (all.length === 1) rel = all[0]; }
  const d = rel ? pkg.doc(rel.target) : null;
  if (d) d._part = rel.target;
  return d;
}
