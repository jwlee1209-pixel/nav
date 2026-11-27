// ───────────────────────── 발표 자료 모형: 슬라이드·레이아웃·마스터·테마 ─────────────────────────
class Deck {
  constructor(pkg, name) {
    this.pkg = pkg; this.name = name || '발표 자료.pptx';
    this.themes = new Map();
  }
  static async open(buf, name) {
    const pkg = await Pkg.open(buf);
    const d = new Deck(pkg, name);
    d.init();
    await pkg.preloadImages();
    return d;
  }
  init() {
    const pkg = this.pkg;
    const root = pkg.rels('_rels/.rels') ;
    const off = pkg.doc('_rels/.rels') ? kids(pkg.doc('_rels/.rels').documentElement, 'Relationship').find(e => /officeDocument$/.test(e.getAttribute('Type'))) : null;
    this.presPath = off ? resolvePath('', off.getAttribute('Target')) : 'ppt/presentation.xml';
    void root;
    const pres = pkg.doc(this.presPath);
    if (!pres || ln(pres.documentElement) !== 'presentation') throw new Error('PowerPoint 발표 자료(.pptx)가 아닙니다.');
    const sz = kid(pres.documentElement, 'sldSz');
    this.W = px(num(sz, 'cx', 9144000)); this.H = px(num(sz, 'cy', 6858000));
  }
  // 실행 취소가 부분 문서를 통째로 바꾸므로 늘 꾸러미에서 새로 찾는다
  get pres() { return this.pkg.doc(this.presPath); }
  get defaultTextStyle() { return kid(this.pres.documentElement, 'defaultTextStyle'); }
  get tableStyles() { const ts = this.pkg.relOfType(this.presPath, REL.tableStyles); return ts ? this.pkg.doc(ts.target) : null; }
  // 슬라이드 순서(sldIdLst) → 경로
  get slides() {
    const lst = kid(this.pres.documentElement, 'sldIdLst');
    return kids(lst, 'sldId').map(e => { const r = this.pkg.rel(this.presPath, rAttr(e, 'id')); return r ? r.target : null; }).filter(Boolean);
  }
  theme(path) {
    if (!this.themes.has(path)) this.themes.set(path, new Theme(this.pkg.doc(path)));
    return this.themes.get(path);
  }
  // 슬라이드(또는 레이아웃·마스터·메모) 하나의 정보
  info(partPath) {
    const pkg = this.pkg;
    const doc = pkg.doc(partPath);
    const kind = doc ? ln(doc.documentElement) : null;   // sld · sldLayout · sldMaster · notes
    let layoutPath = null, masterPath = null;
    if (kind === 'sld') { const r = pkg.relOfType(partPath, REL.layout); layoutPath = r && r.target; }
    if (kind === 'sldLayout') layoutPath = partPath;
    if (layoutPath) { const r = pkg.relOfType(layoutPath, REL.master); masterPath = r && r.target; }
    if (kind === 'sldMaster') masterPath = partPath;
    if (kind === 'notes') { const r = pkg.relOfType(partPath, REL.notesMaster); masterPath = r && r.target; }
    const masterDoc = masterPath ? pkg.doc(masterPath) : null;
    const themeRel = masterPath ? pkg.relOfType(masterPath, REL.theme) : null;
    const theme = this.theme(themeRel ? themeRel.target : null);
    // 색 맵: 마스터 clrMap, 레이아웃·슬라이드의 overrideClrMapping
    let clrMap = clrMapOf(masterDoc && kid(masterDoc.documentElement, 'clrMap'));
    for (const p of [layoutPath !== partPath ? layoutPath : null, partPath]) {
      const d = p && pkg.doc(p);
      const o = d && path(d.documentElement, 'clrMapOvr', 'overrideClrMapping');
      if (o) clrMap = clrMapOf(o);
    }
    return {
      path: partPath, kind, doc,
      layoutPath, layoutDoc: layoutPath ? pkg.doc(layoutPath) : null,
      masterPath, masterDoc, theme, clrMap,
    };
  }
}

// ── 개체 틀(placeholder) 찾기 ──
const phOf = sp => { const nv = kids(sp).find(k => /^nv/.test(ln(k))); return nv ? path(nv, 'nvPr', 'ph') : null; };
function phType(ph) { return ph ? attr(ph, 'type', 'body') : null; }   // type 없으면 body(내용)
function normPh(t) { return t === 'ctrTitle' ? 'title' : (t === 'subTitle' || t === 'obj' || t === 'body') ? 'body' : t; }
function spTreeOf(doc) { return doc ? path(doc.documentElement, 'cSld', 'spTree') : null; }
function allPh(doc) {
  const out = [];
  const walk = tree => { for (const c of kids(tree)) { const n = ln(c); if (n === 'grpSp') walk(c); else if (n !== 'nvGrpSpPr' && n !== 'grpSpPr') { const ph = phOf(c); if (ph) out.push({ el: c, ph }); } } };
  walk(spTreeOf(doc));
  return out;
}
// 슬라이드 개체 틀 → 레이아웃 → 마스터 순서로 같은 틀 찾기
function findPh(doc, ph, isMaster) {
  if (!doc || !ph) return null;
  const list = allPh(doc);
  const idx = attr(ph, 'idx'), type = phType(ph);
  if (!isMaster && idx != null) {
    const byIdx = list.find(x => attr(x.ph, 'idx') === idx);
    if (byIdx) return byIdx.el;
  }
  const t = normPh(type);
  const byType = list.find(x => phType(x.ph) === type) || list.find(x => normPh(phType(x.ph)) === t);
  return byType ? byType.el : null;
}
// 상속 사슬: [마스터 틀, 레이아웃 틀]
function phChain(info, sp) {
  const ph = phOf(sp);
  if (!ph) return [];
  const out = [];
  if (info.kind === 'sld' || info.kind === 'notes') {
    const lay = info.kind === 'sld' ? findPh(info.layoutDoc, ph, false) : null;
    const mas = findPh(info.masterDoc, lay ? phOf(lay) : ph, true);
    if (mas) out.push(mas);
    if (lay) out.push(lay);
  } else if (info.kind === 'sldLayout') {
    const mas = findPh(info.masterDoc, ph, true);
    if (mas) out.push(mas);
  }
  return out;
}
