// ───────────────────────── 표 ─────────────────────────
// 표 서식: tableStyles.xml 에 있으면 그것, 없으면 PowerPoint 기본 제공 서식 몇 가지를 흉내 낸다
const BUILTIN_TBL = {
  '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': ['medium2', 'accent1'], '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}': ['medium2', 'accent2'],
  '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': ['medium2', 'accent3'], '{00A15C55-8517-42AA-B614-E9B94910E393}': ['medium2', 'accent4'],
  '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': ['medium2', 'accent5'], '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': ['medium2', 'accent6'],
  '{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}': ['medium2', 'dk1'],
  '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': ['none', null], '{5940675A-B579-460E-94D1-54222C63F5DA}': ['grid', null],
  '{9D7B26C5-4107-4FEC-AEDC-1716B250EE53}': ['light1', 'dk1'], '{3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5}': ['light1', 'accent1'],
  '{69012ECD-51FC-41F1-AA8D-1B2483CD663E}': ['light2', 'accent1'], '{BC89EF96-8CEA-46FF-86C4-4CE0E7609802}': ['light3', 'accent1'],
};
function builtinTableStyle(kind, accent, ctx) {
  const C = (val, mods = '') => colorOf(parseXML(`<a:schemeClr xmlns:a="${NS.a}" val="${val}">${mods}</a:schemeClr>`).documentElement, ctx);
  const white = C('lt1'), dark = C('dk1');
  const ln = (c, w = 1) => ({ color: c, width: w });
  if (kind === 'none') return {};
  if (kind === 'grid') { const L = ln(dark); return { wholeTbl: { bd: { left: L, right: L, top: L, bottom: L, insideH: L, insideV: L } } }; }
  const A = accent || 'accent1';
  if (kind === 'medium2') {
    const L = ln(white, 1.33);
    return {
      wholeTbl: { fill: C(A, '<a:tint val="20000"/>'), txColor: dark, bd: { left: L, right: L, top: L, bottom: L, insideH: L, insideV: L } },
      band1H: { fill: C(A, '<a:tint val="40000"/>') }, band1V: { fill: C(A, '<a:tint val="40000"/>') },
      firstRow: { fill: C(A), txColor: white, b: true, bd: { bottom: ln(white, 4) } },
      lastRow: { fill: C(A), txColor: white, b: true, bd: { top: ln(white, 4) } },
      firstCol: { fill: C(A), txColor: white, b: true }, lastCol: { fill: C(A), txColor: white, b: true },
    };
  }
  // light 서식: 흰 바탕, 선만
  const L = ln(C(A));
  return {
    wholeTbl: { txColor: dark, bd: { top: L, bottom: L } },
    band1H: { fill: C(A, '<a:tint val="20000"/>') },
    firstRow: { b: true, bd: { bottom: L }, txColor: kind === 'light2' ? white : dark, fill: kind === 'light2' ? C(A) : null },
    lastRow: { b: true, bd: { top: L } },
  };
}
// tableStyles.xml 의 a:tblStyle → 같은 모양
function parseTableStyle(st, ctx) {
  const out = {};
  for (const part of kids(st)) {
    const nm = ln(part);
    const tx = kid(part, 'tcTxStyle'), tc = kid(part, 'tcStyle');
    const o = {};
    if (tx) { o.b = attr(tx, 'b') === 'on'; o.i = attr(tx, 'i') === 'on'; const c = colorOf(tx, ctx); if (c) o.txColor = c; else if (kid(tx, 'fontRef')) o.txColor = colorOf(kid(tx, 'fontRef'), ctx); }
    if (tc) {
      const f = kid(tc, 'fill');
      if (f) { const fi = fillOf(findFill(f), ctx); if (fi && fi.type === 'solid') o.fill = fi.color; else if (fi && fi.type === 'none') o.fill = 'none'; }
      const fr = kid(tc, 'fillRef'); if (!f && fr) { const fi = styleFill(fr, ctx); if (fi && fi.type === 'solid') o.fill = fi.color; }
      const bd = kid(tc, 'tcBdr');
      if (bd) {
        o.bd = {};
        for (const side of ['left', 'right', 'top', 'bottom', 'insideH', 'insideV']) {
          const s = kid(bd, side);
          if (!s) continue;
          const lnE = kid(s, 'ln');
          const l = lnE ? lineOf(lnE, ctx, null) : lineOf(null, ctx, kid(s, 'lnRef'));
          o.bd[side] = l && !l.none && l.color ? { color: l.color, width: l.width } : null;
        }
      }
    }
    out[nm] = o;
  }
  return out;
}

