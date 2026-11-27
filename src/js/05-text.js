// ───────────────────────── 글자: 서식 상속과 그리기 ─────────────────────────
// 서식은 낮은 우선순위부터 [기본 글자 서식 · 마스터 글자 서식 · 마스터 틀 · 레이아웃 틀 · 도형 자신] 순서로 쌓인다.
const KO_FALLBACK = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR',sans-serif";
const ALGN_CSS = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify', justLow: 'justify', thaiDist: 'justify' };
const CSS_ALGN = { left: 'l', start: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just' };

// 글자 서식 출처 목록 만들기 → {srcs, own}  (own = 도형 자신의 목록 수: 글꼴 참조 색보다 앞선다)
function textSources(info, sp, deck, txBody) {
  const srcs = [];
  const master = info.masterDoc && info.masterDoc.documentElement;
  const ph = phOf(sp);
  if (info.kind === 'notes') {
    srcs.push(master && kid(master, 'notesStyle'));
  } else {
    const tx = master && kid(master, 'txStyles');
    if (ph) {
      const t = normPh(phType(ph));
      srcs.push(kid(tx, t === 'title' ? 'titleStyle' : t === 'body' ? 'bodyStyle' : 'otherStyle'));
    } else {
      srcs.push(deck.defaultTextStyle);
      srcs.push(kid(tx, 'otherStyle'));
    }
  }
  if (ph) for (const anc of phChain(info, sp)) srcs.push(path(anc, 'txBody', 'lstStyle'));
  const inherited = srcs.filter(Boolean);
  const own = txBody ? kid(txBody, 'lstStyle') : null;
  return { srcs: own ? [...inherited, own] : inherited, own: own ? 1 : 0 };
}

// 단계(lvl)별 pPr 목록: 낮은 → 높은 우선순위
function levelPPrs(srcs, lvl) {
  const out = [];
  for (const s of srcs) { const d = kid(s, 'defPPr'), l = kid(s, `lvl${lvl + 1}pPr`); if (d) out.push(d); if (l) out.push(l); }
  return out;
}
const pick = (list, fn) => { for (let i = list.length - 1; i >= 0; i--) { const v = fn(list[i]); if (v != null) return v; } return null; };

// 문단 서식 풀기
function paraStyle(ts, pPr) {
  const lvl = num(pPr, 'lvl', 0);
  const inherited = levelPPrs(ts.srcs, lvl);
  const ownN = ts.own ? levelPPrs(ts.srcs.slice(-1), lvl).length : 0;
  const list = pPr ? [...inherited, pPr] : inherited;
  const a = n => pick(list, e => (e.hasAttribute(n) ? e.getAttribute(n) : null));
  const child = n => pick(list, e => kid(e, n));
  const bu = pick(list, e => kids(e).find(k => ['buNone', 'buChar', 'buAutoNum', 'buBlip'].includes(ln(k))) || null);
  return {
    lvl, algn: a('algn') || 'l', marL: +(a('marL') || 0), indent: +(a('indent') || 0), rtl: a('rtl') === '1',
    lnSpc: child('lnSpc'), spcBef: child('spcBef'), spcAft: child('spcAft'),
    bu, buClr: pick(list, e => kid(e, 'buClr') || (kid(e, 'buClrTx') ? 'tx' : null)), buSz: pick(list, e => kid(e, 'buSzPct') || kid(e, 'buSzPts') || (kid(e, 'buSzTx') ? 'tx' : null)),
    buFont: pick(list, e => kid(e, 'buFont') || (kid(e, 'buFontTx') ? 'tx' : null)),
    defRPrs: list.map(e => kid(e, 'defRPr')).filter(Boolean),
    ownDef: [...list.slice(list.length - ownN - (pPr ? 1 : 0))].map(e => kid(e, 'defRPr')).filter(Boolean),
  };
}

// 글자 서식 풀기: defRPrs(낮은→높은) + rPr
function runStyle(ps, rPr, tctx) {
  const list = rPr ? [...ps.defRPrs, rPr] : ps.defRPrs;
  const a = n => pick(list, e => (e.hasAttribute(n) ? e.getAttribute(n) : null));
  const ctx = tctx.ctx, theme = ctx.theme;
  const sz = +(a('sz') || 1800) / 100;
  // 색: 글자 자신 → 도형 자신의 목록 → 도형 서식(fontRef) → 물려받은 목록
  const ownList = rPr ? [...ps.ownDef, rPr] : ps.ownDef;
  const fillIn = l => pick(l, e => kids(e).find(k => ['solidFill', 'gradFill', 'noFill'].includes(ln(k))) || null);
  let fe = fillIn(ownList);
  let color = null;
  if (fe) color = fillColor(fe, ctx);
  else if (tctx.fontRefColor) color = tctx.fontRefColor;
  else { fe = fillIn(list); color = fe ? fillColor(fe, ctx) : colorOf(parseXML(`<a:schemeClr xmlns:a="${NS.a}" val="tx1"/>`).documentElement, ctx); }
  const face = n => { const e = pick(list, x => kid(x, n)); return e ? theme.face(attr(e, 'typeface')) : ''; };
  const ref = tctx.fontRefIdx;
  let latin = face('latin') || (ref === 'major' ? theme.fonts.majorLatin : theme.fonts.minorLatin);
  let ea = face('ea') || (ref === 'major' ? theme.fonts.majorEa : theme.fonts.minorEa);
  const hl = pick(list, e => kid(e, 'highlight'));
  const link = rPr && kid(rPr, 'hlinkClick');
  let u = a('u') || 'none';
  if (link && !rPr.hasAttribute('u')) u = 'sng';
  if (link && !(rPr && kids(rPr).some(k => ln(k) === 'solidFill'))) color = colorOf(parseXML(`<a:schemeClr xmlns:a="${NS.a}" val="hlink"/>`).documentElement, ctx);
  return {
    sz, b: a('b') === '1' || a('b') === 'true', i: a('i') === '1' || a('i') === 'true', u, strike: a('strike') || 'noStrike',
    baseline: +(a('baseline') || 0), cap: a('cap') || 'none', spc: +(a('spc') || 0),
    color, latin, ea, highlight: hl ? colorOf(hl, ctx) : null,
  };
}
function fillColor(fe, ctx) {
  const f = fillOf(fe, ctx);
  if (!f || f.type === 'none') return { r: 0, g: 0, b: 0, a: 0 };
  return f.type === 'solid' ? f.color : f.type === 'grad' ? f.stops[0].color : hexRgb('000000');
}
const fontStack = (latin, ea) => [latin, ea].filter(Boolean).map(f => `'${f.replace(/'/g, '')}'`).concat(KO_FALLBACK).join(',');

// 글자 상자 속성(bodyPr): 마스터 틀 → 레이아웃 틀 → 도형
function bodyProps(info, sp, txBody) {
  const chain = phChain(info, sp).map(a => path(a, 'txBody', 'bodyPr')).filter(Boolean);
  const own = txBody ? kid(txBody, 'bodyPr') : null;
  const list = own ? [...chain, own] : chain;
  const a = (n, d) => { const v = pick(list, e => (e.hasAttribute(n) ? e.getAttribute(n) : null)); return v == null ? d : v; };
  const fit = pick(list, e => kids(e).find(k => ['normAutofit', 'spAutoFit', 'noAutofit'].includes(ln(k))) || null);
  return {
    anchor: a('anchor', 't'), anchorCtr: a('anchorCtr', '0') === '1',
    l: px(+a('lIns', 91440)), t: px(+a('tIns', 45720)), r: px(+a('rIns', 91440)), b: px(+a('bIns', 45720)),
    wrap: a('wrap', 'square'), vert: a('vert', 'horz'), rot: +a('rot', 0) / 60000,
    fit: fit ? ln(fit) : null,
    fontScale: fit && ln(fit) === 'normAutofit' ? num(fit, 'fontScale', 100000) / 100000 : 1,
    lnRed: fit && ln(fit) === 'normAutofit' ? num(fit, 'lnSpcReduction', 0) / 100000 : 0,
  };
}

const ROMAN = n => { const m = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
const ALPHA = n => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
const GANADA = '가나다라마바사아자차카타파하';
function autoNum(type, n) {
  const circ = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  const t = type || 'arabicPeriod';
  let core = String(n);
  if (/^alphaLc/.test(t)) core = ALPHA(n); else if (/^alphaUc/.test(t)) core = ALPHA(n).toUpperCase();
  else if (/^romanLc/.test(t)) core = ROMAN(n); else if (/^romanUc/.test(t)) core = ROMAN(n).toUpperCase();
  else if (/^circleNum/.test(t)) return circ[n - 1] || `(${n})`;
  else if (/^ea1Jpn|^hangul|^ganada/i.test(t)) core = GANADA[(n - 1) % GANADA.length];
  if (/ParenBoth$/.test(t)) return `(${core})`;
  if (/ParenR$/.test(t)) return `${core})`;
  if (/Plain$/.test(t)) return core;
  if (/Minus$/.test(t)) return `- ${core} -`;
  return core + '.';
}

// 글자 상자 그리기 → div.tx(세로 정렬) > div.txi(편집 영역) > div.p(문단) > span.r(글자 조각)
function renderText(txBody, tctx, box) {
  const bp = tctx.bp;
  const outer = h('div', { class: 'tx' });
  const st = outer.style;
  st.left = (box.tl || 0) + bp.l + 'px'; st.top = (box.tt || 0) + bp.t + 'px';
  st.width = Math.max(1, box.w - (box.tl || 0) - (box.tr || 0) - bp.l - bp.r) + 'px';
  st.height = Math.max(1, box.h - (box.tt || 0) - (box.tb || 0) - bp.t - bp.b) + 'px';
  st.justifyContent = { t: 'flex-start', ctr: 'center', b: 'flex-end', just: 'center', dist: 'center' }[bp.anchor] || 'flex-start';
  const inner = h('div', { class: 'txi' });
  if (bp.wrap === 'none') { inner.style.whiteSpace = 'pre'; outer.classList.add('nowrap'); }
  if (bp.vert === 'eaVert' || bp.vert === 'vert' || bp.vert === 'wordArtVertRtl') { inner.style.writingMode = 'vertical-rl'; outer.classList.add('vert'); }
  else if (bp.vert === 'vert270') { inner.style.writingMode = 'vertical-rl'; inner.style.transform = 'rotate(180deg)'; outer.classList.add('vert'); }
  if (bp.anchorCtr) inner.style.alignSelf = 'center';
  const scale = bp.fontScale || 1;
  const paras = txBody ? kids(txBody, 'p') : [];
  const runsMap = [];
  const counters = {};
  let lastLvl = -1, empty = true;
  paras.forEach((p, pi) => {
    const pPr = kid(p, 'pPr');
    const ps = paraStyle(tctx.ts, pPr);
    const items = kids(p).filter(k => ['r', 'br', 'fld'].includes(ln(k)));
    runsMap[pi] = items;
    const div = h('div', { class: 'p', dataset: { pi: String(pi), algn: ps.algn } });
    const ds = div.style;
    ds.textAlign = ALGN_CSS[ps.algn] || 'left';
    if (ps.rtl) div.dir = 'rtl';
    // 문단의 기본 글자(빈 줄 높이·새로 쓰는 글자)
    const endR = kid(p, 'endParaRPr');
    const firstR = items.find(k => ln(k) === 'r');
    const baseStyle = runStyle(ps, (firstR && kid(firstR, 'rPr')) || endR, tctx);
    const fsz = baseStyle.sz * scale;
    applyRunCss(div, baseStyle, scale);
    markRun(div, baseStyle);
    // 줄 간격
    const lnPct = ps.lnSpc && kid(ps.lnSpc, 'spcPct') ? num(kid(ps.lnSpc, 'spcPct'), 'val', 100000) / 100000 : null;
    const lnPts = ps.lnSpc && kid(ps.lnSpc, 'spcPts') ? num(kid(ps.lnSpc, 'spcPts'), 'val', 0) / 100 : null;
    if (lnPts) ds.lineHeight = ptPx(lnPts * scale) + 'px';
    else ds.lineHeight = String(Math.max(0.5, (lnPct || 1) - bp.lnRed) * 1.2);
    const sp = (e, size) => { if (!e) return 0; const pc = kid(e, 'spcPct'), pt = kid(e, 'spcPts'); return pt ? ptPx(num(pt, 'val', 0) / 100) : pc ? ptPx(size) * 1.2 * num(pc, 'val', 0) / 100000 : 0; };
    ds.marginTop = (pi === 0 ? 0 : sp(ps.spcBef, fsz)) + 'px';
    ds.marginBottom = sp(ps.spcAft, fsz) + 'px';
    const marL = px(ps.marL), ind = px(ps.indent);
    ds.paddingLeft = marL + 'px';
    // 글머리표
    const buKind = ps.bu ? ln(ps.bu) : 'buNone';
    const hasText = items.some(k => ln(k) !== 'br' && (k.textContent || '').length);
    if (!(ps.lvl in counters) || buKind !== 'buAutoNum') { /* 번호 아닌 문단이 끼면 끊긴다 */ }
    if (ps.lvl < lastLvl) for (const k of Object.keys(counters)) if (+k > ps.lvl) delete counters[k];
    if (buKind !== 'buAutoNum') delete counters[ps.lvl];
    lastLvl = ps.lvl;
    let buText = null;
    if (hasText && buKind === 'buChar') buText = attr(ps.bu, 'char', '•');
    else if (hasText && buKind === 'buAutoNum') {
      const start = num(ps.bu, 'startAt', 1);
      counters[ps.lvl] = (counters[ps.lvl] || start - 1) + 1;
      buText = autoNum(attr(ps.bu, 'type'), counters[ps.lvl]);
    }
    if (buText != null) {
      const bu = h('span', { class: 'bu', contenteditable: 'false', text: buText });
      const bs = bu.style;
      let bsz = baseStyle.sz * scale;
      if (ps.buSz && ps.buSz !== 'tx') bsz = ln(ps.buSz) === 'buSzPct' ? bsz * num(ps.buSz, 'val', 100000) / 100000 : num(ps.buSz, 'val', 0) / 100 * scale;
      bs.fontSize = ptPx(bsz) + 'px';
      const bc = ps.buClr && ps.buClr !== 'tx' ? colorOf(ps.buClr, tctx.ctx) : baseStyle.color;
      bs.color = css(bc);
      if (ps.buFont && ps.buFont !== 'tx') bs.fontFamily = fontStack(tctx.ctx.theme.face(attr(ps.buFont, 'typeface')), '');
      if (ind < 0) { bs.display = 'inline-block'; bs.width = -ind + 'px'; bs.marginLeft = ind + 'px'; bs.textIndent = '0'; }
      else { bs.marginLeft = ind + 'px'; bs.paddingRight = '0.4em'; }
      div.append(bu);
    } else if (ind) ds.textIndent = ind + 'px';
    items.forEach((it, ri) => {
      const k = ln(it);
      if (k === 'br') { div.append(h('br', { dataset: { ri: String(ri), pi: String(pi) } })); return; }
      const rPr = kid(it, 'rPr');
      const rs = runStyle(ps, rPr, tctx);
      let text = (kid(it, 't') || {}).textContent || '';
      if (k === 'fld') {
        const ft = attr(it, 'type', '');
        if (/^slidenum/.test(ft) && tctx.slideNo) text = String(tctx.slideNo);
        else if (/^datetime/.test(ft) && !text) text = new Date().toLocaleDateString('ko-KR');
      }
      if (!text) return;
      empty = false;
      const span = h('span', { class: 'r', dataset: { ri: String(ri), pi: String(pi) } }, text);
      applyRunCss(span, rs, scale);
      markRun(span, rs);
      if (k === 'fld') { span.contentEditable = 'false'; span.dataset.fld = '1'; }
      div.append(span);
    });
    if (!div.querySelector('.r')) div.append(h('br', { dataset: { ph: '1' } }));   // 빈 문단(높이 유지·편집 가능)
    inner.append(div);
  });
  if (!paras.length) inner.append(h('div', { class: 'p', dataset: { pi: '0' } }, h('br', { dataset: { ph: '1' } })));
  inner._txBody = txBody; inner._paras = paras; inner._runs = runsMap; inner._scale = scale; inner._tctx = tctx;
  outer._inner = inner; outer._empty = empty;
  outer.append(inner);
  return outer;
}

function applyRunCss(e, rs, scale) {
  const s = e.style;
  s.fontSize = ptPx(rs.sz * scale) + 'px';
  s.fontFamily = fontStack(rs.latin, rs.ea);
  s.fontWeight = rs.b ? '700' : '400';
  s.fontStyle = rs.i ? 'italic' : 'normal';
  const deco = [rs.u !== 'none' ? 'underline' : '', rs.strike !== 'noStrike' ? 'line-through' : ''].filter(Boolean).join(' ');
  s.textDecoration = deco || 'none';
  if (rs.u === 'dbl') s.textDecorationStyle = 'double';
  s.color = css(rs.color);
  if (rs.highlight) s.backgroundColor = css(rs.highlight);
  if (rs.spc) s.letterSpacing = ptPx(rs.spc / 100) + 'px';
  if (rs.cap === 'all') s.textTransform = 'uppercase'; else if (rs.cap === 'small') s.fontVariant = 'small-caps';
  if (rs.baseline) { s.verticalAlign = rs.baseline > 0 ? 'super' : 'sub'; s.fontSize = ptPx(rs.sz * scale * 0.66) + 'px'; }
}
// 그릴 때의 서식을 적어 둔다(편집 후 무엇이 바뀌었는지 비교)
function markRun(e, rs) {
  const d = e.dataset;
  d.b = rs.b ? '1' : '0'; d.i = rs.i ? '1' : '0'; d.u = rs.u !== 'none' ? '1' : '0'; d.s = rs.strike !== 'noStrike' ? '1' : '0';
  d.c = rs.color && rs.color.a > 0 ? toHex(rs.color) : '';
  d.sz = String(Math.round(rs.sz * 100));
  d.szpx = String(parseFloat(e.style.fontSize));
  d.ff = e.style.fontFamily;
}