function renderTable(tbl, ctx, w, hh) {
  const pkg = ctx.deck;
  const tblPr = kid(tbl, 'tblPr');
  const flags = { firstRow: bool(tblPr, 'firstRow'), lastRow: bool(tblPr, 'lastRow'), firstCol: bool(tblPr, 'firstCol'), lastCol: bool(tblPr, 'lastCol'), bandRow: bool(tblPr, 'bandRow'), bandCol: bool(tblPr, 'bandCol') };
  const sid = (kid(tblPr, 'tableStyleId') || {}).textContent || '';
  let style = {};
  const found = pkg.tableStyles && kids(pkg.tableStyles.documentElement, 'tblStyle').find(s => attr(s, 'styleId') === sid);
  if (found) style = parseTableStyle(found, ctx);
  else if (BUILTIN_TBL[sid]) style = builtinTableStyle(BUILTIN_TBL[sid][0], BUILTIN_TBL[sid][1], ctx);
  else if (sid) style = builtinTableStyle('medium2', 'accent1', ctx);
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(c => px(num(c, 'w', 0)));
  const rows = kids(tbl, 'tr');
  const table = h('table', { class: 'ptbl' });
  const cg = h('colgroup');
  cols.forEach(cw => cg.append(h('col', { style: `width:${cw}px` })));
  table.append(cg);
  const nR = rows.length, nC = cols.length;
  rows.forEach((tr, ri) => {
    const row = h('tr', { style: `height:${px(num(tr, 'h', 0))}px` });
    kids(tr, 'tc').forEach((tc, ci) => {
      if (bool(tc, 'hMerge') || bool(tc, 'vMerge')) return;
      const td = h('td');
      const gs = num(tc, 'gridSpan', 1), rs = num(tc, 'rowSpan', 1);
      if (gs > 1) td.colSpan = gs;
      if (rs > 1) td.rowSpan = rs;
      // 서식 겹치기: 낮은 → 높은 우선순위
      const parts = [style.wholeTbl];
      const bodyR = flags.firstRow ? ri - 1 : ri;
      if (flags.bandCol) parts.push((flags.firstCol ? ci - 1 : ci) % 2 === 0 ? style.band1V : style.band2V);
      if (flags.bandRow && !(flags.firstRow && ri === 0) && !(flags.lastRow && ri === nR - 1)) parts.push(bodyR % 2 === 0 ? style.band1H : style.band2H);
      if (flags.lastCol && ci + gs - 1 === nC - 1) parts.push(style.lastCol);
      if (flags.firstCol && ci === 0) parts.push(style.firstCol);
      if (flags.lastRow && ri === nR - 1) parts.push(style.lastRow);
      if (flags.firstRow && ri === 0) parts.push(style.firstRow);
      const P = parts.filter(Boolean);
      const get = k => { for (let i = P.length - 1; i >= 0; i--) if (P[i][k] != null) return P[i][k]; return null; };
      const bdOf = side => { for (let i = P.length - 1; i >= 0; i--) if (P[i].bd && side in P[i].bd) return P[i].bd[side]; return null; };
      const tcPr = kid(tc, 'tcPr');
      let fill = get('fill');
      const own = findFill(tcPr);
      if (own) { const f = fillOf(own, ctx); fill = f.type === 'solid' ? f.color : f.type === 'none' ? 'none' : fill; }
      if (fill && fill !== 'none') td.style.background = css(fill);
      const side = (name, ownTag, isEdge, edge, inner) => {
        const o = kid(tcPr, ownTag);
        let l = null;
        if (o) { const x = lineOf(o, ctx, null); l = x && !x.none && x.color ? { color: x.color, width: x.width } : 'none'; }
        else l = bdOf(isEdge ? edge : inner);
        if (l && l !== 'none') td.style['border' + name] = `${Math.max(0.5, l.width)}px solid ${css(l.color)}`;
      };
      side('Left', 'lnL', ci === 0, 'left', 'insideV');
      side('Right', 'lnR', ci + gs >= nC, 'right', 'insideV');
      side('Top', 'lnT', ri === 0, 'top', 'insideH');
      side('Bottom', 'lnB', ri + rs >= nR, 'bottom', 'insideH');
      const mar = k => px(num(tcPr, k, k === 'marL' || k === 'marR' ? 91440 : 45720));
      td.style.padding = `${mar('marT')}px ${mar('marR')}px ${mar('marB')}px ${mar('marL')}px`;
      td.style.verticalAlign = { ctr: 'middle', b: 'bottom' }[attr(tcPr, 'anchor', 't')] || 'top';
      // 글자: 기본 서식 + 표 서식의 굵게·색
      const txBody = kid(tc, 'txBody');
      const ts = textSources({ ...ctx.info, kind: ctx.info.kind }, tc, ctx.deck, txBody);
      const bold = get('b');
      const tctx = { ts, ctx, bp: { anchor: 't', l: 0, t: 0, r: 0, b: 0, wrap: 'square', vert: 'horz', fontScale: 1, lnRed: 0 }, slideNo: ctx.slideNo, fontRefColor: get('txColor'), fontRefIdx: null };
      const tx = renderText(txBody, tctx, { w: 10, h: 10 });
      tx.classList.add('cell');
      Object.assign(tx.style, { position: 'static', width: 'auto', height: 'auto' });
      if (bold) for (const r of tx.querySelectorAll('.r, .p')) if (r.style.fontWeight === '400' && !hasExplicit(r, txBody, 'b')) { r.style.fontWeight = '700'; r.dataset.b = '1'; }
      td._tc = tc;
      td.append(tx);
      row.append(td);
    });
    table.append(row);
  });
  void w; void hh;
  return table;
}
// 글자 조각에 b 를 직접 정했는지
function hasExplicit(span, txBody, a) {
  const p = span.closest('.p');
  if (!p || !txBody) return false;
  const para = kids(txBody, 'p')[+p.dataset.pi];
  if (!para) return false;
  if (!span.classList.contains('r')) return false;
  const run = kids(para).filter(k => ['r', 'br', 'fld'].includes(ln(k)))[+span.dataset.ri];
  const rPr = run && kid(run, 'rPr');
  return !!(rPr && rPr.hasAttribute(a));
}
